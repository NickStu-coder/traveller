import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../../prisma';
import type { Prisma, TravellerJob } from '@/generated/prisma/client';
import { acquireTravelLease, lockTravelLease, quarantineTravelLease, releaseTravelLease, renewTravelLease, type TravelLeaseToken } from '../../travel/admission';
import { TravelExecution, TravelCleanupError, withTravelExecution } from '../../travel/execution';
import { profileSchema } from '../profiles';
import type { FlightCandidate } from '../sources/types';
import { SourceError } from '../sources/types';
import { googleExploreAdapter } from '../sources/explore-adapter';
import { nextCheck } from './policy';
import { reserveSourceRequest, schedulerSettings } from './store';

const requestSchema = z.object({ origin: z.string().regex(/^[A-Z]{3}$/), destination: z.string().max(100).nullable(), departure: z.iso.date(), returnDate: z.iso.date() }).strict();
const expiry = () => new Date(Date.now() + 120_000);

async function fence(tx: Prisma.TransactionClient, job: TravellerJob, lease: TravelLeaseToken): Promise<void> {
  await lockTravelLease(tx, lease);
  if (!await tx.travellerJob.count({ where: { id: job.id, state: 'running', leaseToken: job.leaseToken, leaseUntil: { gt: new Date() }, profile: { revision: job.profileRevision, active: true, archivedAt: null, user: { disabledAt: null } } } }))
    throw new Error('Traveller job no longer owns the current profile revision');
}

async function claim(lease: TravelLeaseToken): Promise<TravellerJob | null> {
  return prisma.$transaction(async tx => {
    await lockTravelLease(tx, lease);
    const now = new Date(), day = now.toISOString().slice(0, 10);
    // The shared browser is exclusively owned; old jobs cannot still run after verified recovery.
    await tx.travellerJob.updateMany({ where: { state: 'running', leaseUntil: { lte: now } }, data: { state: 'failed', leaseToken: null, leaseUntil: null, error: 'Worker stopped; prior observations retained', completedAt: now } });
    const sources = await tx.travellerSourceState.findMany({ where: { source: 'google_explore', enabled: true, nextAllowedAt: { lte: now } } });
    const eligible = sources.filter(source => source.budgetDate !== day || source.usedToday < source.budgetPerDay).map(source => source.source);
    const jobs = await tx.travellerJob.findMany({ where: { state: 'queued', source: { in: eligible }, runAt: { lte: now }, profile: { active: true, archivedAt: null, user: { disabledAt: null } } }, orderBy: [{ priority: 'desc' }, { runAt: 'asc' }], take: 20, include: { profile: { select: { revision: true } } } });
    const job = jobs.find(value => value.profileRevision === value.profile.revision);
    if (!job) return null;
    return tx.travellerJob.update({ where: { id: job.id }, data: { state: 'running', leaseToken: randomUUID(), leaseUntil: expiry(), startedAt: now, attempts: { increment: 1 }, error: null } });
  });
}

function candidateIdentity(candidate: FlightCandidate): string {
  return createHash('sha256').update(JSON.stringify([candidate.origin, candidate.destination, candidate.departure, candidate.returnDate, candidate.cabin, candidate.passengers])).digest('hex');
}
async function finish(job: TravellerJob, lease: TravelLeaseToken, candidates: FlightCandidate[], started: number): Promise<void> {
  await prisma.$transaction(async tx => {
    await fence(tx, job, lease);
    for (const candidate of candidates) {
      const identity = candidateIdentity(candidate);
      // Discovery history is kept separately from confirmed itinerary evidence.
      const comparisonKey = createHash('sha256').update(JSON.stringify(['explore-v1', candidate.origin, candidate.destination, candidate.cabin, candidate.passengers, candidate.currency, candidate.departure.slice(5, 7), (Date.parse(candidate.returnDate) - Date.parse(candidate.departure)) / 86400000])).digest('hex');
      await tx.travellerObservation.createMany({ skipDuplicates: true, data: [{ profileId: job.profileId, profileRevision: job.profileRevision, kind: 'flight', source: candidate.source,
        provenance: candidate.provenance, identity, comparisonKey, amount: String(candidate.amount), currency: candidate.currency,
        observedAt: new Date(candidate.observedAt), expiresAt: new Date(Date.parse(candidate.observedAt) + 24 * 3600000),
        bookingUrl: candidate.bookingUrl, details: candidate as unknown as Prisma.InputJsonValue }] });
    }
    await tx.travellerJob.update({ where: { id: job.id }, data: { state: 'completed', completedAt: new Date(), leaseToken: null, leaseUntil: null, durationMs: Date.now() - started, resultCount: candidates.length } });
    await tx.travellerSourceState.updateMany({ where: { source: job.source, enabled: true }, data: { status: 'healthy', lastSuccessAt: new Date(), failures: 0, lastError: null } });
  });
}

/** All browser work shares upstream's fenced admission, heartbeat and cleanup. */
export async function runTravellerJob(): Promise<boolean> {
  const network = await prisma.extractionConfig.findUnique({ where: { id: 'singleton' }, select: { vpnProvider: true, enabled: true } });
  if (network?.enabled === false || (network?.vpnProvider && network.vpnProvider !== 'none')) return false;
  const lease = await acquireTravelLease('browser');
  if (!lease) return false;
  let job: TravellerJob | null = null;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let renewing: Promise<void> | undefined;
  let execution: TravelExecution | undefined;
  let cleanupFailed = false;
  const started = Date.now();
  try {
    job = await claim(lease);
    if (!job) return false;
    const current = job;
    const settings = await schedulerSettings();
    execution = new TravelExecution({ jobId: current.id, generation: lease.generation, resource: lease.id });
    const activeExecution = execution;
    const renew = async () => {
      if (!await renewTravelLease(lease)) throw new Error('Shared travel lease lost');
      await prisma.$transaction(async tx => { await fence(tx, current, lease); await tx.travellerJob.update({ where: { id: current.id }, data: { leaseUntil: expiry() } }); });
    };
    heartbeat = setInterval(() => { if (!renewing) renewing = renew().catch(error => activeExecution.abort(error)).finally(() => { renewing = undefined; }); }, 20_000);
    heartbeat.unref();
    const candidates = await withTravelExecution(activeExecution, async () => {
      const profile = await prisma.watchProfile.findUniqueOrThrow({ where: { id: current.profileId } });
      const constraints = profileSchema.parse(profile.constraints);
      const request = requestSchema.parse(current.request);
      return googleExploreAdapter.discover(request, { profile: constraints, signal: activeExecution.signal,
        reserveRequest: () => prisma.$transaction(async tx => { await fence(tx, current, lease); await reserveSourceRequest(tx, current.source, settings.sourceSpacingSeconds); }) });
    });
    if (heartbeat) clearInterval(heartbeat);
    await renewing;
    await finish(current, lease, candidates.sort((a, b) => a.amount - b.amount).slice(0, settings.maxCandidatesPerJob), started);
    console.log(JSON.stringify({ event: 'traveller_job', jobId: current.id, profileId: current.profileId, source: current.source, startedAt: new Date(started).toISOString(), durationMs: Date.now() - started, resultCount: candidates.length, state: 'completed' }));
    return true;
  } catch (error) {
    cleanupFailed = error instanceof TravelCleanupError;
    if (cleanupFailed) await quarantineTravelLease(lease, 'Traveller browser cleanup requires administrator recovery');
    if (job) {
      const current = job;
      const status = error instanceof SourceError ? error.status : 'degraded';
      const message = error instanceof SourceError ? error.message : cleanupFailed ? 'Browser cleanup requires administrator recovery' : 'Source context could not be confirmed; review source health';
      await prisma.$transaction(async tx => {
        await lockTravelLease(tx, lease);
        const changed = await tx.travellerJob.updateMany({ where: { id: current.id, state: 'running', leaseToken: current.leaseToken }, data: { state: 'failed', error: message, completedAt: new Date(), durationMs: Date.now() - started, leaseToken: null, leaseUntil: null } });
        if (!changed.count) return;
        const source = await tx.travellerSourceState.findUniqueOrThrow({ where: { source: current.source } });
        await tx.travellerSourceState.update({ where: { source: source.source }, data: { status, failures: { increment: 1 }, lastError: message, nextAllowedAt: nextCheck(source.source, 'WATCH', source.failures + 1) } });
      }).catch(() => { /* Fencing can reject a cancelled job or quarantined lease. */ });
      console.log(JSON.stringify({ event: 'traveller_job', jobId: current.id, profileId: current.profileId, source: current.source, startedAt: new Date(started).toISOString(), durationMs: Date.now() - started, resultCount: 0, state: 'failed', error: message }));
    }
    return false;
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    await renewing;
    if (!cleanupFailed) await releaseTravelLease(lease);
  }
}
