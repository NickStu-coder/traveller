export type HistorySample = { key: string; price: number; observedAt: Date };
export type Confidence = 'low' | 'medium' | 'high';
export type PriceEvidence = { median: number; percentile: number; discount: number; samples: number; days: number; rejected: number; ready: boolean };
const clamp = (value: number) => Math.max(0, Math.min(1, value));
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/** One daily median prevents repeated checks or multiple wrappers inflating evidence. */
export function priceEvidence(key: string, current: number, history: HistorySample[], now = new Date()): PriceEvidence | null {
  if (!Number.isFinite(current) || current <= 0) return null;
  const buckets = new Map<string, number[]>();
  for (const sample of history) {
    const age = now.getTime() - sample.observedAt.getTime();
    if (sample.key !== key || !Number.isFinite(sample.price) || sample.price <= 0 || !Number.isFinite(age) || age < 0 || age > 365 * 86400000) continue;
    const day = sample.observedAt.toISOString().slice(0, 10);
    buckets.set(day, [...(buckets.get(day) ?? []), sample.price]);
  }
  const daily = [...buckets.values()].map(median);
  if (!daily.length) return null;
  const centre = median(daily);
  const deviation = median(daily.map(value => Math.abs(value - centre)));
  // A relative floor handles zero MAD in repeated fare data without admitting extreme typos.
  const spread = Math.max(deviation * 1.4826 * 4, centre * 0.25);
  const retained = daily.filter(value => Math.abs(value - centre) <= spread);
  const baseline = median(retained);
  const percentile = retained.reduce((sum, value) => sum + (value < current ? 1 : value === current ? 0.5 : 0), 0) / retained.length;
  return { median: baseline, percentile, discount: 1 - current / baseline, samples: retained.length, days: buckets.size, rejected: daily.length - retained.length, ready: retained.length >= 10 };
}

export function hotelQuality(rating: number | null, scale: 5 | 10, reviews: number | null, stars: number | null, requirements: { minRating: number; minReviews: number; minStars: number }) {
  if (rating === null || reviews === null || stars === null || !Number.isFinite(rating) || !Number.isInteger(reviews) || reviews < 0 || !Number.isFinite(stars) || stars < 0 || stars > 5 || rating < 0 || rating > scale)
    return { eligible: false, quality: 0, reviewConfidence: 0, reason: 'missing_or_invalid_quality' };
  const normalized = rating / scale;
  const confidence = reviews / (reviews + 100);
  const adjusted = normalized * confidence + 0.7 * (1 - confidence);
  const eligible = normalized * 10 >= requirements.minRating && reviews >= requirements.minReviews && stars >= requirements.minStars;
  return { eligible, quality: clamp(adjusted), reviewConfidence: confidence, reason: eligible ? null : 'quality_threshold' };
}

export function dealScore(evidence: PriceEvidence | null, quality: number, confidence: Confidence, eligible = true) {
  if (!eligible || !evidence?.ready || !Number.isFinite(quality) || evidence.discount <= 0) return { score: null, band: 'insufficient' as const, version: 'traveller-v1', evidence };
  const factors = {
    discount: clamp(evidence.discount / 0.5) * 35,
    percentile: (1 - evidence.percentile) * 30,
    quality: clamp(quality) * 20,
    verification: ({ low: 0, medium: 0.5, high: 1 }[confidence]) * 15,
  };
  const score = Math.min(confidence === 'low' ? 79 : confidence === 'medium' ? 89 : 100, Math.round(Object.values(factors).reduce((sum, value) => sum + value, 0)));
  return { score, band: score >= 90 ? 'extreme' : score >= 80 ? 'excellent' : score >= 70 ? 'good' : 'ordinary', version: 'traveller-v1', factors, evidence };
}

export function tripScore(totalEvidence: PriceEvidence | null, flightScore: number | null, hotelScore: number | null, confidence: Confidence) {
  if (flightScore === null || hotelScore === null) return dealScore(null, 0, confidence);
  // Total historical cost controls the price factors; component value controls quality.
  return dealScore(totalEvidence, Math.min(flightScore, hotelScore) / 100, confidence);
}
