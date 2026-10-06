import { extractGoogleOffers } from '../../../hotels/google-extraction';
import type { HotelPageCapture } from '../../../hotels/extraction';
import type { HotelSearch, HotelStay } from '../../../hotels/types';
import type { WatchConstraints } from '../../profiles';
import { hotelQuality } from '../../engine/scoring';
import { hotelCandidateSchema, type HotelCandidate } from './schema';

export interface PropertyQuality { hotelName: string; header: string; reviewLabel: string; amenities: string[] }

/** Only labels scoped to this property's header/review section are accepted. */
export function googlePropertyQuality(metadata: PropertyQuality) {
  const review = metadata.reviewLabel.match(/^(\d(?:\.\d)?) out of 5 stars from ([\d,]+) reviews(?:[.,]|$)/);
  const stars = metadata.header.match(/([1-5])-star (tourist hotel|hotel|tourist residence|aparthotel)/i);
  return { rating: review ? Number(review[1]) : null, reviewCount: review ? Number(review[2]!.replaceAll(',', '')) : null,
    stars: stars ? Number(stars[1]) : null, propertyType: stars?.[2]?.toLowerCase() ?? null };
}

export function hotelEligibility(candidate: HotelCandidate, profile: WatchConstraints): string[] {
  const quality = hotelQuality(candidate.rating, candidate.ratingScale, candidate.reviewCount, candidate.stars, profile.hotel);
  const reasons: string[] = quality.eligible ? [] : [quality.reason!];
  const nights = (Date.parse(candidate.checkOut) - Date.parse(candidate.checkIn)) / 86400000;
  if (nights <= 0 || candidate.rooms.length !== profile.hotel.rooms) reasons.push('stay_allocation');
  if (profile.hotel.maxTotalPrice !== null && candidate.amount > profile.hotel.maxTotalPrice) reasons.push('hotel_price');
  if (profile.hotel.maxNightlyPrice !== null && candidate.amount / nights > profile.hotel.maxNightlyPrice) reasons.push('hotel_nightly_price');
  if (profile.hotel.breakfast && candidate.breakfast !== true) reasons.push('breakfast_unconfirmed');
  if (profile.hotel.refundable && candidate.refundable !== true) reasons.push('hotel_refund_unconfirmed');
  if (profile.hotel.radiusKm !== null && (candidate.distanceKm === null || candidate.distanceKm > profile.hotel.radiusKm)) reasons.push('hotel_distance_unconfirmed');
  if (profile.hotel.amenities.some(value => !candidate.amenities.includes(value.toLowerCase()))) reasons.push('hotel_amenities_unconfirmed');
  if (profile.hotel.propertyTypes.length && !profile.hotel.propertyTypes.some(value => candidate.propertyType?.includes(value.toLowerCase()))) reasons.push('hotel_type_unconfirmed');
  return reasons;
}

export function googleHotelCandidates(capture: HotelPageCapture, metadata: PropertyQuality, search: HotelSearch, stay: HotelStay, observedAt = new Date()): HotelCandidate[] {
  if (capture.propertyName !== metadata.hotelName || !new URL(capture.url).pathname.startsWith('/travel/hotels/entity/')) throw new Error('Selected hotel identity changed');
  const quality = googlePropertyQuality(metadata);
  return extractGoogleOffers(capture, search, stay).filter(offer => offer.hotelName === metadata.hotelName).map(offer => hotelCandidateSchema.parse({
    kind: 'hotel', source: 'google_hotels', provenance: 'cached', propertyId: offer.propertyId, hotelName: offer.hotelName, destinationName: search.destination,
    ...stay, rooms: offer.rooms, amount: offer.totalPrice, currency: offer.currency, propertyUrl: offer.propertyUrl, seller: offer.seller, observedAt: observedAt.toISOString(),
    contextConfirmed: true, taxesIncluded: true, roomName: offer.roomName, rateName: offer.rateName, refundable: offer.refundable, breakfast: offer.breakfast,
    ...quality, ratingScale: 5, amenities: metadata.amenities, distanceKm: null,
  }));
}

/** Runs in the provider page. The review heading scopes out nearby places and ads. */
export function capturePropertyQuality(): PropertyQuality {
  const heading = document.querySelector('h1');
  const hotelName = heading?.textContent?.trim() ?? '';
  const header = heading?.parentElement?.parentElement?.textContent ?? '';
  const summary = [...document.querySelectorAll('h2')].find(element => element.textContent?.trim() === 'Google review summary');
  let scope: Element | null = summary ?? null;
  let reviewLabel = '';
  for (let depth = 0; scope && depth < 5; depth++, scope = scope.parentElement) {
    const labels = [...scope.querySelectorAll('[aria-label]')].map(element => element.getAttribute('aria-label') ?? '').filter(label => /^\d(?:\.\d)? out of 5 stars from [\d,]+ reviews$/.test(label));
    const unique = [...new Set(labels)];
    if (unique.length === 1) { reviewLabel = unique[0]!; break; }
  }
  const about = [...document.querySelectorAll('h3')].find(element => element.textContent?.trim() === 'Popular amenities');
  const text = about?.parentElement?.textContent?.toLowerCase() ?? '';
  const amenities = [['pool', /\bpool\b/], ['parking', /\bparking\b/], ['wifi', /\bwi-fi\b/], ['air conditioning', /\bair conditioning\b/], ['pets', /\bpet-friendly\b/], ['accessible', /\baccessible\b/]] as const;
  return { hotelName, header, reviewLabel, amenities: amenities.filter(([, pattern]) => pattern.test(text)).map(([name]) => name) };
}
