import type { WatchConstraints } from '../profiles';
import type { Confidence } from '../engine/scoring';

export type AlertCandidate = { amount: number; currency: string; score: number | null; confidence: Confidence; observedAt: Date; eligible: boolean; historyReady: boolean };
export type PreviousAlert = { amount: number; currency: string; createdAt: Date; delivered: boolean };
/** Cooldown and improvement apply to the same itinerary/party identity, never unrelated routes. */
export function shouldAlert(candidate: AlertCandidate, settings: WatchConstraints['alerts'], previous: PreviousAlert | null, now = new Date()): boolean {
  if (!candidate.eligible || !candidate.historyReady || candidate.score === null || candidate.score < settings.minScore
    || !Number.isFinite(candidate.amount) || candidate.amount <= 0 || candidate.confidence === 'low' && !settings.allowLowConfidence
    || !Number.isFinite(candidate.observedAt.getTime()) || candidate.observedAt > now || now.getTime() - candidate.observedAt.getTime() > 15 * 60000) return false;
  if (!previous) return true;
  if (previous.currency !== candidate.currency || !Number.isFinite(previous.amount) || previous.amount <= 0) return false;
  if (now.getTime() - previous.createdAt.getTime() < settings.cooldownHours * 3600000) return false;
  if (previous.delivered && candidate.amount >= previous.amount) return false;
  return !previous.delivered || (previous.amount - candidate.amount) / previous.amount * 100 >= settings.minImprovementPercent;
}
