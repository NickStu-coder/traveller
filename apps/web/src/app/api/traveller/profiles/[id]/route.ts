import { z } from 'zod';
import { apiError, apiSuccess } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';
import { travellerBody, travellerUser } from '@/lib/traveller/http';
import { profileSchema } from '@/lib/traveller/profiles';
import { archiveProfile, ProfileConflict, saveProfile } from '@/lib/traveller/profile-store';

type Context = { params: Promise<{ id: string }> };
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: Context) {
  const auth = await travellerUser();
  if (auth.response) return auth.response;
  const { id } = await context.params;
  const profile = await prisma.watchProfile.findFirst({ where: { id, userId: auth.user.id } });
  return profile ? apiSuccess({ profile }) : apiError('Profile not found', 404);
}

export async function PATCH(request: Request, context: Context) {
  const auth = await travellerUser();
  if (auth.response) return auth.response;
  const { id } = await context.params;
  const profile = await prisma.watchProfile.findFirst({ where: { id, userId: auth.user.id, archivedAt: null } });
  if (!profile) return apiError('Profile not found', 404);
  const parsed = z.object({ revision: z.number().int().positive(), active: z.boolean(), constraints: profileSchema }).strict().safeParse(await travellerBody(request).catch(() => null));
  if (!parsed.success) return apiError('Invalid profile update', 400);
  try { return apiSuccess({ profile: await saveProfile(auth.user.id, parsed.data.constraints, { id, revision: parsed.data.revision, active: parsed.data.active }) }); }
  catch (error) { if (error instanceof ProfileConflict) return apiError(error.message, 409); throw error; }
}

export async function DELETE(request: Request, context: Context) {
  const auth = await travellerUser();
  if (auth.response) return auth.response;
  const { id } = await context.params;
  const profile = await prisma.watchProfile.findFirst({ where: { id, userId: auth.user.id, archivedAt: null } });
  if (!profile) return apiError('Profile not found', 404);
  const parsed = z.object({ revision: z.number().int().positive() }).strict().safeParse(await travellerBody(request).catch(() => null));
  if (!parsed.success) return apiError('A revision is required', 400);
  try { return apiSuccess({ profile: await archiveProfile(id, auth.user.id, parsed.data.revision) }); }
  catch (error) { if (error instanceof ProfileConflict) return apiError(error.message, 409); throw error; }
}
