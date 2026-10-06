import { createHash } from 'node:crypto';
import type { Page } from 'playwright';
import { googleSearchUrl, selectGoogleTotal } from '../../../hotels/google';
import { captureHotelLinks } from '../../../hotels/link-capture';
import { DEFAULT_HOTEL_FILTERS, type HotelSearch } from '../../../hotels/types';
import { hotelStay } from '../../engine/verification';
import type { FlightCandidate, SourceContext } from '../types';
import { ProfileSearchError, SourceError } from '../types';
import { withGooglePage } from '../browser';
import { rejectGoogleConsent, settleGoogle } from '../shared/context';
import { capturePropertyQuality, googleHotelCandidates } from './google-hotel';
import type { HotelCandidate } from './schema';

export function hotelSearch(flight: FlightCandidate, context: SourceContext): HotelSearch {
  const stay = hotelStay(flight.arrivalLocal, flight.returnDepartureLocal);
  if (!stay || !flight.legs) throw new ProfileSearchError('Hotel dates require a confirmed local itinerary');
  if (context.profile.hotel.rooms !== 1 || context.profile.passengers.infants)
    throw new ProfileSearchError('Google Hotels cannot confirm this room or infant allocation; no trip price was recorded');
  return { destination: flight.destinationName, dateMode: 'fixed', ...stay, flexibility: 0, minNights: stay.nights, maxNights: stay.nights,
    rooms: [{ adults: context.profile.passengers.adults, children: context.profile.passengers.children }], currency: context.profile.currency,
    sources: ['google_hotels'], filters: DEFAULT_HOTEL_FILTERS };
}

async function hotelControls(page: Page): Promise<string> {
  return page.locator('input,select,button,[role="combobox"]').evaluateAll(elements => elements.map(element => {
    const label = element.getAttribute('aria-label') ?? '';
    const value = element instanceof HTMLInputElement || element instanceof HTMLSelectElement ? `${element.name}=${element.value}` : element.textContent;
    const guests = /^(Add|Remove) (adult|child)$/.test(label) ? element.parentElement?.parentElement?.textContent ?? '' : '';
    return `${label} ${value} ${guests}`;
  }).join('\n'));
}

/** One shortlist/property workflow per fenced job; provider totals remain cached evidence. */
export async function discoverGoogleHotels(flight: FlightCandidate, context: SourceContext): Promise<HotelCandidate[]> {
  const search = hotelSearch(flight, context), stay = { checkIn: search.checkIn, checkOut: search.checkOut };
  await context.reserveRequest(4);
  return withGooglePage(context.signal, async (page, navigation) => {
    await page.goto(googleSearchUrl(search, stay), { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await navigation.settle(); await rejectGoogleConsent(page, navigation); await settleGoogle(page);
    await page.getByRole('link', { name: /^View prices for / }).first().waitFor({ state: 'visible', timeout: 45_000 });
    const cards = await page.getByRole('link', { name: /^View prices for / }).evaluateAll(elements => elements.slice(0, 50).flatMap(element => {
      const name = element.getAttribute('aria-label')?.replace(/^View prices for /, '') ?? '';
      const card = element.closest('.BcKagd');
      const label = [...(card?.querySelectorAll('[aria-label]') ?? [])].map(node => node.getAttribute('aria-label') ?? '').find(value => value.endsWith(', ' + name) && /^\d(?:\.\d)? out of 5 stars from/.test(value));
      const quality = label?.match(/^(\d(?:\.\d)?) out of 5 stars from ([\d,]+) reviews,/);
      const stars = card?.textContent?.match(/([1-5])-star (?:tourist hotel|hotel|tourist residence|aparthotel)/i)?.[1];
      if (!name || !quality || !stars) return [];
      return [{ name, rating: Number(quality[1]), reviews: Number(quality[2]!.replaceAll(',', '')), stars: Number(stars) }];
    }));
    const eligible = cards.filter(card => card.rating * 2 >= context.profile.hotel.minRating && card.reviews >= context.profile.hotel.minReviews && card.stars >= context.profile.hotel.minStars);
    if (!eligible.length) return [];
    // Rotate confirmed properties across checks rather than repeatedly checking only the first card.
    const bucket = Math.floor(Date.now() / 3600000);
    const index = createHash('sha256').update(JSON.stringify([flight.origin, flight.destination, stay, bucket])).digest().readUInt32BE(0) % eligible.length;
    const selected = eligible[index]!;
    await page.getByRole('link', { name: 'View prices for ' + selected.name, exact: true }).first().click();
    await settleGoogle(page);
    const open = page.getByRole('link', { name: 'Open ' + selected.name + ' in a new tab.', exact: true });
    await open.waitFor({ state: 'visible', timeout: 45_000 });
    const link = await open.getAttribute('href');
    if (!link) throw new SourceError('degraded', 'Google Hotels did not provide a selected property identity');
    await page.goto(new URL(link, page.url()).href, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await navigation.settle(); await settleGoogle(page);
    await page.getByRole('heading', { level: 1, name: selected.name, exact: true }).waitFor({ state: 'visible', timeout: 45_000 });
    await page.getByRole('button', { name: /^Price displayed/ }).first().waitFor({ state: 'visible', timeout: 45_000 });
    const totalPriceBasis = await selectGoogleTotal(page);
    await page.getByRole('progressbar', { name: 'Loading prices', exact: true }).first().waitFor({ state: 'hidden', timeout: 45_000 });
    await settleGoogle(page);
    const metadata = await page.evaluate(capturePropertyQuality);
    const links = (await captureHotelLinks(page, 'google_hotels')).filter(link => !/Asterisk|customized|members?[- ]only|sign in/i.test(link.text));
    return googleHotelCandidates({ url: page.url(), text: (await page.locator('body').innerText()).slice(0, 90000), controls: (await hotelControls(page)).slice(0, 20000),
      links, images: [], propertyName: metadata.hotelName, totalPriceBasis }, metadata, search, stay).map(hotel => ({ ...hotel, destinationAirport: flight.legs?.[0]?.at(-1)?.destination ?? null }));
  });
}
