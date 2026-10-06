import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { prisma } from '../../prisma';
import type { Prisma } from '@/generated/prisma/client';
import { saveProfile } from '../profile-store';
import { profileSchema } from '../profiles';
import { googleExploreAdapter } from '../sources/explore-adapter';
import { parseExploreCards } from '../sources/google-explore';
import { reserveSourceRequest, scheduleTravellerDiscovery } from './store';
import { runTravellerJob } from './worker';
import { googleExactAdapter } from '../sources/flights/exact-adapter';
import { exactFlight } from '../sources/flights/google-exact';
import fixture from '../sources/flights/fixtures/google-booking.json';
import { SourceError } from '../sources/types';

const owner = 'traveller-worker-test-' + randomUUID();
const profile = profileSchema.parse({ name: 'Worker fixture', origins: ['LJU'], destination: { kind: 'anywhere' }, dates: { mode: 'rolling', days: 365 }, duration: { minNights: 5, maxNights: 12 }, passengers: { adults: 2 }, cabin: 'business', positioning: { homeAirports: ['LJU'] } });
describe.skipIf(process.env.TRAVELLER_DATABASE_TESTS !== '1')('Traveller PostgreSQL worker fencing', () => {
  let sourceCreated = false;
  let exactSourceCreated = false;
  let databaseValidated = false;
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? '');
    if (!['database', 'localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/traveller_test') throw new Error('Worker integration requires the dedicated traveller_test database');
    databaseValidated = true;
    if (await prisma.travellerSourceState.findUnique({ where: { source: 'google_explore' } })) throw new Error('Worker fixture requires a clean source catalog in the isolated test database');
    await prisma.user.create({ data: { id: owner, username: owner } });
    await prisma.travellerSourceState.create({ data: { source: 'google_explore', enabled: true, capabilities: ['flight_discovery'], budgetPerDay: 2 } });
    sourceCreated = true;
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    if (!databaseValidated) return;
    const profiles = await prisma.watchProfile.findMany({ where: { userId: owner }, select: { id: true } });
    const ids = profiles.map(value => value.id);
    await prisma.travellerVerification.deleteMany({ where: { observation: { profileId: { in: ids } } } });
    await prisma.travellerObservation.deleteMany({ where: { profileId: { in: ids } } });
    await prisma.travellerJob.deleteMany({ where: { profileId: { in: ids } } });
    await prisma.watchProfileRevision.deleteMany({ where: { profileId: { in: ids } } });
    await prisma.watchProfile.deleteMany({ where: { id: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: owner } });
    if (sourceCreated) await prisma.travellerSourceState.delete({ where: { source: 'google_explore' } });
    if (exactSourceCreated) await prisma.travellerSourceState.delete({ where: { source: 'google_flights' } });
    await prisma.$disconnect();
  });
  it('queues once, budgets execution and rejects results after the profile revision changes', async () => {
    const saved = await saveProfile(owner, profile);
    const now = new Date();
    expect(await scheduleTravellerDiscovery(now)).toBe(1);
    expect(await scheduleTravellerDiscovery(now)).toBe(0);
    expect(await prisma.travellerJob.count({ where: { profileId: saved.id } })).toBe(1);
    const adapter = vi.spyOn(googleExploreAdapter, 'discover').mockImplementation(async (request, context) => {
      await context.reserveRequest();
      return parseExploreCards([{ entity: '/m/05qtj', name: 'Paris', flightPrice: '961', currency: 'EUR', stops: '1 stop', duration: '3 hr 30 min' }], request, context.profile);
    });
    expect(await runTravellerJob()).toBe(true);
    const job = await prisma.travellerJob.findFirstOrThrow({ where: { profileId: saved.id } });
    expect(job).toMatchObject({ state: 'completed', resultCount: 1, leaseToken: null, leaseUntil: null });
    expect(await prisma.travellerObservation.count({ where: { profileId: saved.id } })).toBe(1);
    await prisma.travellerSourceState.update({ where: { source: 'google_explore' }, data: { nextAllowedAt: new Date(0) } });
    await prisma.travellerJob.create({ data: { profileId: saved.id, profileRevision: 1, kind: 'discovery', source: 'google_explore', dedupKey: randomUUID(), request: job.request as Prisma.InputJsonValue } });
    adapter.mockImplementationOnce(async (request, context) => {
      await context.reserveRequest();
      const result = parseExploreCards([{ entity: '/m/other', name: 'Fixture city', flightPrice: '900', currency: 'EUR', stops: 'Nonstop', duration: '2 hr' }], request, context.profile);
      await saveProfile(owner, profile, { id: saved.id, revision: 1, active: false });
      return result;
    });
    expect(await runTravellerJob()).toBe(false);
    expect(await prisma.travellerObservation.count({ where: { profileId: saved.id } })).toBe(1);
    expect(await prisma.travellerJob.count({ where: { profileId: saved.id, state: 'cancelled' } })).toBe(1);
    await prisma.travellerSourceState.update({ where: { source: 'google_explore' }, data: { nextAllowedAt: new Date(0) } });
    await expect(prisma.$transaction(tx => reserveSourceRequest(tx, 'google_explore', 30))).rejects.toThrow(/daily.*budget/);
    expect((await prisma.travellerSourceState.findUniqueOrThrow({ where: { source: 'google_explore' } })).usedToday).toBe(2);
  });
  it('rechecks an expired route with a fresh provider lookup and retains immutable verification evidence', async () => {
    if (await prisma.travellerSourceState.findUnique({ where: { source: 'google_flights' } })) throw new Error('Exact fixture requires a clean source catalog');
    await prisma.travellerSourceState.create({ data: { source: 'google_flights', enabled: true, capabilities: ['flight_verification'], budgetPerDay: 6 } });
    exactSourceCreated = true;
    const saved = await saveProfile(owner, { ...profile, name: 'Exact worker fixture' });
    const broad = parseExploreCards([{ entity: '/m/05qtj', name: 'Paris', flightPrice: '961', currency: 'EUR', stops: '1 stop', duration: '3 hr 30 min' }], { origin: 'LJU', destination: null, departure: '2027-04-01', returnDate: '2027-04-07' }, profile)[0]!;
    const observation = await prisma.travellerObservation.create({ data: { profileId: saved.id, profileRevision: 1, kind: 'flight', source: 'google_explore', provenance: 'cached', identity: randomUUID(), comparisonKey: randomUUID(), amount: '961', currency: 'EUR', observedAt: new Date(), expiresAt: new Date(Date.now() + 60000), details: broad as unknown as Prisma.InputJsonValue } });
    await prisma.travellerJob.create({ data: { profileId: saved.id, profileRevision: 1, kind: 'verification', source: 'google_flights', dedupKey: randomUUID(), lane: 'WATCH', priority: 50, request: { observationId: observation.id } } });
    const exact = vi.spyOn(googleExactAdapter, 'verify').mockImplementation(async (candidate, context) => {
      await context.reserveRequest(3);
      return exactFlight(candidate, context.profile, fixture.url, fixture.legs, fixture.fares);
    });
    expect(await runTravellerJob()).toBe(true);
    const followup = await prisma.travellerJob.findFirstOrThrow({ where: { profileId: saved.id, state: 'queued' } });
    expect(followup).toMatchObject({ lane: 'COLD', request: { recheck: true } });
    expect(followup.runAt.getTime()).toBeGreaterThan(Date.now());
    const verified = await prisma.travellerObservation.findFirstOrThrow({ where: { profileId: saved.id, source: 'google_flights' } });
    expect(verified.baseAmount?.toString()).toBe('961');
    expect(await prisma.travellerVerification.count({ where: { observationId: verified.id, independentGroup: 'google_flights' } })).toBe(1);
    await prisma.travellerObservation.update({ where: { id: verified.id }, data: { expiresAt: new Date(0) } });
    await prisma.travellerJob.update({ where: { id: followup.id }, data: { runAt: new Date(0) } });
    await prisma.travellerSourceState.update({ where: { source: 'google_flights' }, data: { nextAllowedAt: new Date(0) } });
    expect(await runTravellerJob()).toBe(true);
    expect(exact).toHaveBeenCalledTimes(2);
    expect(await prisma.travellerObservation.count({ where: { profileId: saved.id, source: 'google_flights' } })).toBe(2);
    expect((await prisma.travellerSourceState.findUniqueOrThrow({ where: { source: 'google_flights' } })).usedToday).toBe(6);
  });
  it('stops unattended source access immediately after an access challenge', async () => {
    const saved = await saveProfile(owner, { ...profile, name: 'Blocked source fixture' });
    await prisma.travellerSourceState.update({ where: { source: 'google_explore' }, data: { enabled: true, budgetPerDay: 100, nextAllowedAt: new Date(0) } });
    const request = { origin: 'LJU', destination: null, departure: '2027-04-01', returnDate: '2027-04-07' };
    await prisma.travellerJob.create({ data: { profileId: saved.id, profileRevision: 1, source: 'google_explore', kind: 'discovery', dedupKey: randomUUID(), request } });
    const adapter = vi.spyOn(googleExploreAdapter, 'discover').mockImplementation(async (_request, context) => {
      await context.reserveRequest();
      throw new SourceError('blocked', 'Fixture access challenge');
    });
    const before = adapter.mock.calls.length;
    expect(await runTravellerJob()).toBe(false);
    expect(await prisma.travellerSourceState.findUniqueOrThrow({ where: { source: 'google_explore' } })).toMatchObject({ status: 'blocked', enabled: false, lastError: 'Fixture access challenge' });
    await prisma.travellerSourceState.update({ where: { source: 'google_explore' }, data: { nextAllowedAt: new Date(0) } });
    await prisma.travellerJob.create({ data: { profileId: saved.id, profileRevision: 1, source: 'google_explore', kind: 'discovery', dedupKey: randomUUID(), request } });
    expect(await runTravellerJob()).toBe(false);
    expect(adapter.mock.calls.length - before).toBe(1);
  });
});
