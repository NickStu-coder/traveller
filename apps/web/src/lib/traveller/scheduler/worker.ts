import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../../prisma';
import type { Prisma, TravellerJob, TravellerObservation } from '@/generated/prisma/client';
import { acquireTravelLease, lockTravelLease, quarantineTravelLease, releaseTravelLease, renewTravelLease, type TravelLeaseToken } from '../../travel/admission';
import { TravelExecution, TravelCleanupError, withTravelExecution } from '../../travel/execution';
import { matchesDates, matchesFlightRoute, profileSchema } from '../profiles';
import type { FlightCandidate } from '../sources/types';
import { ProfileSearchError, SourceError } from '../sources/types';
import { googleExploreAdapter } from '../sources/explore-adapter';
import { googleExactAdapter } from '../sources/flights/exact-adapter';
import { lufthansaAdapter } from '../sources/airlines/adapter';
import { flightCandidateSchema } from '../sources/flights/schema';
import { discoverGoogleHotels } from '../sources/hotels/adapter';
import { discoverBookingHotels } from '../sources/hotels/booking-adapter';
import type { HotelCandidate } from '../sources/hotels/schema';
import { recordFlights } from '../engine/pipeline';
import { recordHotels } from '../engine/trips/pipeline';
import { engineSettings } from '../engine/settings';
import { referenceRates } from '../engine/fx';
import { positioningDistances } from '../engine/positioning/geography';
import { nextCheck } from './policy';
import { IMPLEMENTED_SOURCES, reserveSourceRequest, schedulerSettings } from './store';

const requestSchema = z.object({ origin: z.string().regex(/^[A-Z]{3}$/), destination: z.string().max(100).nullable(), departure: z.iso.date(), returnDate: z.iso.date() }).strict();
const expiry = () => new Date(Date.now() + 120_000);
type JobResult = { kind: 'flights'; candidates: FlightCandidate[] } | { kind: 'hotels'; candidates: HotelCandidate[]; flight: FlightCandidate; observation: TravellerObservation };

async function fence(tx: Prisma.TransactionClient, job: TravellerJob, lease: TravelLeaseToken): Promise<void> {
  await lockTravelLease(tx, lease);
  // Lock owner, then profile, then job: edits/disabling cannot race immutable result ingestion.
  await tx.$queryRaw`SELECT u.id FROM "User" u JOIN "WatchProfile" p ON p."userId" = u.id WHERE p.id = ${job.profileId} FOR UPDATE OF u`;
  await tx.$queryRaw`SELECT id FROM "WatchProfile" WHERE id = ${job.profileId} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM "TravellerJob" WHERE id = ${job.id} FOR UPDATE`;
  if (!await tx.travellerJob.count({ where: { id: job.id, state: 'running', leaseToken: job.leaseToken, leaseUntil: { gt: new Date() }, profile: { revision: job.profileRevision, active: true, archivedAt: null, user: { disabledAt: null } } } }))
    throw new Error('Traveller job no longer owns the current profile revision');
}

async function claim(lease: TravelLeaseToken): Promise<TravellerJob | null> {
  return prisma.$transaction(async tx => {
    await lockTravelLease(tx, lease);
    const now = new Date(), day = now.toISOString().slice(0, 10);
    // The shared browser is exclusively owned; old jobs cannot still run after verified recovery.
    await tx.travellerJob.updateMany({ where: { state: 'running', leaseUntil: { lte: now } }, data: { state: 'failed', leaseToken: null, leaseUntil: null, error: 'Worker stopped; prior observations retained', completedAt: now } });
    const sources = await tx.travellerSourceState.findMany({ where: { source: { in: [...IMPLEMENTED_SOURCES] }, enabled: true, nextAllowedAt: { lte: now } } });
    const eligible = sources.filter(source => source.budgetDate !== day || source.usedToday < source.budgetPerDay).map(source => source.source);
    const jobs = await tx.travellerJob.findMany({ where: { state: 'queued', source: { in: eligible }, runAt: { lte: now }, profile: { active: true, archivedAt: null, user: { disabledAt: null } } }, orderBy: [{ priority: 'desc' }, { runAt: 'asc' }], take: 20, include: { profile: { select: { revision: true } } } });
    const requiredUnits: Record<string, number> = { google_explore: 1, google_flights: 3, google_hotels: 4, booking: 3, airline_direct: 2 };
    const available = (source: string, units: number) => {
      const state = sources.find(value => value.source === source);
      return state && (state.budgetDate !== day ? 0 : state.usedToday) + units <= state.budgetPerDay;
    };
    const job = jobs.find(value => value.profileRevision === value.profile.revision && available(value.source, requiredUnits[value.source] ?? 1)
      && (value.source !== 'airline_direct' || available('google_flights', 1)));
    if (!job) return null;
    return tx.travellerJob.update({ where: { id: job.id }, data: { state: 'running', leaseToken: randomUUID(), leaseUntil: expiry(), startedAt: now, attempts: { increment: 1 }, error: null } });
  });
}

async function finish(job: TravellerJob, lease: TravelLeaseToken, result: JobResult, started: number): Promise<void> {
  const candidates = result.candidates;
  const [engine, scheduler] = await Promise.all([engineSettings(), schedulerSettings()]);
  const fx = candidates.some(candidate => candidate.currency !== engine.baseCurrency) ? await referenceRates() : null;
  await prisma.$transaction(async tx => {
    await fence(tx, job, lease);
    const profile = await tx.watchProfile.findUniqueOrThrow({ where: { id: job.profileId } });
    const constraints = profileSchema.parse(profile.constraints);
    if (result.kind === 'flights') await recordFlights(tx, job, profile.userId, constraints, result.candidates, engine, fx, scheduler);
    else await recordHotels(tx, job, profile.userId, constraints, result.observation, result.flight, result.candidates, engine, fx);
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
    const result = await withTravelExecution(activeExecution, async (): Promise<JobResult> => {
      const profile = await prisma.watchProfile.findUniqueOrThrow({ where: { id: current.profileId } });
      const constraints = profileSchema.parse(profile.constraints);
      await positioningDistances(constraints).catch(error => { throw new ProfileSearchError(error instanceof Error ? error.message : 'Positioning geography is unavailable'); });
      const context = { profile: constraints, signal: activeExecution.signal,
        reserveRequest: (units?: number) => prisma.$transaction(async tx => {
          await fence(tx, current, lease);
          if (current.source === 'airline_direct') await reserveSourceRequest(tx, 'google_flights', settings.sourceSpacingSeconds, 1);
          await reserveSourceRequest(tx, current.source, settings.sourceSpacingSeconds, units);
        }) };
      if (current.kind === 'discovery' && current.source === 'google_explore') return { kind: 'flights', candidates: await googleExploreAdapter.discover(requestSchema.parse(current.request), context) };
      if (current.kind === 'discovery' && current.source === 'google_flights') return { kind: 'flights', candidates: await googleExactAdapter.discover(requestSchema.parse(current.request), context) };
      const hotelJob = current.kind === 'hotel_discovery' && ['google_hotels', 'booking'].includes(current.source);
      const adapter = current.source === 'airline_direct' ? lufthansaAdapter : googleExactAdapter;
      if (!hotelJob && (current.kind !== 'verification' || !['google_flights', 'airline_direct'].includes(current.source) || !adapter.verify)) throw new ProfileSearchError('Job does not have a supported adapter');
      const request = z.object({ observationId: z.string().min(1).max(100), recheck: z.boolean().default(false) }).strict().parse(current.request);
      const observation = await prisma.travellerObservation.findFirst({ where: { id: request.observationId, profileId: profile.id, profileRevision: current.profileRevision, kind: 'flight', ...(!request.recheck ? { expiresAt: { gt: new Date() } } : {}) } });
      if (!observation) throw new ProfileSearchError('Candidate expired or no longer belongs to the active profile revision');
      // An old observation supplies route context for a new provider lookup, never a reusable price.
      const candidate = flightCandidateSchema.parse(observation.details);
      if (!matchesFlightRoute(constraints, candidate)) throw new ProfileSearchError('Candidate no longer matches the selected profile airports');
      if (!matchesDates(constraints, candidate.departure, candidate.returnDate)) throw new ProfileSearchError('Candidate no longer falls within the travel window');
      if (hotelJob) {
        if (!constraints.hotel.enabled) throw new ProfileSearchError('Hotel discovery is disabled for this profile');
        return { kind: 'hotels', candidates: await (current.source === 'booking' ? discoverBookingHotels : discoverGoogleHotels)(candidate, context), observation, flight: candidate };
      }
      const verified = await adapter.verify!(candidate, context);
      return { kind: 'flights', candidates: verified ? [verified] : [] };
    });
    if (heartbeat) clearInterval(heartbeat);
    await renewing;
    const candidates = result.candidates;
    result.candidates = candidates.sort((a, b) => a.amount - b.amount).slice(0, settings.maxCandidatesPerJob) as typeof result.candidates;
    await finish(current, lease, result, started);
    console.log(JSON.stringify({ event: 'traveller_job', jobId: current.id, profileId: current.profileId, source: current.source, startedAt: new Date(started).toISOString(), durationMs: Date.now() - started, resultCount: candidates.length, state: 'completed' }));
    return true;
  } catch (error) {
    cleanupFailed = error instanceof TravelCleanupError;
    if (cleanupFailed) await quarantineTravelLease(lease, 'Traveller browser cleanup requires administrator recovery');
    if (job) {
      const current = job;
      const status = error instanceof SourceError ? error.status : 'degraded';
      const message = error instanceof SourceError || error instanceof ProfileSearchError ? error.message : cleanupFailed ? 'Browser cleanup requires administrator recovery' : 'Source context could not be confirmed; review source health';
      const settings = await schedulerSettings();
      const recorded = await prisma.$transaction(async tx => {
        await lockTravelLease(tx, lease);
        const changed = await tx.travellerJob.updateMany({ where: { id: current.id, state: 'running', leaseToken: current.leaseToken }, data: { state: 'failed', error: message, completedAt: new Date(), durationMs: Date.now() - started, leaseToken: null, leaseUntil: null } });
        if (!changed.count) return false;
        if (error instanceof ProfileSearchError) return true;
        const source = await tx.travellerSourceState.findUniqueOrThrow({ where: { source: current.source } });
        await tx.travellerSourceState.update({ where: { source: source.source }, data: { status, enabled: status !== 'blocked' && source.failures + 1 < settings.maxFailures, failures: { increment: 1 }, lastError: message, nextAllowedAt: nextCheck(source.source, 'WATCH', source.failures + 1, new Date(), settings) } });
        return true;
      }).catch(() => null);
      console.log(JSON.stringify({ event: 'traveller_job', jobId: current.id, profileId: current.profileId, source: current.source, startedAt: new Date(started).toISOString(), durationMs: Date.now() - started, resultCount: 0, state: recorded === true ? 'failed' : recorded === false ? 'cancelled' : 'fenced', error: recorded === false ? 'Results discarded after cancellation' : message }));
    }
    return false;
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    await renewing;
    if (!cleanupFailed) await releaseTravelLease(lease);
  }
}
