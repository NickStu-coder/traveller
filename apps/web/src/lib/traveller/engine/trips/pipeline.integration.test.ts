import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '../../../prisma';
import { profileSchema } from '../../profiles';
import { saveProfile } from '../../profile-store';
import { exactFlight } from '../../sources/flights/google-exact';
import flightFixture from '../../sources/flights/fixtures/google-booking.json';
import { parseExploreCards } from '../../sources/google-explore';
import { googleHotelCandidates } from '../../sources/hotels/google-hotel';
import hotelFixture from '../../sources/hotels/fixtures/google-property.json';
import { DEFAULT_HOTEL_FILTERS } from '../../../hotels/types';
import { flightComparison, flightIdentity, recordFlights } from '../pipeline';
import { DEFAULT_WEIGHTS } from '../policy';
import { DEFAULT_SCHEDULER } from '../../scheduler/policy';
import { hotelComparison, hotelIdentity, recordHotels } from './pipeline';

const enabled = process.env.TRAVELLER_DATABASE_TESTS === '1';
const owners = ['traveller-trip-' + randomUUID(), 'traveller-trip-other-' + randomUUID()];
let validated = false;
beforeAll(async () => {
  if (!enabled) return;
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (url.pathname !== '/traveller_test' || !['database', 'localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Trip integration requires the dedicated traveller_test database');
  validated = true;
  for (const id of owners) await prisma.user.create({ data: { id, username: id } });
});
afterAll(async () => {
  if (!validated) return;
  const profiles = await prisma.watchProfile.findMany({ where: { userId: { in: owners } }, select: { id: true } });
  const ids = profiles.map(profile => profile.id);
  await prisma.travelAlertDelivery.deleteMany({ where: { travellerAlert: { profileId: { in: ids } } } });
  await prisma.travellerAlert.deleteMany({ where: { profileId: { in: ids } } });
  await prisma.travellerTrip.deleteMany({ where: { profileId: { in: ids } } });
  await prisma.travellerVerification.deleteMany({ where: { observation: { profileId: { in: ids } } } });
  await prisma.travellerObservation.deleteMany({ where: { profileId: { in: ids } } });
  await prisma.travellerJob.deleteMany({ where: { profileId: { in: ids } } });
  await prisma.watchProfileRevision.deleteMany({ where: { profileId: { in: ids } } });
  await prisma.watchProfile.deleteMany({ where: { id: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: owners } } });
  await prisma.$disconnect();
});

it.skipIf(!enabled)('pairs local stays with whole-party prices, retains changed rates, fences foreign components and requires measured trip history', async () => {
  const constraints = profileSchema.parse({ name: 'Private trip', origins: ['LJU'], destination: { kind: 'anywhere' }, dates: { mode: 'rolling', days: 365 }, duration: { minNights: 5, maxNights: 12 }, passengers: { adults: 2 }, cabin: 'business', flight: { allowSelfTransfer: true }, positioning: { homeAirports: ['LJU'] } });
  const profile = await saveProfile(owners[0]!, constraints), other = await saveProfile(owners[1]!, constraints);
  const broad = parseExploreCards([{ entity: '/m/05qtj', name: 'Paris', flightPrice: '961', currency: 'EUR', stops: '1 stop', duration: '3 hr 30 min' }], { origin: 'LJU', destination: null, departure: '2027-04-01', returnDate: '2027-04-07' }, constraints)[0]!;
  const flight = { ...exactFlight(broad, constraints, flightFixture.url, flightFixture.legs, flightFixture.fares)!, observedAt: new Date(Date.now() - 4000).toISOString() };
  const hotel = googleHotelCandidates(hotelFixture, { hotelName: 'MOB HOUSE', header: 'MOB HOUSE•4-star tourist hotel', reviewLabel: '4.3 out of 5 stars from 1,135 reviews', amenities: [] },
    { destination: 'Paris', dateMode: 'fixed', checkIn: '2027-04-01', checkOut: '2027-04-07', flexibility: 0, minNights: 6, maxNights: 6, rooms: [{ adults: 2, children: [] }], currency: 'EUR', sources: ['google_hotels'], filters: DEFAULT_HOTEL_FILTERS },
    { checkIn: '2027-04-01', checkOut: '2027-04-07' }, new Date(Date.now() - 2000))[0]!;
  for (let day = 1; day <= 12; day++) {
    for (const [kind, candidate, identity, comparisonKey] of [['flight', flight, flightIdentity(flight), flightComparison(flight)], ['hotel', hotel, hotelIdentity(hotel), hotelComparison(hotel)]] as const)
      await prisma.travellerObservation.create({ data: { profileId: profile.id, profileRevision: 1, kind, source: candidate.source, provenance: 'cached', identity, comparisonKey, observedAt: new Date(Date.now() - day * 86400000), amount: '2000', currency: 'EUR', details: candidate as unknown as Prisma.InputJsonValue } });
  }
  const job = await prisma.travellerJob.create({ data: { profileId: profile.id, profileRevision: 1, source: 'google_flights', kind: 'verification', dedupKey: randomUUID() } });
  const engine = { baseCurrency: 'EUR', weights: DEFAULT_WEIGHTS };
  await prisma.$transaction(tx => recordFlights(tx, job, owners[0]!, constraints, [flight], engine, null, DEFAULT_SCHEDULER));
  const flightObservation = await prisma.travellerObservation.findFirstOrThrow({ where: { profileId: profile.id, source: 'google_flights', observedAt: new Date(flight.observedAt) } });
  const ingest = (candidate: typeof hotel) => prisma.$transaction(tx => recordHotels(tx, job, owners[0]!, constraints, flightObservation, flight, [candidate], engine, null));
  await ingest(hotel);
  const trip = await prisma.travellerObservation.findFirstOrThrow({ where: { profileId: profile.id, kind: 'trip' } });
  expect(trip.amount.toString()).toBe('1808');
  expect(trip.details).toMatchObject({ checkIn: '2027-04-01', checkOut: '2027-04-07', nights: 6, costs: { flight: { amount: '961.0000' }, hotel: { amount: '847.0000' }, positioning: { amount: '0' } } });
  expect(trip.score).toMatchObject({ score: null, confidence: 'medium' });
  expect(await prisma.travellerAlert.count({ where: { profileId: profile.id, observation: { kind: 'trip' } } })).toBe(0);
  expect(await prisma.travellerAlert.count({ where: { profileId: profile.id, observation: { kind: 'hotel' } } })).toBe(1);
  await expect(prisma.travellerTrip.create({ data: { profileId: other.id, observationId: trip.id, flightObservationId: flightObservation.id, hotelObservationId: 'foreign-hotel' } })).rejects.toMatchObject({ code: 'P2003' });
  for (let day = 1; day <= 12; day++) await prisma.travellerObservation.create({ data: { profileId: profile.id, profileRevision: 1, kind: 'trip', source: 'combined', provenance: 'cached', identity: trip.identity, comparisonKey: trip.comparisonKey,
    observedAt: new Date(Date.now() - day * 86400000), amount: '5000', currency: 'EUR', details: trip.details as Prisma.InputJsonValue } });
  await ingest({ ...hotel, amount: 800, observedAt: new Date().toISOString() });
  expect(await prisma.travellerTrip.count({ where: { profileId: profile.id } })).toBe(2);
  const latest = await prisma.travellerObservation.findFirstOrThrow({ where: { profileId: profile.id, kind: 'trip' }, orderBy: { observedAt: 'desc' } });
  expect(latest.amount.toString()).toBe('1761');
  expect(latest.score).toMatchObject({ confidence: 'medium', eligibility: [], evidence: { ready: true } });
  expect(await prisma.travellerAlert.count({ where: { profileId: profile.id, observation: { kind: 'trip' } } })).toBe(1);
  expect((await prisma.travellerObservation.findUniqueOrThrow({ where: { id: trip.id } })).amount.toString()).toBe('1808');
});
