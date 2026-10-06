import type { WatchConstraints } from '../profiles';
import type { DiscoveryRequest } from './types';

function integer(value: number): number[] {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid provider integer');
  const bytes: number[] = [];
  do { const byte = value % 128; value = Math.floor(value / 128); bytes.push(byte | (value ? 128 : 0)); } while (value);
  return bytes;
}
function field(id: number, value: number | string | number[]): number[] {
  if (typeof value === 'number') return [...integer(id * 8), ...integer(value)];
  const bytes = typeof value === 'string' ? [...Buffer.from(value)] : value;
  return [...integer(id * 8 + 2), ...integer(bytes.length), ...bytes];
}
const location = (code: string) => [...field(1, /^[A-Z]{3}$/.test(code) ? 1 : 2), ...field(2, code)];
export function googlePassengerCategories(profile: WatchConstraints): number[] {
  return [...Array<number>(profile.passengers.adults).fill(1), ...profile.passengers.children.map(age => age >= 12 ? 1 : 2), ...Array<number>(profile.passengers.infants).fill(4)];
}
/** Dates, airport and passenger state are explicit, then verified in visible controls. */
export function googleDiscoveryUrl(request: DiscoveryRequest, profile: WatchConstraints): string {
  if (!/^[A-Z]{3}$/.test(request.origin) || !/^\d{4}-\d{2}-\d{2}$/.test(request.departure) || !/^\d{4}-\d{2}-\d{2}$/.test(request.returnDate)) throw new Error('Invalid discovery request');
  // Human destination names need the provider's own entity selection, not a guessed ID.
  if (request.destination && !/^[A-Z]{3}$/.test(request.destination)) throw new Error('Destination entity selection is required');
  const outbound = [...field(2, request.departure), ...field(13, location(request.origin)), ...(request.destination ? field(14, location(request.destination)) : [])];
  const inbound = [...field(2, request.returnDate), ...(request.destination ? field(13, location(request.destination)) : []), ...field(14, location(request.origin))];
  const cabin = ['economy', 'premium_economy', 'business', 'first'].indexOf(profile.cabin) + 1;
  const bytes = [...field(1, 28), ...field(2, 3), ...field(3, outbound), ...field(3, inbound), ...googlePassengerCategories(profile).flatMap(value => field(8, value)), ...field(9, cabin), ...field(14, 1), ...field(19, 1)];
  const url = new URL('https://www.google.com/travel/explore');
  url.searchParams.set('tfs', Buffer.from(bytes).toString('base64url'));
  url.searchParams.set('hl', 'en'); url.searchParams.set('curr', profile.currency);
  return url.href;
}

/** A provider-supplied city entity is a search link, not a selected itinerary. */
export function googleFlightSearchUrl(request: DiscoveryRequest & { destination: string }, profile: WatchConstraints): string {
  if (!/^(?:[A-Z]{3}|\/m\/[a-zA-Z0-9_]+)$/.test(request.destination)) throw new Error('Invalid provider destination');
  const outbound = [...field(2, request.departure), ...field(13, location(request.origin)), ...field(14, location(request.destination))];
  const inbound = [...field(2, request.returnDate), ...field(13, location(request.destination)), ...field(14, location(request.origin))];
  const cabin = ['economy', 'premium_economy', 'business', 'first'].indexOf(profile.cabin) + 1;
  // Field 2 selects the provider surface: 2 is Flights; 3 redirects to Explore.
  const bytes = [...field(1, 28), ...field(2, 2), ...field(3, outbound), ...field(3, inbound), ...googlePassengerCategories(profile).flatMap(value => field(8, value)), ...field(9, cabin), ...field(14, 1)];
  const url = new URL('https://www.google.com/travel/flights');
  url.searchParams.set('tfs', Buffer.from(bytes).toString('base64url'));
  url.searchParams.set('hl', 'en'); url.searchParams.set('curr', profile.currency);
  return url.href;
}
