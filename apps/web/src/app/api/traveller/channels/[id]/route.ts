import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { apiError, apiSuccess } from '@/lib/api-response';
import { travellerBody, travellerUser } from '@/lib/traveller/http';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };
export async function PATCH(request: Request, context: Context) {
  const auth = await travellerUser();
  if (auth.response) return auth.response;
  const { id } = await context.params;
  const parsed = z.object({ enabled: z.boolean() }).strict().safeParse(await travellerBody(request).catch(() => null));
  if (!parsed.success) return apiError('Invalid channel update', 400);
  const changed = await prisma.notificationChannel.updateMany({ where: { id, userId: auth.user.id }, data: { enabled: parsed.data.enabled } });
  return changed.count ? apiSuccess({ updated: true }) : apiError('Channel not found', 404);
}
export async function DELETE(_request: Request, context: Context) {
  const auth = await travellerUser();
  if (auth.response) return auth.response;
  const { id } = await context.params;
  const changed = await prisma.notificationChannel.deleteMany({ where: { id, userId: auth.user.id } });
  return changed.count ? apiSuccess({ deleted: true }) : apiError('Channel not found', 404);
}
