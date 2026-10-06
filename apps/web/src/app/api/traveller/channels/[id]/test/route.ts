import { getTranslations } from 'next-intl/server';
import { apiError, apiSuccess } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';
import { travellerUser } from '@/lib/traveller/http';
import { isChannelType, sendToChannel } from '@/lib/notifications/channels';
import { resolveBaseUrl } from '@/lib/notifications/base-url';

export const dynamic = 'force-dynamic';
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await travellerUser();
  if (auth.response) return auth.response;
  const { id } = await context.params;
  const channel = await prisma.notificationChannel.findFirst({ where: { id, userId: auth.user.id, enabled: true }, select: { id: true, userId: true, type: true, config: true } });
  if (!channel) return apiError('Channel not found', 404);
  // Reserve per owner, so creating another channel cannot bypass the relay limit.
  if (!redis) return apiError('Test send rate limiter unavailable', 503);
  try {
    if (await redis.set(`notify:test-private:${auth.user.id}`, '1', 'EX', 30, 'NX') !== 'OK') return apiError('Test send was triggered recently', 429);
  } catch { return apiError('Test send rate limiter unavailable', 503); }
  if (!isChannelType(channel.type)) return apiError('Invalid channel type', 502);
  const t = await getTranslations('Traveller');
  try {
    await sendToChannel({ ...channel, type: channel.type, userId: auth.user.id }, {
      title: t('channelTestTitle'), body: t('channelTestBody'), url: resolveBaseUrl() ?? '', data: { test: true },
    });
    return apiSuccess({ sent: true });
  } catch { return apiError('Test notification could not be sent', 502); }
}
