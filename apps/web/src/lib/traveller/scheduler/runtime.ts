import { prisma } from '../../prisma';
import { initializeTravellerSources, scheduleTravellerDiscovery } from './store';
import { runTravellerJob } from './worker';

const runtime = globalThis as typeof globalThis & { travellerTimer?: ReturnType<typeof setTimeout>; travellerPump?: Promise<void> };
export async function pumpTraveller(): Promise<void> {
  if (runtime.travellerPump) return runtime.travellerPump;
  runtime.travellerPump = (async () => {
    const config = await prisma.extractionConfig.findUnique({ where: { id: 'singleton' }, select: { enabled: true } });
    if (config?.enabled === false) return;
    await scheduleTravellerDiscovery();
    await runTravellerJob();
  })().catch(() => { console.error(JSON.stringify({ event: 'traveller_scheduler', state: 'failed', error: 'Scheduler unavailable; inspect database and travel admission health' })); })
    .finally(() => { runtime.travellerPump = undefined; });
  return runtime.travellerPump;
}
export async function startTravellerScheduler(): Promise<void> {
  if (process.env.TRAVELLER_AUTH_MODE !== 'individual' || process.env.CRON_ENABLED === 'false' || runtime.travellerTimer) return;
  await initializeTravellerSources();
  const tick = async () => {
    await pumpTraveller();
    runtime.travellerTimer = setTimeout(() => { void tick(); }, 60_000);
    runtime.travellerTimer.unref();
  };
  runtime.travellerTimer = setTimeout(() => { void tick(); }, 10_000);
  runtime.travellerTimer.unref();
}
