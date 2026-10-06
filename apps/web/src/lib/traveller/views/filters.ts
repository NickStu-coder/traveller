import type { CandidateFilters } from './candidates';
import { candidateFilterSchema } from './candidates';
import type { HotelCandidate } from '../sources/hotels/schema';

export type SearchParams = Record<string, string | string[] | undefined>;
export function parseCandidateFilters(params: SearchParams) {
  return candidateFilterSchema.safeParse(Object.fromEntries(Object.entries(params).filter(([key, value]) => key !== 'kind' && typeof value === 'string' && value !== '')));
}

/** Unknown quality never satisfies an explicitly requested quality threshold. */
export function hotelMatchesFilters(hotel: HotelCandidate, filters: CandidateFilters): boolean {
  const nights = (Date.parse(hotel.checkOut) - Date.parse(hotel.checkIn)) / 86400000;
  return !(filters.minNights !== undefined && nights < filters.minNights
    || filters.maxNights !== undefined && nights > filters.maxNights
    || filters.minStars !== undefined && (hotel.stars === null || hotel.stars < filters.minStars)
    || filters.minRating !== undefined && (hotel.rating === null || hotel.rating / hotel.ratingScale * 10 < filters.minRating)
    || filters.minReviews !== undefined && (hotel.reviewCount === null || hotel.reviewCount < filters.minReviews));
}
