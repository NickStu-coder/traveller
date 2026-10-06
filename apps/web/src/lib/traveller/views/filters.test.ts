import { expect, it } from 'vitest';
import { hotelMatchesFilters, parseCandidateFilters } from './filters';
import { hotelCandidateSchema } from '../sources/hotels/schema';
import fixture from '../sources/hotels/fixtures/google-property.json';
import { googleHotelCandidates } from '../sources/hotels/google-hotel';
import { DEFAULT_HOTEL_FILTERS } from '../../hotels/types';

it('validates discovery duration and currency while rejecting unknown hotel quality', () => {
  expect(parseCandidateFilters({ kind: 'hotel', minNights: '8', maxNights: '3' }).success).toBe(false);
  expect(parseCandidateFilters({ kind: 'trip', maxPrice: '500' }).success).toBe(false);
  expect(parseCandidateFilters({ kind: 'hotel', minRating: '8.5', currency: 'EUR', maxPrice: '500' }).success).toBe(true);
  // A complete schema-valid property is used below; unknown quality must stay unknown.
  const stay = { checkIn: '2027-04-01', checkOut: '2027-04-07' };
  const search = { destination: 'Paris', dateMode: 'fixed' as const, ...stay, flexibility: 0, minNights: 6, maxNights: 6, rooms: [{ adults: 2, children: [] }], currency: 'EUR', sources: ['google_hotels' as const], filters: DEFAULT_HOTEL_FILTERS };
  const hotel = hotelCandidateSchema.parse(googleHotelCandidates(fixture, { hotelName: 'MOB HOUSE', header: 'MOB HOUSE•4-star tourist hotel', reviewLabel: '4.3 out of 5 stars from 1,135 reviews', amenities: ['pool'] }, search, stay)[0]);
  expect(hotelMatchesFilters({ ...hotel, rating: null }, { minRating: 8 })).toBe(false);
  expect(hotelMatchesFilters({ ...hotel, stars: null }, { minStars: 4 })).toBe(false);
  expect(hotelMatchesFilters({ ...hotel, reviewCount: 2 }, { minReviews: 50 })).toBe(false);
});
