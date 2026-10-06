import { NextRequest } from 'next/server';
import { apiSuccess, apiError } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/user-auth';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body?.ids || !Array.isArray(body.ids)) {
    return apiError('Missing ids array', 400);
  }

  const ids = (body.ids as unknown[]).filter((id): id is string => typeof id === 'string' && id.length <= 100).slice(0, 20);
  const user = process.env.TRAVELLER_AUTH_MODE === 'individual' ? await getCurrentUser() : null;
  if (process.env.TRAVELLER_AUTH_MODE === 'individual' && !user) return apiError('Unauthorized', 401);

  const queries = await prisma.query.findMany({
    where: { id: { in: ids }, ...(user ? { userId: user.id } : {}) },
    select: { id: true, active: true, expiresAt: true },
  });

  const statusMap: Record<string, string> = {};
  const now = new Date();

  for (const id of ids) {
    const q = queries.find((query) => query.id === id);
    if (!q) {
      statusMap[id] = 'deleted';
    } else if (now > q.expiresAt || !q.active) {
      statusMap[id] = 'expired';
    } else {
      statusMap[id] = 'active';
    }
  }

  return apiSuccess(statusMap);
}
