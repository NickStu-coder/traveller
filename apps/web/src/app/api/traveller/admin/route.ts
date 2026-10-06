import { apiError, apiSuccess } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';
import { travellerBody, travellerUser } from '@/lib/traveller/http';
import { operationalUpdate, OperationalConflict, updateTravellerOperations } from '@/lib/traveller/scheduler/admin';
import { schedulerSettings } from '@/lib/traveller/scheduler/store';
import { SOURCE_CATALOG } from '@/lib/traveller/sources/catalog';
import { engineSettings } from '@/lib/traveller/engine/settings';

export const dynamic = 'force-dynamic';
export async function GET() {
  const auth = await travellerUser();
  if (auth.response) return auth.response;
  if (!auth.user.isAdmin) return apiError('Administrator access required', 403);
  const [sources, jobs, counts, duration, settings, configs, observations, engine] = await Promise.all([
    prisma.travellerSourceState.findMany({ orderBy: { source: 'asc' } }),
    prisma.travellerJob.findMany({ orderBy: { createdAt: 'desc' }, take: 50, include: { profile: { select: { userId: true, name: true } } } }),
    prisma.travellerJob.groupBy({ by: ['state'], _count: true }),
    prisma.travellerJob.aggregate({ where: { state: 'completed' }, _avg: { durationMs: true } }),
    schedulerSettings(), prisma.travellerConfig.findMany({ select: { id: true, revision: true } }), prisma.travellerObservation.count(), engineSettings(),
  ]);
  return apiSuccess({ sources: sources.map(source => ({ ...source, metadata: SOURCE_CATALOG.find(metadata => metadata.id === source.source), revision: configs.find(config => config.id === `source:${source.source}`)?.revision ?? 0 })),
    jobs, counts, averageDurationMs: duration._avg.durationMs, settings, revision: configs.find(config => config.id === 'scheduler')?.revision ?? 0, observations,
    engine, engineRevision: configs.find(config => config.id === 'engine')?.revision ?? 0 });
}
export async function PATCH(request: Request) {
  const auth = await travellerUser();
  if (auth.response) return auth.response;
  if (!auth.user.isAdmin) return apiError('Administrator access required', 403);
  const input = operationalUpdate.safeParse(await travellerBody(request).catch(() => null));
  if (!input.success) return apiError('Invalid operational settings', 400);
  try { return apiSuccess({ config: await updateTravellerOperations(auth.user.id, input.data) }); }
  catch (error) { if (error instanceof OperationalConflict) return apiError(error.message, 409); throw error; }
}
