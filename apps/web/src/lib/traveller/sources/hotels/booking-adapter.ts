import { createHash } from 'node:crypto';
import type { Page } from 'playwright';
import { bookingSearchUrl } from '../../../hotels/booking';
import { captureBookingRates } from '../../../hotels/booking-capture';
import { extractBookingOffers } from '../../../hotels/booking-extraction';
import type { HotelPageCapture } from '../../../hotels/extraction';
import { DEFAULT_HOTEL_FILTERS, type HotelSearch } from '../../../hotels/types';
import { getCarCatalogAirport } from '../../../cars/locations';
import { hotelStay } from '../../engine/verification';
import { withGooglePage } from '../browser';
import { ProfileSearchError, SourceError, type FlightCandidate, type SourceContext } from '../types';
import { hotelCandidateSchema } from './schema';

export function bookingHotelSearch(flight: FlightCandidate, context: SourceContext): HotelSearch {
  const stay = hotelStay(flight.arrivalLocal, flight.returnDepartureLocal), party = context.profile.passengers;
  const count = context.profile.hotel.rooms;
  if (!stay || !flight.legs || count > party.adults) throw new ProfileSearchError('Booking hotel search requires local itinerary dates and an adult in each room');
  const rooms = Array.from({ length: count }, (_, index) => ({ adults: Math.floor(party.adults / count) + (index < party.adults % count ? 1 : 0), children: [] as number[] }));
  [...party.children, ...Array<number>(party.infants).fill(0)].forEach((age, index) => rooms[index % count]!.children.push(age));
  return { destination: flight.destinationName, dateMode: 'fixed', ...stay, flexibility: 0, minNights: stay.nights, maxNights: stay.nights,
    rooms, currency: context.profile.currency, sources: ['booking'], filters: DEFAULT_HOTEL_FILTERS };
}

export interface BookingPropertyQuality { propertyName: string; starsLabel: string; reviewLabel: string }
export function captureBookingPropertyQuality(): BookingPropertyQuality {
  const heading = document.querySelector('#hp_hotel_name h2,.pp-header__title h2,#hp_hotel_name,.pp-header__title,h1');
  const labels = [...(heading?.parentElement?.parentElement?.querySelectorAll('[aria-label],[title]') ?? [])].map(element => element.getAttribute('aria-label') ?? element.getAttribute('title') ?? '');
  return { propertyName: heading?.textContent?.trim().split('\n').filter(Boolean).at(-1) ?? '',
    starsLabel: labels.find(label => /^[1-5] (?:out of 5|stars)/i.test(label)) ?? '',
    reviewLabel: document.querySelector('[data-testid="PropertyReviewsRegionBlock"] [aria-label^="Rated:"]')?.getAttribute('aria-label') ?? '' };
}

/** The native deterministic rate parser verifies dates, allocation, availability and taxes. */
export function bookingHotelCandidates(capture: HotelPageCapture, metadata: BookingPropertyQuality, search: HotelSearch, destinationAirport: string) {
  if (capture.propertyName !== metadata.propertyName) throw new Error('Booking property identity changed');
  const review = metadata.reviewLabel.match(/^Rated: .+? (\d+(?:\.\d+)?), based on ([\d,]+) reviews?$/);
  const rating = review ? Number(review[1]) : null, reviewCount = review ? Number(review[2]!.replaceAll(',', '')) : null;
  const stars = Number(metadata.starsLabel.match(/^([1-5]) (?:out of 5|stars)/)?.[1]) || null;
  return extractBookingOffers(capture, search, { checkIn: search.checkIn, checkOut: search.checkOut }).map(offer => hotelCandidateSchema.parse({
    kind: 'hotel', source: 'booking', provenance: 'live', propertyId: offer.propertyId, hotelName: offer.hotelName, destinationName: search.destination, destinationAirport,
    checkIn: offer.checkIn, checkOut: offer.checkOut, rooms: offer.rooms, amount: offer.totalPrice, currency: offer.currency, propertyUrl: offer.propertyUrl,
    seller: 'Booking.com', observedAt: new Date().toISOString(), contextConfirmed: true, taxesIncluded: true,
    roomName: offer.roomName, rateName: offer.rateName, refundable: offer.refundable, breakfast: offer.breakfast,
    stars, rating, ratingScale: 10, reviewCount, amenities: Object.entries(offer.amenities).filter(([, confirmed]) => confirmed === true).map(([name]) => name), propertyType: null, distanceKm: null,
  }));
}

async function bookingState(page: Page): Promise<void> {
  const text = (await page.locator('body').innerText()).slice(0, 12000);
  if (/captcha|verify (?:that )?you(?:'re| are) human|access denied|just a moment|checking your browser/i.test(text))
    throw new SourceError('blocked', 'Booking access challenge; unattended requests stopped');
  if (/too many requests|rate limit/i.test(text)) throw new SourceError('rate_limited', 'Booking request limit');
  const decline = page.getByRole('button', { name: 'Decline', exact: true });
  if (await decline.isVisible()) await decline.click();
  const dismiss = page.getByRole('button', { name: 'Dismiss sign in information', exact: true });
  if (await dismiss.isVisible()) await dismiss.click();
}

/** Two bounded page navigations, one selected property, no membership or reservation. */
export async function discoverBookingHotels(flight: FlightCandidate, context: SourceContext) {
  const search = bookingHotelSearch(flight, context), airport = flight.legs?.[0]?.at(-1)?.destination;
  const country = airport ? (await getCarCatalogAirport(airport))?.country.toLowerCase() : null;
  if (!airport || !country) throw new ProfileSearchError('Booking destination country requires a confirmed arrival airport');
  await context.reserveRequest(3);
  return withGooglePage(context.signal, async (page, navigation) => {
    await page.goto(bookingSearchUrl(search, search), { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await navigation.settle(); await bookingState(page);
    await page.locator('[data-testid="property-card"]').first().waitFor({ state: 'visible', timeout: 45_000 });
    const cards = await page.locator('[data-testid="property-card"]').evaluateAll(elements => elements.slice(0, 50).map(element => ({
      url: element.querySelector('a[href*="/hotel/"]')?.getAttribute('href') ?? '',
      text: (element as HTMLElement).innerText,
      stars: [...element.querySelectorAll('[aria-label]')].map(node => node.getAttribute('aria-label') ?? '').find(label => /^[1-5] (?:out of 5|stars)/.test(label)) ?? '',
    })));
    const eligible = cards.filter(card => {
      const url = new URL(card.url, page.url()), rating = Number(card.text.match(/Scored\s+(\d+(?:\.\d+)?)/)?.[1]);
      const reviews = Number(card.text.match(/([\d,]+) reviews/)?.[1]?.replaceAll(',', '')), stars = Number(card.stars[0]);
      return url.hostname === 'www.booking.com' && url.pathname.startsWith('/hotel/' + country + '/') && rating >= context.profile.hotel.minRating && reviews >= context.profile.hotel.minReviews && stars >= context.profile.hotel.minStars;
    });
    if (!eligible.length) return [];
    const index = createHash('sha256').update(JSON.stringify([airport, search.checkIn, Math.floor(Date.now() / 3600000)])).digest().readUInt32BE(0) % eligible.length;
    const selected = new URL(eligible[index]!.url, page.url());
    const url = bookingSearchUrl(search, search, { source: 'booking', propertyId: '', hotelName: search.destination, propertyUrl: selected.href, roomName: null, rateName: null, seller: 'Booking.com', refundable: null, breakfast: null });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await navigation.settle(); await bookingState(page);
    if (new URL(page.url()).pathname.replace(/\.[a-z]{2}(?:-[a-z]{2})?\.html$/, '.html') !== selected.pathname.replace(/\.[a-z]{2}(?:-[a-z]{2})?\.html$/, '.html')) throw new SourceError('degraded', 'Booking substituted the selected property');
    await page.locator('select[name^="nr_rooms_"]').first().waitFor({ state: 'visible', timeout: 45_000 });
    const metadata = await page.evaluate(captureBookingPropertyQuality);
    const controls = await page.locator('input,select,button,[role="combobox"]').evaluateAll(elements => elements.filter(element => !(element instanceof HTMLInputElement) || element.type !== 'hidden' || /^(checkin|checkout|group_|req_|age|room|interval)/.test(element.name)).map(element => `${element.getAttribute('aria-label') ?? ''} ${element instanceof HTMLInputElement || element instanceof HTMLSelectElement ? element.name + '=' + element.value : element.textContent}`).join('\n'));
    const capture = { url: page.url(), text: (await page.locator('body').innerText()).slice(0, 90000), controls: controls.slice(0, 20000), links: [], images: [], rates: await captureBookingRates(page), ...metadata };
    return bookingHotelCandidates(capture, metadata, search, airport);
  }, 'booking');
}
