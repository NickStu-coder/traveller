import { readFlightLink } from '../../../scraper/flight-link';
import { matchesFlightRoute, type WatchConstraints } from '../../profiles';
import { googlePassengerCategories } from '../google-url';
import type { FlightCandidate, FlightSegment } from '../types';

export interface SegmentCard { origin: string; destination: string; departure: string; arrival: string; cabin: string; flight: string; duration: string; layover: string }
export interface FareCard { label: string; text: string }
export function minutes(text: string): number | null {
  const match = text.replace(/^Travel time:\s*/, '').trim().match(/^(?:(\d+) hr(?: )?)?(?:(\d+) min)?$/);
  return match && (match[1] || match[2]) ? Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0) : null;
}
/** Captured Google segment structure; never read prices from arbitrary page text. */
export function readSegmentCards(elements: Element[]): SegmentCard[] {
  // Object methods preserve their own names when this function is serialized
  // into Chromium by the tsx runtime; no outer bundler helper is required.
  const read = { value(element: Element, selector: string) { return element.querySelector(selector)?.textContent?.replace(/\u00a0/g, ' ').trim() ?? ''; } };
  return elements.map(element => ({ origin: read.value(element, '.ZHa2lc'), destination: read.value(element, '.FY5t7d'),
    departure: read.value(element, '.dPzsIb [jsname="bN97Pc"]'), arrival: read.value(element, '.SWFQlc [jsname="bN97Pc"]'),
    cabin: read.value(element, '[jsname="Pvlywd"]'), flight: read.value(element, '.Xsgmwe.sI2Nye'), duration: read.value(element, '.P102Lb'), layover: read.value(element, '.tvtJdb') }));
}
export function readFareCards(elements: Element[]): FareCard[] {
  return elements.slice(0, 30).map(button => {
    let parent = button.parentElement;
    const label = button.getAttribute('aria-label') ?? '';
    const compact = /^Continue to book with .+ airline for [\d,.]+ /.test(label);
    while (parent && !(compact ? /Book with .+Airline/.test(parent.textContent ?? '') : parent.querySelector('h3'))) parent = parent.parentElement;
    const scoped = parent && (compact ? parent.querySelectorAll('[aria-label^="Continue to book with "]').length === 1 : parent.querySelectorAll('h3').length === 1);
    return { label, text: scoped ? ((parent as HTMLElement).innerText ?? parent!.textContent ?? '') : '' };
  });
}
function localDate(text: string, reference: string): { date: string; time: string } | null {
  const match = text.match(/^(\d{1,2}:\d{2} [AP]M)\s+on\s+\w{3},\s+(\w{3}) (\d{1,2})$/);
  if (!match) return null;
  const month = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].indexOf(match[2]!);
  const day = Number(match[3]);
  if (month < 0) return null;
  for (const year of [Number(reference.slice(0, 4)), Number(reference.slice(0, 4)) + 1]) {
    const date = new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
    const delta = (Date.parse(date) - Date.parse(reference)) / 86400000;
    if (Number(date.slice(8)) === day && delta >= 0 && delta <= 3) return { date, time: match[1]! };
  }
  return null;
}
const cabins = { economy: 'Economy', premium_economy: 'Premium Economy', business: 'Business Class', first: 'First Class' };

export type ExactFlightRequest = Pick<FlightCandidate, 'origin' | 'destination' | 'destinationName' | 'departure' | 'returnDate'>;
export function exactFlight(candidate: ExactFlightRequest, profile: WatchConstraints, bookingUrl: string, cards: SegmentCard[][], fares: FareCard[], observedAt = new Date()): FlightCandidate | null {
  const selected = readFlightLink(bookingUrl, googlePassengerCategories(profile));
  if (selected.legs.length !== 2 || selected.cabinClass !== profile.cabin || cards.length !== 2
    || selected.legs[0]![0]!.origin !== candidate.origin || selected.legs[0]![0]!.date !== candidate.departure || selected.legs[1]![0]!.date !== candidate.returnDate) return null;
  const legs: FlightSegment[][] = [];
  const layovers: number[] = [];
  let overnight = false;
  for (let legIndex = 0; legIndex < 2; legIndex++) {
    const segments = selected.legs[legIndex]!, details = cards[legIndex]!;
    if (segments.length !== details.length) return null;
    const leg: FlightSegment[] = [];
    for (let index = 0; index < segments.length; index++) {
      const segment = segments[index]!, card = details[index]!;
      const departure = localDate(card.departure, segment.date), arrival = localDate(card.arrival, segment.date), duration = minutes(card.duration);
      if (!departure || departure.date !== segment.date || !arrival || !duration || card.cabin !== cabins[profile.cabin]
        || !card.origin.endsWith('(' + segment.origin + ')') || !card.destination.endsWith('(' + segment.destination + ')')
        || card.flight.replace(/\s/g, '') !== segment.airline + segment.number) return null;
      if (index > 0 && leg.at(-1)!.arrivalDate !== departure.date) overnight = true;
      if (index < segments.length - 1) {
        const layover = minutes(card.layover.split(' layover')[0]!);
        if (layover === null) return null;
        layovers.push(layover);
      }
      leg.push({ ...segment, arrivalDate: arrival.date, cabin: profile.cabin, departureTime: departure.time, arrivalTime: arrival.time, durationMinutes: duration });
    }
    legs.push(leg);
  }
  if (!matchesFlightRoute(profile, { ...candidate, legs })
    || /^[A-Z]{3}$/.test(candidate.destination) && legs[0]!.at(-1)!.destination !== candidate.destination) return null;
  const all = legs.flat(), airlines = [...new Set(all.map(segment => segment.airline))];
  const maxStops = profile.flight.maxStops, maxDuration = profile.flight.maxDurationMinutes;
  const excluded = profile.flight.excludedAirlines.map(value => value.toUpperCase());
  if (all.some(segment => excluded.includes(segment.airline) || profile.flight.excludedAirports.includes(segment.origin) || profile.flight.excludedAirports.includes(segment.destination))
    || profile.flight.preferredAirlines.length && !airlines.some(code => profile.flight.preferredAirlines.map(value => value.toUpperCase()).includes(code))
    || layovers.some(value => value < profile.flight.minLayoverMinutes || value > profile.flight.maxLayoverMinutes)
    || overnight && !profile.flight.allowOvernight
    || maxStops !== null && legs.some(leg => leg.length - 1 > maxStops)
    || maxDuration !== null && legs.some(leg => leg.reduce((sum, segment) => sum + segment.durationMinutes, 0) + layoversFor(leg, legs, layovers) > maxDuration)) return null;
  const choices = fares.map(fare => {
    const named = fare.label.match(/^Continue to book with (.+), (.+) for ([\d,.]+) /);
    const compact = fare.label.match(/^Continue to book with (.+) airline for ([\d,.]+) /);
    const match = named ?? (compact ? [compact[0], compact[1], null, compact[2]] : null);
    if (!match || !fare.text || /separate tickets|self.transfer/i.test(fare.text)) return null;
    const amount = Number(match[3]!.replaceAll(',', ''));
    const checked = fare.text.match(/(\d+) free checked bags per passenger/);
    const checkedBags = checked ? Number(checked[1]) : /First checked bag per passenger is free|1st checked bag per passenger free/.test(fare.text) ? 1 : null;
    const symbol = new Intl.NumberFormat('en-US', { style: 'currency', currency: profile.currency }).formatToParts(1).find(part => part.type === 'currency')?.value;
    if (!symbol || !fare.text.includes(symbol) || !Number.isFinite(amount) || amount <= 0 || amount > 1_000_000 || profile.flight.maxPrice !== null && amount > profile.flight.maxPrice
      // An omitted condition remains a blocked candidate so the airline can
      // resolve it; a visibly insufficient baggage allowance is rejected.
      || checkedBags !== null && checkedBags < profile.flight.checkedBags) return null;
    return { amount, checkedBags, provider: match[1]!, name: match[2] ?? null, refundable: /Full refunds/.test(fare.text) ? true : /No refunds/.test(fare.text) ? false : null,
      changesAllowed: /Free change/.test(fare.text) ? true : /No ticket changes/.test(fare.text) ? false : null };
  }).filter(value => value !== null).sort((a, b) => a.amount - b.amount);
  const fare = choices[0];
  if (!fare) return null;
  return { kind: 'flight', origin: candidate.origin, destination: candidate.destination, destinationName: candidate.destinationName,
    departure: candidate.departure, returnDate: candidate.returnDate, cabin: profile.cabin, passengers: profile.passengers, currency: profile.currency,
    amount: fare.amount, bookingUrl, source: 'google_flights', provenance: 'cached', observedAt: observedAt.toISOString(), contextConfirmed: true,
    legs, fare: { provider: fare.provider, name: fare.name, refundable: fare.refundable, changesAllowed: fare.changesAllowed }, airlineCodes: airlines,
    connectionAirports: [...new Set(legs.flatMap(leg => leg.slice(0, -1).map(segment => segment.destination)))], layoverMinutes: layovers,
    stops: Math.max(...legs.map(leg => leg.length - 1)), durationMinutes: Math.max(...legs.map(leg => leg.reduce((sum, segment) => sum + segment.durationMinutes, 0) + layoversFor(leg, legs, layovers))),
    checkedBags: fare.checkedBags, selfTransfer: null, overnight, arrivalLocal: legs[0]!.at(-1)!.arrivalDate, returnDepartureLocal: legs[1]![0]!.date };
}
function layoversFor(leg: FlightSegment[], legs: FlightSegment[][], layovers: number[]): number {
  const start = leg === legs[0] ? 0 : legs[0]!.length - 1;
  return layovers.slice(start, start + leg.length - 1).reduce((sum, value) => sum + value, 0);
}
