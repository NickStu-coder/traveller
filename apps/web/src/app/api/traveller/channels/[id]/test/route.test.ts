import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const find = vi.fn(), send = vi.fn(), reserve = vi.fn(), auth = vi.fn(), validType = vi.fn();
const limiter: { redis: { set: typeof reserve } | null } = { redis: null };
vi.mock('@/lib/prisma', () => ({ prisma: { notificationChannel: { findFirst: (...args: unknown[]) => find(...args) } } }));
vi.mock('@/lib/redis', () => ({ get redis() { return limiter.redis; } }));
vi.mock('@/lib/traveller/http', () => ({ travellerUser: () => auth() }));
vi.mock('@/lib/notifications/channels', () => ({ sendToChannel: (...args: unknown[]) => send(...args), isChannelType: (...args: unknown[]) => validType(...args) }));
vi.mock('@/lib/notifications/base-url', () => ({ resolveBaseUrl: () => 'https://traveller.example' }));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
import { POST } from './route';

const channel = { id: 'private-channel', userId: 'owner', type: 'email', config: { pass: 'encrypted-fixture' } };
const request = (id = channel.id) => POST(new Request('https://traveller.example/api/traveller/channels/test', { method: 'POST' }), { params: Promise.resolve({ id }) });
beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ user: { id: 'owner' } });
  find.mockResolvedValue(channel); send.mockResolvedValue(undefined); validType.mockReturnValue(true);
  reserve.mockResolvedValue('OK'); limiter.redis = { set: reserve };
});
describe('private channel test notifications', () => {
  it('sends through the existing untrusted-owner transport without creating a deal', async () => {
    const response = await request();
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ sent: true });
    expect(find).toHaveBeenCalledWith({ where: { id: channel.id, userId: 'owner', enabled: true }, select: { id: true, userId: true, type: true, config: true } });
    expect(send).toHaveBeenCalledWith(channel, { title: 'channelTestTitle', body: 'channelTestBody', url: 'https://traveller.example', data: { test: true } });
    expect(reserve).toHaveBeenCalledWith('notify:test-private:owner', '1', 'EX', 30, 'NX');
  });
  it('denies unauthenticated requests before reading channels or sending', async () => {
    auth.mockResolvedValue({ response: NextResponse.json({ ok: false }, { status: 401 }) });
    expect((await request()).status).toBe(401);
    expect(find).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled();
  });
  it('scopes even administrator requests to their own enabled channels', async () => {
    auth.mockResolvedValue({ user: { id: 'another-admin', isAdmin: true } }); find.mockResolvedValue(null);
    expect((await request()).status).toBe(404);
    expect(find).toHaveBeenCalledWith(expect.objectContaining({ where: { id: channel.id, userId: 'another-admin', enabled: true } }));
    expect(reserve).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled();
  });
  it('cannot bypass an owner quota by selecting a different channel', async () => {
    reserve.mockResolvedValue(null);
    for (const id of ['one', 'two']) expect((await request(id)).status).toBe(429);
    expect(reserve.mock.calls.every(call => call[0] === 'notify:test-private:owner')).toBe(true);
    expect(send).not.toHaveBeenCalled();
  });
  it('fails closed when Redis is absent or unavailable', async () => {
    limiter.redis = null; expect((await request()).status).toBe(503);
    limiter.redis = { set: reserve }; reserve.mockRejectedValue(new Error('Offline'));
    expect((await request()).status).toBe(503); expect(send).not.toHaveBeenCalled();
  });
  it('does not expose provider errors or credentials', async () => {
    send.mockRejectedValue(new Error('Authentication failed: private-password'));
    const response = await request(); expect(response.status).toBe(502);
    expect(await response.text()).not.toContain('private-password');
  });
  it('rejects an unknown stored channel type without sending', async () => {
    validType.mockReturnValue(false);
    expect((await request()).status).toBe(502); expect(send).not.toHaveBeenCalled();
  });
});
