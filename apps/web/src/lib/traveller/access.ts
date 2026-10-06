import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/user-auth';

/** Legacy public flight pages must not expose private Traveller trackers. */
export async function canReadTravellerQuery(id: string): Promise<boolean> {
  if (process.env.TRAVELLER_AUTH_MODE !== 'individual') return true;
  const user = await getCurrentUser();
  if (!user) return false;
  return (await prisma.query.count({ where: { id, userId: user.id } })) === 1;
}
