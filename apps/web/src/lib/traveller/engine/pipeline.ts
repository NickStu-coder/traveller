import { createHash } from 'node:crypto';
import type { Prisma, TravellerJob } from '@/generated/prisma/client';
import type { FlightCandidate } from '../sources/types';
import type { WatchConstraints } from '../profiles';
import { convertMoney, positioningCost } from './money';
import { dealScore } from './scoring';
import { historicalPrice } from './history/daily';
import { fxQuote, type FxData } from './fx';
import type { ScoreWeights } from './policy';
import { LANE_PRIORITY, nextCheck, type Lane, type SchedulerSettings } from '../scheduler/policy';
import { recordTravellerAlert } from '../alerts/record';

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function flightIdentity(candidate: FlightCandidate): string {
  return hash([candidate.origin, candidate.destination, candidate.departure, candidate.returnDate, candidate.cabin, candidate.passengers,
    candidate.legs ?? null, candidate.fare ?? null, candidate.checkedBags]);
}
export function flightComparison(candidate: FlightCandidate): string {
  const nights = (Date.parse(candidate.returnDate) - Date.parse(candidate.departure)) / 86400000;
  const lead = Math.floor((Date.parse(candidate.departure) - Date.parse(candidate.observedAt)) / 86400000);
  return hash([candidate.legs ? 'exact-v1' : 'explore-v1', candidate.origin, candidate.destination, candidate.cabin, candidate.passengers,
    candidate.currency, candidate.departure.slice(5, 7), nights, candidate.legs ? [candidate.airlineCodes.slice().sort(), candidate.stops, candidate.fare?.name, candidate.fare?.refundable, candidate.checkedBags, lead < 14 ? 'last-minute' : lead < 60 ? 'near' : 'advance'] : null]);
}
export function flightEligibility(candidate: FlightCandidate, profile: WatchConstraints): string[] {
  const reasons: string[] = [];
  if (profile.flight.maxPrice !== null && candidate.amount > profile.flight.maxPrice) reasons.push('price');
  if (profile.flight.maxStops !== null && (candidate.stops === null || candidate.stops > profile.flight.maxStops)) reasons.push('stops');
  if (profile.flight.maxDurationMinutes !== null && (candidate.durationMinutes === null || candidate.durationMinutes > profile.flight.maxDurationMinutes)) reasons.push('duration');
  if (profile.flight.checkedBags > 0 && (candidate.checkedBags === null || candidate.checkedBags < profile.flight.checkedBags)) reasons.push('baggage');
  if (!profile.flight.allowSelfTransfer && candidate.selfTransfer !== false) reasons.push('self_transfer_unconfirmed');
  if (!profile.flight.allowOvernight && candidate.overnight !== false) reasons.push('overnight_unconfirmed');
  if (candidate.layoverMinutes === null) reasons.push('layovers_unconfirmed');
  else if (candidate.layoverMinutes.some(minutes => minutes < profile.flight.minLayoverMinutes || minutes > profile.flight.maxLayoverMinutes)) reasons.push('layovers');
  if (profile.flight.excludedAirlines.length || profile.flight.preferredAirlines.length || profile.flight.excludedAirports.length) {
    if (!candidate.legs) reasons.push('airlines_airports_unconfirmed');
  }
  const excluded = profile.flight.excludedAirlines.map(value => value.toUpperCase());
  const preferred = profile.flight.preferredAirlines.map(value => value.toUpperCase());
  if (candidate.airlineCodes.some(code => excluded.includes(code))) reasons.push('excluded_airline');
  if (preferred.length && candidate.airlineCodes.length && !candidate.airlineCodes.some(code => preferred.includes(code))) reasons.push('preferred_airline');
  if (candidate.legs?.flat().some(segment => profile.flight.excludedAirports.includes(segment.origin) || profile.flight.excludedAirports.includes(segment.destination))) reasons.push('excluded_airport');
  if (!positioningCost(candidate.origin, profile.positioning.homeAirports, profile.positioning.estimates, profile.currency)) reasons.push('positioning_unavailable');
  return reasons;
}

export function monitoringLane(score: number | null, threshold: number, eligible: boolean): Lane {
  return !eligible ? 'COLD' : score !== null && score >= threshold ? 'HOT' : 'WATCH';
}

/** Price, FX and score explanations are retained with each immutable observation. */
export async function recordFlights(tx: Prisma.TransactionClient, job: TravellerJob, userId: string, profile: WatchConstraints, candidates: FlightCandidate[], engine: { baseCurrency: string; weights: ScoreWeights }, fx: FxData | null, scheduler: SchedulerSettings): Promise<void> {
  const now = new Date();
  const source = await tx.travellerSourceState.findUnique({ where: { source: 'google_flights' } });
  let queued = false;
  for (const candidate of candidates) {
    const identity = flightIdentity(candidate), comparisonKey = flightComparison(candidate), observedAt = new Date(candidate.observedAt);
    const evidence = await historicalPrice(tx, userId, comparisonKey, candidate.amount, observedAt);
    const reasons = flightEligibility(candidate, profile);
    const direct = candidate.source === 'airline_direct' && candidate.directConfirmation?.verifiedAt === candidate.observedAt;
    const confidence = direct ? 'high' : candidate.legs ? 'medium' : 'low';
    const quality = candidate.stops !== null && candidate.durationMinutes !== null ? 1 / (1 + candidate.stops * 0.15 + candidate.durationMinutes / 6000) : 0;
    const score = { ...dealScore(evidence, quality, confidence, !reasons.length, engine.weights), confidence, eligibility: reasons, kind: 'flight' };
    const quote = candidate.currency === engine.baseCurrency ? { from: candidate.currency, to: engine.baseCurrency, rate: '1', source: 'same currency', at: observedAt } : fxQuote(fx, candidate.currency, engine.baseCurrency, observedAt);
    const converted = quote ? convertMoney({ amount: String(candidate.amount), currency: candidate.currency }, engine.baseCurrency, quote, observedAt) : null;
    const data = { profileId: job.profileId, profileRevision: job.profileRevision, kind: 'flight', source: candidate.source, provenance: candidate.provenance, identity, comparisonKey,
      amount: String(candidate.amount), currency: candidate.currency, observedAt, expiresAt: new Date(observedAt.getTime() + (candidate.legs ? 30 * 60000 : 24 * 3600000)), bookingUrl: candidate.bookingUrl,
      details: candidate as unknown as Prisma.InputJsonValue, score: score as unknown as Prisma.InputJsonValue,
      ...(converted && quote ? { baseAmount: converted.amount, baseCurrency: converted.currency, fxRate: quote.rate, fxSource: quote.source, fxAt: quote.at } : {}) };
    const observation = await tx.travellerObservation.upsert({ where: { profileId_source_identity_observedAt: { profileId: job.profileId, source: candidate.source, identity, observedAt } }, update: {}, create: data });
    if (candidate.legs) {
      if (!await tx.travellerVerification.count({ where: { observationId: observation.id, source: candidate.source, verifiedAt: observedAt } }))
        await tx.travellerVerification.create({ data: { observationId: observation.id, source: candidate.source, independentGroup: direct ? 'airline_direct' : 'google_flights', identity, amount: String(candidate.amount), currency: candidate.currency, verifiedAt: observedAt, contextConfirmed: true, direct } });
      await recordTravellerAlert(tx, observation);
      if (candidate.source === 'google_flights' && candidate.fare?.provider === 'Lufthansa' && candidate.passengers.children.length === 0 && candidate.passengers.infants === 0
        && candidate.legs.flat().every(segment => ['LH', 'VL'].includes(segment.airline) && segment.date === segment.arrivalDate)
        && await tx.travellerSourceState.count({ where: { source: 'airline_direct', enabled: true } })) {
        const dedupKey = hash(['direct', job.profileId, job.profileRevision, identity, Math.floor(now.getTime() / (scheduler.watchMinutes * 60000))]);
        if (!await tx.travellerJob.findUnique({ where: { dedupKey } })) await tx.travellerJob.create({ data: { profileId: job.profileId, profileRevision: job.profileRevision,
          source: 'airline_direct', kind: 'verification', lane: 'WATCH', priority: LANE_PRIORITY.WATCH + 10, dedupKey, runAt: now, request: { observationId: observation.id } } });
      }
      for (const hotelSource of ['google_hotels', 'booking']) if (profile.hotel.enabled && await tx.travellerSourceState.count({ where: { source: hotelSource, enabled: true } })) {
        const slot = Math.floor(now.getTime() / (scheduler.watchMinutes * 60000));
        const dedupKey = hash([hotelSource === 'google_hotels' ? 'hotel' : 'booking-hotel', job.profileId, job.profileRevision, identity, slot]);
        if (!await tx.travellerJob.findUnique({ where: { dedupKey } }))
          await tx.travellerJob.create({ data: { profileId: job.profileId, profileRevision: job.profileRevision, source: hotelSource, kind: 'hotel_discovery', lane: 'WATCH', priority: LANE_PRIORITY.WATCH,
            dedupKey, runAt: now, request: { observationId: observation.id } } });
      }
      if (source?.enabled) {
        const lane = monitoringLane(score.score, profile.alerts.minScore, !reasons.length);
        const runAt = nextCheck(identity, lane, 0, now, scheduler);
        const interval = lane === 'HOT' ? scheduler.hotMinutes : lane === 'COLD' ? scheduler.coldMinutes : scheduler.watchMinutes;
        const dedupKey = hash(['recheck', job.profileId, job.profileRevision, identity, Math.floor(runAt.getTime() / (interval * 60000))]);
        if (!await tx.travellerJob.findUnique({ where: { dedupKey } }))
          await tx.travellerJob.create({ data: { profileId: job.profileId, profileRevision: job.profileRevision, source: 'google_flights', kind: 'verification', lane, priority: LANE_PRIORITY[lane], dedupKey,
            runAt, request: { observationId: observation.id, recheck: true } } });
      }
      continue;
    }
    if (queued || !source?.enabled || reasons.some(reason => ['price', 'stops', 'duration', 'positioning_unavailable'].includes(reason))) continue;
    const potential = dealScore(evidence, 1, 'high', true, engine.weights).score;
    const lane = potential !== null && potential >= profile.alerts.minScore ? 'HOT' : 'WATCH';
    const slot = Math.floor(now.getTime() / (scheduler.watchMinutes * 60000));
    const dedupKey = hash(['verify', job.profileId, job.profileRevision, identity, slot]);
    if (!await tx.travellerJob.findUnique({ where: { dedupKey } })) {
      await tx.travellerJob.create({ data: { profileId: job.profileId, profileRevision: job.profileRevision, source: 'google_flights', kind: 'verification', lane, priority: LANE_PRIORITY[lane], dedupKey,
        runAt: now, request: { observationId: observation.id } } });
      queued = true;
    }
  }
}
