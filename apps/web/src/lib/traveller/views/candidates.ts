import { z } from 'zod';
import { prisma } from '../../prisma';
import type { Prisma } from '@/generated/prisma/client';
import { flightCandidateSchema } from '../sources/flights/schema';
import { matchesFlightRoute, profileSchema } from '../profiles';
import { DESTINATION_REGIONS, filterDestinationRegion } from './regions';

export const candidateFilterSchema = z.object({
  origin: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional(), destination: z.string().trim().min(1).max(100).optional(),
  region: z.string().max(50).refine(value => DESTINATION_REGIONS.includes(value), 'Choose a known destination region').optional(),
  from: z.iso.date().optional(), to: z.iso.date().optional(), cabin: z.enum(['economy', 'premium_economy', 'business', 'first']).optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(), maxPrice: z.coerce.number().positive().max(1_000_000).optional(), minScore: z.coerce.number().int().min(0).max(100).optional(),
  minNights: z.coerce.number().int().min(1).max(90).optional(), maxNights: z.coerce.number().int().min(1).max(90).optional(),
  minStars: z.coerce.number().int().min(0).max(5).optional(), minRating: z.coerce.number().min(0).max(10).optional(), minReviews: z.coerce.number().int().min(0).max(10_000_000).optional(),
}).strict().refine(value => !value.from || !value.to || value.from <= value.to, 'Date window is reversed')
  .refine(value => !value.minNights || !value.maxNights || value.minNights <= value.maxNights, 'Stay length is reversed')
  .refine(value => value.maxPrice === undefined || value.currency !== undefined, 'A price filter requires a currency');
export type CandidateFilters = z.output<typeof candidateFilterSchema>;
export const candidateScoreSchema = z.object({ score: z.number().int().min(0).max(100).nullable(), band: z.enum(['insufficient', 'ordinary', 'good', 'excellent', 'extreme']),
  confidence: z.enum(['low', 'medium', 'high']), eligibility: z.array(z.string()), evidence: z.object({ median: z.number(), discount: z.number(), percentile: z.number(), samples: z.number(), ready: z.boolean() }).nullable() });

export function safeCandidateBookingUrl(value: string | null): string | null {
  if (!value) return null;
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  return url.protocol === 'https:' && url.hostname === 'www.google.com' && !url.username && !url.password && !url.port && url.pathname.startsWith('/travel/flights') ? url.href : null;
}
export async function latestFlightCandidates(userId: string, filters: CandidateFilters = {}) {
  const details: Prisma.TravellerObservationWhereInput[] = [];
  for (const [field, value] of [['origin', filters.origin], ['cabin', filters.cabin]] as const) if (value) details.push({ details: { path: [field], equals: value } });
  if (filters.destination) details.push({ details: { path: ['destinationName'], string_contains: filters.destination, mode: 'insensitive' } });
  if (filters.from) details.push({ details: { path: ['departure'], gte: filters.from } });
  if (filters.to) details.push({ details: { path: ['returnDate'], lte: filters.to } });
  if (filters.minScore !== undefined) details.push({ score: { path: ['score'], gte: filters.minScore } });
  const rows = await prisma.travellerObservation.findMany({ where: { kind: 'flight', profile: { userId, active: true, archivedAt: null }, expiresAt: { gt: new Date() },
    ...(filters.currency ? { currency: filters.currency } : {}), ...(filters.maxPrice !== undefined ? { amount: { lte: filters.maxPrice } } : {}), AND: details },
    orderBy: { observedAt: 'desc' }, distinct: ['profileId', 'identity'], take: 100, include: { profile: { select: { name: true, revision: true, constraints: true } }, evidence: { orderBy: { verifiedAt: 'desc' }, take: 10 } } });
  const parsedRows = rows.flatMap(row => {
    const details = flightCandidateSchema.safeParse(row.details), bookingUrl = safeCandidateBookingUrl(row.bookingUrl);
    const profile = profileSchema.safeParse(row.profile.constraints);
    if (!details.success || !bookingUrl || row.profileRevision !== row.profile.revision || !profile.success || !matchesFlightRoute(profile.data, details.data)) return [];
    const score = candidateScoreSchema.safeParse(row.score);
    const nights = (Date.parse(details.data.returnDepartureLocal ?? details.data.returnDate) - Date.parse(details.data.arrivalLocal ?? details.data.departure)) / 86400000;
    if (filters.minNights !== undefined && nights < filters.minNights || filters.maxNights !== undefined && nights > filters.maxNights) return [];
    return [{ ...row, bookingUrl, flight: details.data, evaluation: score.success ? score.data : null }];
  });
  return filterDestinationRegion(parsedRows, filters.region, row => row.flight.legs?.[0]?.at(-1)?.destination ?? row.flight.destination);
}
