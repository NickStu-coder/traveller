import { getCurrentUser } from '@/lib/user-auth';
import { prisma } from '@/lib/prisma';
import { Profiles } from './profiles';
export default async function ProfilesPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const [profiles, channels] = await Promise.all([
    prisma.watchProfile.findMany({ where: { userId: user.id, archivedAt: null }, orderBy: { createdAt: 'desc' }, take: 50 }),
    prisma.notificationChannel.findMany({ where: { userId: user.id }, select: { id: true, label: true, type: true } }),
  ]);
  return <Profiles initialProfiles={profiles.map(profile => ({ id: profile.id, revision: profile.revision, active: profile.active, constraints: profile.constraints, nextCheckAt: profile.nextCheckAt.toISOString() }))} channels={channels} />;
}
