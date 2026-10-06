import { randomUUID } from 'node:crypto';
import type { Prisma, TravelAlertDelivery } from '@/generated/prisma/client';
import { notificationTransaction } from '../../notifications/database';
import { deliverClaimedAlert, DELIVERY_CLAIM_MS, type ClaimedDelivery } from '../../notifications/delivery';
import type { ChannelMessage } from '../../notifications/channels/types';

async function authorized(tx: Prisma.TransactionClient, id: string) {
  const row = await tx.travelAlertDelivery.findUnique({ where: { id }, include: { travellerAlert: { include: { profile: { include: { user: { select: { disabledAt: true } } } }, observation: { select: { observedAt: true, expiresAt: true } } } } } });
  const alert = row?.travellerAlert, now = new Date();
  if (!row || !alert || !alert.profile.active || alert.profile.archivedAt || alert.profile.user.disabledAt || alert.profileRevision !== alert.profile.revision
    || alert.observation.observedAt > now || now.getTime() - alert.observation.observedAt.getTime() > 15 * 60000 || !alert.observation.expiresAt || alert.observation.expiresAt <= now) return null;
  return { row, alert };
}
export async function deliverTravellerAlerts(signal?: AbortSignal): Promise<void> {
  const due = await notificationTransaction(tx => tx.travelAlertDelivery.findMany({ where: { travellerAlertId: { not: null }, pending: true, nextAttemptAt: { lte: new Date() } }, orderBy: [{ nextAttemptAt: 'asc' }, { id: 'asc' }], take: 20, select: { id: true } }), signal);
  for (const item of due) {
    if (signal?.aborted) return;
    const entry = await notificationTransaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "TravelAlertDelivery" WHERE id = ${item.id} FOR UPDATE`;
      const active = await authorized(tx, item.id);
      if (!active) { await tx.travelAlertDelivery.updateMany({ where: { id: item.id, pending: true }, data: { pending: false, claimToken: null, claimExpiresAt: null, lastError: 'Offer expired or profile authority changed; delivery cancelled' } }); return null; }
      const { row, alert } = active;
      if (!row.pending || row.claimExpiresAt && row.claimExpiresAt > new Date()) return null;
      const payload = row.message as unknown as ChannelMessage;
      if (payload?.data?.deliveryOwner !== alert.profile.userId) return null;
      const expires = new Date(Date.now() + DELIVERY_CLAIM_MS);
      const claimed = await tx.travelAlertDelivery.update({ where: { id: row.id }, data: { claimToken: randomUUID(), claimExpiresAt: expires, nextAttemptAt: expires } });
      return { ...claimed, owner: alert.profile.userId, channelIds: alert.channelIds, payload } satisfies ClaimedDelivery;
    }, signal);
    if (!entry) continue;
    const guarded = <T>(work: (tx: Prisma.TransactionClient, row: TravelAlertDelivery) => Promise<T>) => notificationTransaction(async tx => {
      const current = await authorized(tx, entry.id);
      if (!current?.row.pending || current.row.claimToken !== entry.claimToken || !current.row.claimExpiresAt || current.row.claimExpiresAt <= new Date()) throw new Error('Traveller alert delivery authority was lost');
      return work(tx, current.row);
    }, signal);
    try { await deliverClaimedAlert(entry, guarded, signal); }
    catch { console.error(JSON.stringify({ event: 'traveller_alert', id: entry.id, state: 'interrupted' })); }
  }
}
