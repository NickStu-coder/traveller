import type { Confidence } from './scoring';

export type Verification = { source: string; independentGroup: string; identity: string; amount: number; currency: string; at: Date; direct: boolean; contextConfirmed: boolean };

export function verificationConfidence(candidate: { identity: string; amount: number; currency: string }, evidence: Verification[], now = new Date()): { confidence: Confidence; sources: string[]; verifiedAt: Date | null } {
  if (!Number.isFinite(candidate.amount) || candidate.amount <= 0) return { confidence: 'low', sources: [], verifiedAt: null };
  const matched = evidence.filter(entry => entry.contextConfirmed && entry.identity === candidate.identity && entry.currency === candidate.currency
    && Number.isFinite(entry.amount) && entry.amount > 0 && Math.abs(entry.amount / candidate.amount - 1) <= 0.05
    && entry.independentGroup.length > 0 && entry.source.length > 0
    && now.getTime() >= entry.at.getTime() && now.getTime() - entry.at.getTime() <= 15 * 60_000);
  const groups = new Set(matched.map(entry => entry.independentGroup));
  const confidence = matched.some(entry => entry.direct) || groups.size >= 2 ? 'high' : groups.size ? 'medium' : 'low';
  return { confidence, sources: [...new Set(matched.map(entry => entry.source))], verifiedAt: matched.length ? new Date(Math.max(...matched.map(entry => entry.at.getTime()))) : null };
}

/** Local stay dates come from the itinerary, never from the origin's departure date. */
export function hotelStay(arrivalLocal: string | null, departureLocal: string | null): { checkIn: string; checkOut: string; nights: number } | null {
  if (!arrivalLocal || !departureLocal) return null;
  const parse = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  if (!parse(arrivalLocal) || !parse(departureLocal)) return null;
  const nights = (Date.parse(departureLocal) - Date.parse(arrivalLocal)) / 86400000;
  return nights > 0 && nights <= 90 ? { checkIn: arrivalLocal, checkOut: departureLocal, nights } : null;
}
