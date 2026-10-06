import type { Prisma } from '@/generated/prisma/client';
import type { WatchConstraints } from './profiles';
import { serializable } from '../sidedoor/access/transaction';

export class ProfileConflict extends Error {}

export async function saveProfile(userId: string, constraints: WatchConstraints, existing?: { id: string; revision: number; active: boolean }) {
  return serializable(async tx => {
    const channelIds = [...new Set(constraints.alerts.channelIds)];
    if (channelIds.length && await tx.notificationChannel.count({ where: { id: { in: channelIds }, userId } }) !== channelIds.length)
      throw new ProfileConflict('An alert channel is unavailable');
    const json = constraints as unknown as Prisma.InputJsonValue;
    if (!existing) {
      if (await tx.watchProfile.count({ where: { userId, archivedAt: null } }) >= 50) throw new ProfileConflict('Profile limit reached');
      return tx.watchProfile.create({ data: {
        userId, name: constraints.name, constraints: json,
        revisions: { create: { revision: 1, actorId: userId, constraints: json, active: true } },
      } });
    }
    const updated = await tx.watchProfile.updateMany({
      where: { id: existing.id, userId, revision: existing.revision, archivedAt: null },
      data: { name: constraints.name, constraints: json, active: existing.active, revision: { increment: 1 }, nextCheckAt: new Date() },
    });
    if (!updated.count) throw new ProfileConflict('Profile changed; reload before saving');
    await tx.watchProfileRevision.create({ data: { profileId: existing.id, revision: existing.revision + 1, actorId: userId, constraints: json, active: existing.active } });
    await tx.travellerJob.updateMany({ where: { profileId: existing.id, state: { in: ['queued', 'running'] } }, data: { state: 'cancelled', leaseToken: null, leaseUntil: null, completedAt: new Date() } });
    return tx.watchProfile.findFirstOrThrow({ where: { id: existing.id, userId } });
  });
}

export async function archiveProfile(id: string, userId: string, revision: number) {
  return serializable(async tx => {
    const changed = await tx.watchProfile.updateMany({ where: { id, userId, revision, archivedAt: null }, data: { active: false, archivedAt: new Date(), revision: { increment: 1 } } });
    if (!changed.count) throw new ProfileConflict('Profile changed; reload before archiving');
    const profile = await tx.watchProfile.findFirstOrThrow({ where: { id, userId } });
    await tx.watchProfileRevision.create({ data: { profileId: id, revision: profile.revision, actorId: userId, constraints: profile.constraints as Prisma.InputJsonValue, active: false } });
    await tx.travellerJob.updateMany({ where: { profileId: id, state: { in: ['queued', 'running'] } }, data: { state: 'cancelled', leaseToken: null, leaseUntil: null, completedAt: new Date() } });
    return profile;
  });
}
