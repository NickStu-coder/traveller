import { apiError, apiSuccess } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';
import { travellerBody, travellerUser } from '@/lib/traveller/http';
import { profileSchema } from '@/lib/traveller/profiles';
import { ProfileConflict, saveProfile } from '@/lib/traveller/profile-store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await travellerUser();
  if (auth.response) return auth.response;
  return apiSuccess({ profiles: await prisma.watchProfile.findMany({ where: { userId: auth.user.id, archivedAt: null }, orderBy: { createdAt: 'desc' }, take: 50 }) });
}

export async function POST(request: Request) {
  const auth = await travellerUser();
  if (auth.response) return auth.response;
  const parsed = profileSchema.safeParse(await travellerBody(request).catch(() => null));
  if (!parsed.success) return apiError(parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; '), 400);
  try { return apiSuccess({ profile: await saveProfile(auth.user.id, parsed.data) }, 201); }
  catch (error) { if (error instanceof ProfileConflict) return apiError(error.message, 409); throw error; }
}
