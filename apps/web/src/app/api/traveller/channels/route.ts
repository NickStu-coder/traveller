import { z } from 'zod';
import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { apiError, apiSuccess } from '@/lib/api-response';
import { travellerBody, travellerUser } from '@/lib/traveller/http';
import { isChannelType, prepareStoredConfig, assertPublicUrl } from '@/lib/notifications/channels';
import { assertPublicHost } from '@/lib/notifications/channels/config';
import { redactChannel } from '@/lib/notifications/admin';

export const dynamic = 'force-dynamic';
export async function GET() {
  const auth = await travellerUser();
  if (auth.response) return auth.response;
  const channels = await prisma.notificationChannel.findMany({ where: { userId: auth.user.id }, orderBy: { createdAt: 'asc' } });
  return apiSuccess({ channels: channels.map(redactChannel) });
}
export async function POST(request: Request) {
  const auth = await travellerUser();
  if (auth.response) return auth.response;
  const parsed = z.object({ type: z.string(), label: z.string().trim().min(1).max(100), config: z.record(z.string(), z.unknown()) }).strict().safeParse(await travellerBody(request).catch(() => null));
  if (!parsed.success || !isChannelType(parsed.data.type)) return apiError('Invalid notification channel', 400);
  const { type, label, config } = parsed.data;
  try {
    const stored = prepareStoredConfig(type, config);
    if (type === 'webhook') assertPublicUrl(String(stored.url), { trusted: false });
    if (type === 'ntfy') assertPublicUrl(String(stored.server), { trusted: false });
    if (type === 'email') assertPublicHost(String(stored.host), { trusted: false });
    const channel = await prisma.$transaction(async tx => {
      if (await tx.notificationChannel.count({ where: { userId: auth.user.id } }) >= 20) return null;
      return tx.notificationChannel.create({ data: { userId: auth.user.id, type, label, config: stored as Prisma.InputJsonValue } });
    }, { isolationLevel: 'Serializable' });
    return channel ? apiSuccess({ channel: redactChannel(channel) }, 201) : apiError('Channel limit reached', 409);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'P2034') return apiError('Channels changed; reload before saving', 409);
    if (error instanceof Error && !('code' in error)) return apiError(error.message, 400);
    throw error;
  }
}
