import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), read: vi.fn(), update: vi.fn() }));
vi.mock('../http', async () => ({ ...await vi.importActual('../http'), travellerUser: mocks.auth }));
vi.mock('../../prisma', () => ({ prisma: { travellerSourceState: { findMany: mocks.read }, travellerJob: { findMany: mocks.read, groupBy: mocks.read, aggregate: vi.fn().mockResolvedValue({ _avg: { durationMs: null }, _max: { startedAt: null } }) }, travellerConfig: { findMany: mocks.read }, travellerObservation: { count: vi.fn().mockResolvedValue(0) }, watchProfile: { findMany: mocks.read }, extractionConfig: { findUnique: mocks.read } } }));
vi.mock('./store', () => ({ schedulerSettings: vi.fn().mockResolvedValue({}) }));
vi.mock('../engine/settings', () => ({ engineSettings: vi.fn().mockResolvedValue({ baseCurrency: 'EUR', weights: {} }) }));
vi.mock('./admin', async () => ({ ...await vi.importActual('./admin'), updateTravellerOperations: mocks.update }));
import { GET, PATCH } from '@/app/api/traveller/admin/route';
beforeEach(() => { vi.clearAllMocks(); mocks.read.mockResolvedValue([]); mocks.update.mockResolvedValue({ revision: 1 }); });
it('rejects anonymous and member operational access before any system read or mutation', async () => {
  for (const auth of [{ response: new Response(null, { status: 401 }) }, { user: { id: 'member', isAdmin: false } }]) {
    mocks.auth.mockResolvedValue(auth);
    expect([401, 403]).toContain((await GET()).status);
    expect([401, 403]).toContain((await PATCH(new Request('https://traveller.test/api/traveller/admin', { method: 'PATCH', body: '{}' }))).status);
  }
  expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
});
it('validates scoring weights and binds audited changes to the administrator identity', async () => {
  mocks.auth.mockResolvedValue({ user: { id: 'admin', isAdmin: true } });
  const payload = { kind: 'engine', revision: 0, settings: { baseCurrency: 'EUR', weights: { discount: 35, percentile: 30, quality: 20, verification: 15 } } };
  const request = (value: unknown) => new Request('https://traveller.test/api/traveller/admin', { method: 'PATCH', body: JSON.stringify(value) });
  expect((await PATCH(request({ ...payload, actorId: 'attacker' }))).status).toBe(400);
  expect((await PATCH(request({ ...payload, settings: { ...payload.settings, weights: { ...payload.settings.weights, quality: 40 } } }))).status).toBe(400);
  expect(mocks.update).not.toHaveBeenCalled();
  expect((await PATCH(request(payload))).status).toBe(200);
  expect(mocks.update).toHaveBeenCalledWith('admin', payload);
});
