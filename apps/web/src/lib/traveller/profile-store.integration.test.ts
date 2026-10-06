import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/prisma';
import { archiveProfile, saveProfile } from './profile-store';
import { profileSchema } from './profiles';

const enabled = process.env.TRAVELLER_DATABASE_TESTS === '1';
const owner = `traveller-test-${randomUUID()}`, other = `traveller-test-${randomUUID()}`;
const constraints = profileSchema.parse({ name: 'Test Anywhere', origins: ['LJU', 'VIE'], destination: { kind: 'anywhere' }, dates: { mode: 'rolling', days: 365 }, duration: { minNights: 5, maxNights: 12 }, passengers: { adults: 1 }, cabin: 'business', positioning: { homeAirports: ['LJU'] } });
let databaseValidated = false;
describe.skipIf(!enabled)('Traveller PostgreSQL ownership and history', () => {
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? '');
    if (!['database', 'localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/traveller_test') throw new Error('Traveller integration tests require the dedicated traveller_test database');
    databaseValidated = true;
    await prisma.user.createMany({ data: [{ id: owner, username: owner }, { id: other, username: other }] });
  });
  afterAll(async () => {
    if (!databaseValidated) return;
    const profiles = await prisma.watchProfile.findMany({ where: { userId: { in: [owner, other] } }, select: { id: true } });
    const ids = profiles.map(profile => profile.id);
    await prisma.travellerVerification.deleteMany({ where: { observation: { profileId: { in: ids } } } });
    await prisma.travellerObservation.deleteMany({ where: { profileId: { in: ids } } });
    await prisma.travellerJob.deleteMany({ where: { profileId: { in: ids } } });
    await prisma.watchProfileRevision.deleteMany({ where: { profileId: { in: ids } } });
    await prisma.watchProfile.deleteMany({ where: { id: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: [owner, other] } } });
    await prisma.$disconnect();
  });
  it('fences concurrent edits, rejects foreign channels and preserves observations on archive', async () => {
    const profile = await saveProfile(owner, constraints);
    await expect(saveProfile(other, constraints, { id: profile.id, revision: 1, active: true })).rejects.toThrow(/changed/);
    await expect(saveProfile(owner, { ...constraints, alerts: { ...constraints.alerts, channelIds: ['foreign-channel'] } })).rejects.toThrow(/unavailable/);
    const edits = await Promise.allSettled([saveProfile(owner, { ...constraints, name: 'One' }, { id: profile.id, revision: 1, active: true }), saveProfile(owner, { ...constraints, name: 'Two' }, { id: profile.id, revision: 1, active: true })]);
    expect(edits.filter(edit => edit.status === 'fulfilled')).toHaveLength(1);
    expect((await prisma.watchProfile.findUniqueOrThrow({ where: { id: profile.id } })).revision).toBe(2);
    const data = { profileId: profile.id, profileRevision: 2, kind: 'flight', source: 'fixture', provenance: 'historical', identity: 'same-party-business-return', comparisonKey: 'same-party-cabin-season', amount: '1087', currency: 'EUR', observedAt: new Date(), details: { fixture: true } };
    await prisma.travellerObservation.create({ data });
    await expect(prisma.travellerObservation.create({ data })).rejects.toThrow();
    await expect(prisma.travellerObservation.create({ data: { ...data, identity: 'negative', amount: '-1' } })).rejects.toThrow();
    await expect(prisma.travellerObservation.create({ data: { ...data, identity: 'partial-fx', baseAmount: '100', baseCurrency: 'USD' } })).rejects.toThrow();
    await prisma.travellerJob.create({ data: { profileId: profile.id, profileRevision: 2, kind: 'discovery', source: 'fixture', dedupKey: randomUUID() } });
    const archived = await archiveProfile(profile.id, owner, 2);
    expect(archived.active).toBe(false);
    expect(archived.archivedAt).not.toBeNull();
    expect(await prisma.travellerObservation.count({ where: { profileId: profile.id } })).toBe(1);
    expect(await prisma.watchProfileRevision.count({ where: { profileId: profile.id } })).toBe(3);
    expect((await prisma.travellerJob.findFirstOrThrow({ where: { profileId: profile.id } })).state).toBe('cancelled');
  });
});
