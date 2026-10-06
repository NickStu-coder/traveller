import { prisma } from '@/lib/prisma';
import type { ChannelMessage, ChannelType } from './channels/types';
import { sendToChannel } from './channels/index';
import { notificationTransaction } from './database';
import type { Prisma } from '@/generated/prisma/client';

export interface NotifyOutcome {
  channelId: string;
  type: ChannelType;
  ok: boolean;
  error?: string;
}

export interface NotificationDeliveryControl {
  signal: AbortSignal;
  beforeSend: (channelId: string) => Promise<void>;
  onDelivered: (channelId: string) => Promise<void>;
  channelIds?: readonly string[];
}

/**
 * Send a message to every enabled channel owned by `ownerUserId` (null = the
 * global/admin-owned channels used in single-user self-hosting).
 *
 * Per-channel failures are isolated and reported, never thrown, so one broken
 * channel never suppresses the others or breaks the caller (a cron run).
 */
export async function dispatchNotifications(
  ownerUserId: string | null,
  message: ChannelMessage,
  deliveredChannelIds: string[] = [],
  control?: NotificationDeliveryControl,
): Promise<NotifyOutcome[]> {
  // Individual accounts never inherit household/global recipients.
  const individual = process.env.TRAVELLER_AUTH_MODE === 'individual';
  const read = <T>(query: (tx: Prisma.TransactionClient) => Promise<T>) => control ? notificationTransaction(query, control.signal) : query(prisma);
  const channels = await read(tx => tx.notificationChannel.findMany({
    where: {
      enabled: true,
      ...((deliveredChannelIds.length || control?.channelIds !== undefined) ? { id: {
        ...(deliveredChannelIds.length ? { notIn: deliveredChannelIds } : {}),
        ...(control?.channelIds !== undefined ? { in: [...control.channelIds] } : {}),
      } } : {}),
      // SQL `IN (id, NULL)` never matches NULL rows, so OR the two explicitly.
      ...(individual || ownerUserId === null
        ? { userId: ownerUserId }
        : { OR: [{ userId: ownerUserId }, { userId: null }] }),
    },
    select: { id: true, type: true, config: true, userId: true },
    ...(control ? { orderBy: { id: 'asc' as const } } : {}),
  }));

  const send = async (ch: (typeof channels)[number]): Promise<NotifyOutcome> => {
    const type = ch.type as ChannelType;
    try {
      if (individual && ch.userId !== ownerUserId) throw new Error('Notification channel belongs to another account');
      // Thread the owner id through: a per-user channel (userId set) stays
      // untrusted, so its outbound host is SSRF-checked at send time.
      await sendToChannel({ id: ch.id, type, config: ch.config, userId: ch.userId }, message, { signal: control?.signal });
      return { channelId: ch.id, type, ok: true };
    } catch (err) {
      return {
        channelId: ch.id,
        type,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  };
  if (!control) return Promise.all(channels.map(send));
  const outcomes: NotifyOutcome[] = [];
  for (const entry of channels) {
    control.signal.throwIfAborted();
    // A channel can be disabled, removed or reassigned after batch enumeration.
    const channel = await read(tx => tx.notificationChannel.findUnique({ where: { id: entry.id } }));
    if (!channel?.enabled || (individual ? channel.userId !== ownerUserId : channel.userId !== null && channel.userId !== ownerUserId)) continue;
    await control.beforeSend(entry.id);
    control.signal.throwIfAborted();
    const outcome = await send(channel);
    // Persistence/authority failures stop the batch, not just this channel.
    if (outcome.ok) await control.onDelivered(channel.id);
    outcomes.push(outcome);
  }
  return outcomes;
}
