import { googleFlightFields } from '../../scraper/flight-link';
import type { WatchConstraints } from '../profiles';
import { googleFlightSearchUrl, googlePassengerCategories } from './google-url';
import { SourceError, type DiscoveryRequest, type FlightCandidate } from './types';

export interface ExploreCard { entity: string; name: string; flightPrice: string; currency: string; stops: string; duration: string }
export interface ExploreControls {
  url: string; loading: boolean; origin: string; cabin: string; departure: string; returnDate: string;
  adultCount: number; childCount: number; infantSeatCount: number; infantLapCount: number;
  destinationEntity?: string;
}
/** This function also runs inside the page; keep it independent of module state. */
export function readExploreCardElements(elements: Element[], currency: string): ExploreCard[] {
  const symbol = new Intl.NumberFormat('en-US', { style: 'currency', currency }).formatToParts(1).find(part => part.type === 'currency')?.value ?? currency;
  return elements.slice(0, 100).map(element => {
    const price = element.querySelector('span[data-gs]:not([data-gs=""])')?.textContent?.trim() ?? '';
    return { entity: element.getAttribute('data-code') ?? '', name: element.querySelector('h3')?.textContent ?? '',
      flightPrice: price.startsWith(symbol) ? price.slice(symbol.length) : '', currency,
      stops: element.querySelector('.nx0jzf')?.textContent?.trim() ?? '', duration: element.querySelector('.Xq1DAb')?.textContent?.trim() ?? '' };
  });
}
const cabinNames = { economy: 'Economy', premium_economy: 'Premium economy', business: 'Business', first: 'First' };
const displayDate = (date: string) => new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

/** Never accept old cards while the selected search is still loading. */
export function confirmExploreContext(controls: ExploreControls, request: DiscoveryRequest, profile: WatchConstraints, paths = ['/travel/explore']): void {
  const categories = googlePassengerCategories(profile);
  const count = (category: number) => categories.filter(value => value === category).length;
  if (controls.loading || !controls.origin.endsWith(' ' + request.origin) || controls.cabin !== cabinNames[profile.cabin]
    || controls.departure !== displayDate(request.departure) || controls.returnDate !== displayDate(request.returnDate)
    || controls.adultCount !== count(1) || controls.childCount !== count(2) || controls.infantSeatCount !== 0 || controls.infantLapCount !== count(4))
    throw new SourceError('degraded', 'Google Explore did not confirm the selected search context');
  const url = new URL(controls.url);
  if (url.hostname !== 'www.google.com' || !paths.includes(url.pathname) || url.searchParams.get('curr') !== profile.currency) throw new SourceError('degraded', 'Google changed the search origin or currency');
  const encoded = url.searchParams.get('tfs') ?? '';
  if (encoded.length > 12000 || !/^[A-Za-z0-9_-]+={0,2}$/.test(encoded)) throw new SourceError('degraded', 'Google Explore did not retain date state');
  const root = googleFlightFields(Buffer.from(encoded, 'base64url'));
  const legs = root.filter(value => value.id === 3).map(value => typeof value.value !== 'bigint' ? googleFlightFields(value.value) : []);
  const dates = legs.map(leg => leg.find(value => value.id === 2)?.value).map(value => value !== undefined && typeof value !== 'bigint' ? Buffer.from(value).toString() : '');
  const selectedCabin = root.find(value => value.id === 9)?.value;
  const selectedPassengers = root.filter(value => value.id === 8).map(value => Number(value.value)).sort();
  const destination = legs[0]?.find(value => value.id === 14)?.value;
  const destinationFields = destination !== undefined && typeof destination !== 'bigint' ? googleFlightFields(destination) : [];
  const destinationCode = destinationFields.find(value => value.id === 2)?.value;
  const selectedDestination = destinationCode !== undefined && typeof destinationCode !== 'bigint' ? Buffer.from(destinationCode).toString() : null;
  const expectedDestination = controls.destinationEntity ?? request.destination;
  if (root.find(value => value.id === 2)?.value !== (url.pathname === '/travel/explore' ? 3n : 2n)
    || dates.length !== 2 || dates[0] !== request.departure || dates[1] !== request.returnDate
    || selectedDestination !== expectedDestination || root.find(value => value.id === 14)?.value !== 1n
    || selectedCabin !== BigInt(Object.keys(cabinNames).indexOf(profile.cabin) + 1) || selectedPassengers.join() !== [...categories].sort().join())
    throw new SourceError('degraded', 'Google Explore changed date, cabin or passenger state');
}

/** Card hotel averages and ground-only destinations never become flight fares. */
export function parseExploreCards(cards: ExploreCard[], request: DiscoveryRequest, profile: WatchConstraints, observedAt = new Date()): FlightCandidate[] {
  const seen = new Set<string>();
  const results: FlightCandidate[] = [];
  for (const card of cards.slice(0, 100)) {
    if (!/^\/m\/[a-zA-Z0-9_]+$/.test(card.entity) || !card.name.trim() || card.name.length > 200 || seen.has(card.entity) || card.currency !== profile.currency) continue;
    const raw = card.flightPrice.replace(/\s/g, '').replace(/^€|^£|^US\$|^CA\$|^A\$|^\$|^[A-Z]{3}/, '');
    if (!/^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?$/.test(raw)) continue;
    const amount = Number(raw.replaceAll(',', ''));
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) continue;
    const stops = card.stops === 'Nonstop' ? 0 : /^\d+ stops?$/.test(card.stops) ? Number(card.stops.split(' ')[0]) : null;
    const duration = card.duration.match(/^(?:(\d+) hr(?: )?)?(?:(\d+) min)?$/);
    const durationMinutes = duration && (duration[1] || duration[2]) ? Number(duration[1] ?? 0) * 60 + Number(duration[2] ?? 0) : null;
    seen.add(card.entity);
    results.push({ kind: 'flight', ...request, destination: card.entity, destinationName: card.name.trim(), cabin: profile.cabin,
      passengers: profile.passengers, amount, currency: profile.currency, stops, durationMinutes,
      bookingUrl: googleFlightSearchUrl({ ...request, destination: card.entity }, profile), source: 'google_explore', provenance: 'cached',
      observedAt: observedAt.toISOString(), contextConfirmed: true, checkedBags: null, selfTransfer: null, overnight: null,
      airlineCodes: [], connectionAirports: [], layoverMinutes: null, arrivalLocal: null, returnDepartureLocal: null });
  }
  return results;
}
