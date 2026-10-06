import { expect, it } from 'vitest';
import fixture from '../sources/flights/fixtures/google-booking.json';
import { profileSchema } from '../profiles';
import { parseExploreCards } from '../sources/google-explore';
import { exactFlight } from '../sources/flights/google-exact';
import { flightComparison, flightEligibility, flightIdentity, monitoringLane } from './pipeline';

const profile = profileSchema.parse({ name: 'Pipeline fixture', origins: ['LJU'], destination: { kind: 'anywhere' }, dates: { mode: 'rolling', days: 365 }, duration: { minNights: 5, maxNights: 12 }, passengers: { adults: 2 }, cabin: 'business', positioning: { homeAirports: ['LJU'] } });
const discovery = parseExploreCards([{ entity: '/m/05qtj', name: 'Paris', flightPrice: '961', currency: 'EUR', stops: '1 stop', duration: '3 hr 30 min' }], { origin: 'LJU', destination: null, departure: '2027-04-01', returnDate: '2027-04-07' }, profile, new Date('2026-10-06'))[0]!;
const exact = exactFlight(discovery, profile, fixture.url, fixture.legs, fixture.fares, new Date('2026-10-06'))!;

it('separates broad price history from selected fare history and distinguishes party and fare conditions', () => {
  expect(flightComparison(discovery)).not.toBe(flightComparison(exact));
  expect(flightIdentity({ ...exact, amount: 900 })).toBe(flightIdentity(exact));
  expect(flightIdentity({ ...exact, passengers: { ...exact.passengers, adults: 1 } })).not.toBe(flightIdentity(exact));
  expect(flightComparison({ ...exact, checkedBags: 2 })).not.toBe(flightComparison(exact));
});
it('does not turn missing transfer evidence into eligibility and enforces constraints at ingestion', () => {
  expect(flightEligibility(exact, profile)).toContain('self_transfer_unconfirmed');
  const confirmed = { ...exact, selfTransfer: false };
  expect(flightEligibility(confirmed, profile)).toEqual([]);
  expect(flightEligibility(confirmed, { ...profile, flight: { ...profile.flight, excludedAirlines: ['VL'], excludedAirports: ['MUC'], maxLayoverMinutes: 120 } })).toEqual(expect.arrayContaining(['excluded_airline', 'excluded_airport', 'layovers']));
  expect(flightEligibility({ ...confirmed, origin: 'VIE' }, profile)).toContain('positioning_unavailable');
});
it('uses HOT only above threshold, watches warming history and backs off ineligible itineraries', () => {
  expect(monitoringLane(90, 80, true)).toBe('HOT');
  expect(monitoringLane(null, 80, true)).toBe('WATCH');
  expect(monitoringLane(99, 80, false)).toBe('COLD');
});
