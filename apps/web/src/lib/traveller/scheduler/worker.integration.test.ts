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

const owner = 'traveller-worker-test-' + randomUUID();
const profile = profileSchema.parse({ name: 'Worker fixture', origins: ['LJU'], destination: { kind: 'anywhere' }, dates: { mode: 'rolling', days: 365 }, duration: { minNights: 5, maxNights: 12 }, passengers: { adults: 2 }, cabin: 'business', positioning: { homeAirports: ['LJU'] } });
describe.skipIf(process.env.TRAVELLER_DATABASE_TESTS !== '1')('Traveller PostgreSQL worker fencing', () => {
  let sourceCreated = false;
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
    await prisma.travellerObservation.deleteMany({ where: { profileId: { in: ids } } });
    await prisma.travellerJob.deleteMany({ where: { profileId: { in: ids } } });
    await prisma.watchProfileRevision.deleteMany({ where: { profileId: { in: ids } } });
    await prisma.watchProfile.deleteMany({ where: { id: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: owner } });
    if (sourceCreated) await prisma.travellerSourceState.delete({ where: { source: 'google_explore' } });
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
});
