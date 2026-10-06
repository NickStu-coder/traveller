/** @vitest-environment jsdom */
import { expect, it } from 'vitest';
import { profileSchema } from '../../profiles';
import { DEFAULT_HOTEL_FILTERS } from '../../../hotels/types';
import { capturePropertyQuality, googleHotelCandidates, googlePropertyQuality, hotelEligibility } from './google-hotel';
import fixture from './fixtures/google-property.json';

const profile = profileSchema.parse({ name: 'Paris', origins: ['LJU'], destination: { kind: 'anywhere' }, dates: { mode: 'rolling', days: 365 }, duration: { minNights: 5, maxNights: 12 }, passengers: { adults: 2 }, cabin: 'business', positioning: { homeAirports: ['LJU'] } });
const stay = { checkIn: '2027-04-01', checkOut: '2027-04-07' };
const search = { destination: 'Paris', dateMode: 'fixed' as const, ...stay, flexibility: 0, minNights: 6, maxNights: 6, rooms: [{ adults: 2, children: [] }], currency: 'EUR', sources: ['google_hotels' as const], filters: DEFAULT_HOTEL_FILTERS };
const quality = { hotelName: 'MOB HOUSE', header: 'MOB HOUSE•4-star tourist hotel', reviewLabel: '4.3 out of 5 stars from 1,135 reviews', amenities: ['pool'] };

it('retains the observed whole-stay price, native review scale and unknown rate conditions', () => {
  const candidates = googleHotelCandidates(fixture, quality, search, stay);
  expect(candidates).toHaveLength(1);
  expect(candidates[0]).toMatchObject({ amount: 847, rating: 4.3, ratingScale: 5, reviewCount: 1135, stars: 4, refundable: null, breakfast: null, taxesIncluded: true });
  expect(hotelEligibility(candidates[0]!, profile)).toEqual([]);
  expect(hotelEligibility(candidates[0]!, { ...profile, hotel: { ...profile.hotel, refundable: true, breakfast: true, radiusKm: 3 } })).toEqual(['breakfast_unconfirmed', 'hotel_refund_unconfirmed', 'hotel_distance_unconfirmed']);
  expect(() => googleHotelCandidates({ ...fixture, propertyName: 'Another hotel' }, quality, search, stay)).toThrow(/identity/);
  expect(() => googleHotelCandidates(fixture, quality, { ...search, rooms: [{ adults: 1, children: [] }] }, stay)).toThrow(/guest/);
});

it('does not substitute nearby attraction or sponsored hotel review counts', () => {
  document.body.innerHTML = '<div><div><div><h1>MOB HOUSE</h1></div>4-star tourist hotel</div></div><section><h2>Google review summary</h2><span aria-label="4.3 out of 5 stars from 1,135 reviews"></span></section><section><h2>Nearby places</h2><span aria-label="4.7 out of 5 stars from 168,471 reviews"></span></section>';
  const captured = capturePropertyQuality();
  expect(googlePropertyQuality(captured)).toMatchObject({ rating: 4.3, reviewCount: 1135, stars: 4 });
  expect(googlePropertyQuality({ ...captured, reviewLabel: '1.1K reviews' }).reviewCount).toBeNull();
  const candidate = googleHotelCandidates(fixture, { ...quality, reviewLabel: '' }, search, stay)[0]!;
  expect(hotelEligibility(candidate, profile)).toContain('missing_or_invalid_quality');
});
