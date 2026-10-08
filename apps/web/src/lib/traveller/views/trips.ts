import { prisma } from '../../prisma';
import { tripCandidateSchema } from '../engine/trips/schema';
import { hotelCandidateSchema } from '../sources/hotels/schema';
import { flightCandidateSchema } from '../sources/flights/schema';
import { matchesFlightRoute, profileSchema } from '../profiles';
import { candidateScoreSchema } from './candidates';
import type { CandidateFilters } from './candidates';
import { hotelMatchesFilters } from './filters';
import { filterDestinationRegion } from './regions';

export function safeHotelUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && (url.hostname === 'www.google.com' && url.pathname.startsWith('/travel/hotels/entity/')
      || url.hostname === 'www.booking.com' && /^\/hotel\/[a-z]{2}\/[\w.-]+\.html$/.test(url.pathname)) ? url.href : null;
  } catch { return null; }
}

export async function latestTrips(userId: string, filters: CandidateFilters = {}) {
  const rows = await prisma.travellerObservation.findMany({ where: { kind: 'trip', profile: { userId, active: true, archivedAt: null }, expiresAt: { gt: new Date() } },
    orderBy: { observedAt: 'desc' }, distinct: ['profileId', 'identity'], take: 100,
    include: { profile: { select: { name: true, revision: true, constraints: true } }, trip: { include: { flight: true, hotel: true } } } });
  const parsedRows = rows.flatMap(row => {
    const details = tripCandidateSchema.safeParse(row.details), evaluation = candidateScoreSchema.safeParse(row.score);
    const flight = flightCandidateSchema.safeParse(row.trip?.flight.details), hotel = hotelCandidateSchema.safeParse(row.trip?.hotel.details);
    const profile = profileSchema.safeParse(row.profile.constraints);
    if (!details.success || !flight.success || !hotel.success || row.profileRevision !== row.profile.revision
      || details.data.flightObservationId !== row.trip?.flight.id || details.data.hotelObservationId !== row.trip?.hotel.id
      || !profile.success || !matchesFlightRoute(profile.data, flight.data)) return [];
    if (filters.origin && details.data.origin !== filters.origin || filters.cabin && details.data.cabin !== filters.cabin
      || filters.destination && !details.data.destinationName.toLocaleLowerCase('en').includes(filters.destination.toLocaleLowerCase('en'))
      || filters.from && details.data.departure < filters.from || filters.to && details.data.returnDate > filters.to
      || filters.currency && row.currency !== filters.currency || filters.maxPrice !== undefined && row.amount.greaterThan(filters.maxPrice)
      || filters.minScore !== undefined && (!evaluation.success || evaluation.data.score === null || evaluation.data.score < filters.minScore)
      || !hotelMatchesFilters(hotel.data, filters)) return [];
    return [{ ...row, details: details.data, flight: flight.data, hotel: hotel.data, evaluation: evaluation.success ? evaluation.data : null }];
  });
  return filterDestinationRegion(parsedRows, filters.region, row => row.flight.legs?.[0]?.at(-1)?.destination ?? row.flight.destination);
}

/** Diversify measured eligible trips by destination; unknown/warming scores are excluded. */
export function surpriseTrips<T extends { details: { destinationName: string }; evaluation: { score: number | null; eligibility: string[] } | null }>(rows: T[], minimumScore = 70, limit = 6): T[] {
  const sorted = rows.filter(row => row.evaluation?.score !== null && row.evaluation?.score !== undefined && row.evaluation.score >= minimumScore && row.evaluation.eligibility.length === 0)
    .sort((a, b) => b.evaluation!.score! - a.evaluation!.score!);
  const seen = new Set<string>();
  return sorted.filter(row => {
    const destination = row.details.destinationName.toLocaleLowerCase('en');
    if (seen.has(destination)) return false;
    seen.add(destination); return true;
  }).slice(0, limit);
}
