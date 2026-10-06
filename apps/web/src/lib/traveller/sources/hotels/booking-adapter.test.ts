import { expect, it } from 'vitest';
import { DEFAULT_HOTEL_FILTERS } from '../../../hotels/types';
import fixture from '../../../hotels/provider-fixtures.json';
import { bookingHotelCandidates } from './booking-adapter';
import { hotelEligibility } from './google-hotel';
import { profileSchema } from '../../profiles';

it('reuses verified room allocation and tax-inclusive rates with native Booking review scale', () => {
  const search = { destination: 'London', dateMode: 'fixed' as const, checkIn: '2026-10-20', checkOut: '2026-10-23', flexibility: 0, minNights: 3, maxNights: 3,
    rooms: [{ adults: 2, children: [6] }, { adults: 1, children: [] }], currency: 'USD', sources: ['booking' as const], filters: DEFAULT_HOTEL_FILTERS };
  const quality = { propertyName: fixture.booking.propertyName, starsLabel: '4 out of 5 stars', reviewLabel: 'Rated: Very good 8.5, based on 2,228 reviews' };
  const candidates = bookingHotelCandidates(fixture.booking, quality, search, 'LHR');
  expect(candidates.length).toBeGreaterThan(0);
  expect(candidates[0]).toMatchObject({ source: 'booking', provenance: 'live', rating: 8.5, ratingScale: 10, reviewCount: 2228, rooms: search.rooms, destinationAirport: 'LHR', taxesIncluded: true });
  const profile = profileSchema.parse({ name: 'Family', origins: ['LJU'], destination: { kind: 'anywhere' }, dates: { mode: 'rolling', days: 365 }, duration: { minNights: 3, maxNights: 12 }, passengers: { adults: 3, children: [6] }, cabin: 'business', positioning: { homeAirports: ['LJU'] }, hotel: { rooms: 2 } });
  expect(hotelEligibility(candidates[0]!, profile)).not.toContain('quality_threshold');
  const unknown = bookingHotelCandidates(fixture.booking, { ...quality, reviewLabel: 'Nearby property: 9.8 with 50000 reviews' }, search, 'LHR')[0]!;
  expect(unknown.reviewCount).toBeNull();
  expect(hotelEligibility(unknown, profile)).toContain('missing_or_invalid_quality');
  expect(() => bookingHotelCandidates({ ...fixture.booking, propertyName: 'Another hotel' }, quality, search, 'LHR')).toThrow(/identity/);
});
