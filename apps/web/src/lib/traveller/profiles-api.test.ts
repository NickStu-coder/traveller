import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), find: vi.fn(), save: vi.fn(), archive: vi.fn() }));
vi.mock('@/lib/traveller/http', async () => ({ ...await vi.importActual('@/lib/traveller/http'), travellerUser: mocks.auth }));
vi.mock('@/lib/prisma', () => ({ prisma: { watchProfile: { findFirst: mocks.find } } }));
vi.mock('./profile-store', () => ({ saveProfile: mocks.save, archiveProfile: mocks.archive, ProfileConflict: class extends Error {} }));
import { GET, PATCH, DELETE } from '@/app/api/traveller/profiles/[id]/route';
beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue({ user: { id: 'member', isAdmin: true } }); mocks.find.mockResolvedValue(null); });
const context = { params: Promise.resolve({ id: 'another-users-profile' }) };
it('does not widen private profile access for an administrator', async () => {
  const request = new Request('https://traveller.test/api/traveller/profiles/another-users-profile');
  expect((await GET(request, context)).status).toBe(404);
  expect(mocks.find).toHaveBeenCalledWith({ where: { id: 'another-users-profile', userId: 'member' } });
});
it('rejects editing and archiving another account without touching its data', async () => {
  const request = new Request('https://traveller.test/api/traveller/profiles/another-users-profile', { method: 'PATCH', body: '{}' });
  expect((await PATCH(request, context)).status).toBe(404);
  expect((await DELETE(request, context)).status).toBe(404);
  expect(mocks.save).not.toHaveBeenCalled();
  expect(mocks.archive).not.toHaveBeenCalled();
});
