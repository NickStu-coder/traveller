import { afterEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ user: null as { id: string } | null, count: vi.fn() }));
vi.mock('@/lib/user-auth', () => ({ getCurrentUser: async () => state.user }));
vi.mock('@/lib/prisma', () => ({ prisma: { query: { count: state.count } } }));
import { canReadTravellerQuery } from './access';
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); state.user = null; });

it('checks ownership before serving history and does not widen reads for administrators', async () => {
  vi.stubEnv('TRAVELLER_AUTH_MODE', 'individual');
  expect(await canReadTravellerQuery('private')).toBe(false);
  expect(state.count).not.toHaveBeenCalled();
  state.user = { id: 'owner' }; state.count.mockResolvedValue(0);
  expect(await canReadTravellerQuery('private')).toBe(false);
  expect(state.count).toHaveBeenCalledWith({ where: { id: 'private', userId: 'owner' } });
  state.count.mockResolvedValue(1);
  expect(await canReadTravellerQuery('mine')).toBe(true);
});
