import type { FlightCandidate } from '../types';
import type { WatchConstraints } from '../../profiles';

export interface LufthansaCapture {
  url: string; total: string; party: string[]; wholeParty: boolean; allFlights: boolean;
  bounds: { heading: string; summary: string; fare: string; segments: { airports: string[]; departure: string; arrival: string; flight: string; operator: string; cabin: string; duration: string }[] }[];
}

/** Reads only the visible cart itinerary, never passenger or payment forms. */
export function captureLufthansa(): Omit<LufthansaCapture, 'party'> {
  const read = {
    visible(element: Element) { return (element as HTMLElement).checkVisibility(); },
    text(element: Element | null) { return element?.textContent?.replace(/\u00a0/g, ' ').trim() ?? ''; },
  };
  const { visible, text } = read;
  const main = document.querySelector('main');
  const headings = [...(main?.querySelectorAll('h3') ?? [])].filter(element => visible(element) && /^(Departure|Return) flight/.test(text(element)));
  const bounds = headings.map(heading => {
    let scope: Element | null = heading;
    for (let depth = 0; scope && depth < 10; depth++, scope = scope.parentElement) {
      if (scope.querySelectorAll('refx-flight-breakdown').length === 1 && scope.querySelectorAll('h3').length === 1) break;
    }
    const segments = [...(scope?.querySelectorAll('refx-segment-details-pres') ?? [])].filter(visible).map(element => ({
      airports: [...element.querySelectorAll('bdo')].map(text), departure: text(element.querySelector('.seg-details-dep-time')),
      arrival: text(element.querySelector('.seg-details-arv-time')), flight: text(element.querySelector('b')), operator: text(element.querySelector('.operated-by-airline-name')),
      cabin: text(element.querySelector('.seg-cabin')), duration: text(element.querySelector('.cdk-visually-hidden')),
    }));
    return { heading: text(heading), summary: text(scope?.querySelector('.bound-details-container') ?? null), fare: text(scope?.querySelector('refx-fare-details-pres') ?? null), segments };
  });
  const content = (main as HTMLElement | null)?.innerText ?? '';
  return { url: location.href, total: text(main?.querySelector('.price-information-card-price-wrapper.total-price') ?? null), bounds,
    wholeParty: content.includes('Round trip price for all passengers (incl. taxes, fees and surcharges)'), allFlights: content.includes('Selected fare applies on all flights for all passengers') };
}

function boundDate(heading: string): string | null {
  const match = heading.match(/\b(\d{1,2}) ([A-Za-z]+) (20\d{2})$/);
  if (!match) return null;
  const month = ['January','February','March','April','May','June','July','August','September','October','November','December'].indexOf(match[2]!);
  if (month < 0) return null;
  const date = new Date(Date.UTC(Number(match[3]), month, Number(match[1])));
  return date.getUTCDate() === Number(match[1]) ? date.toISOString().slice(0, 10) : null;
}
const time = (value: string) => {
  const match = value.match(/^(\d{1,2}):(\d{2}) ([AP]M)$/);
  return match ? String(Number(match[1]) % 12 + (match[3] === 'PM' ? 12 : 0)).padStart(2, '0') + ':' + match[2] : value;
};

/** Supported scope: adult-only LH/VL single-day bounds, with every segment and fare visibly matched.
 * A LH marketing number may differ from Google's VL operating number only when
 * operator, airports, exact times, duration and cabin all match; both numbers survive in the evidence.
 */
export function verifyLufthansa(candidate: FlightCandidate, profile: WatchConstraints, capture: LufthansaCapture, now = new Date()): FlightCandidate | null {
  const url = new URL(capture.url);
  if (url.origin !== 'https://shop.lufthansa.com' || url.pathname !== '/booking/cart' || !candidate.legs || capture.bounds.length !== 2
    || profile.passengers.children.length || profile.passengers.infants || !capture.wholeParty || !capture.allFlights
    || capture.party.length !== 1 || !new RegExp(`^${profile.passengers.adults} Adults? `).test(capture.party[0]!)) return null;
  const price = capture.total.match(/^Total price:([A-Z]{3})([\d,.]+)$/);
  if (!price || price[1] !== profile.currency) return null;
  const amount = Number(price[2]!.replaceAll(',', ''));
  if (!Number.isFinite(amount) || amount <= 0 || Math.abs(amount / candidate.amount - 1) > 0.05 || profile.flight.maxPrice !== null && amount > profile.flight.maxPrice) return null;
  const operator: Record<string, string> = { LH: 'Lufthansa', VL: 'Lufthansa City Airlines' };
  const cabins = { economy: 'Economy', premium_economy: 'Premium Economy', business: 'Business', first: 'First' };
  const aliases: { google: string; direct: string; operator: string }[] = [];
  const legs = structuredClone(candidate.legs);
  const fares: { name: string; bags: number; refundable: boolean | null; changesAllowed: boolean | null }[] = [];
  for (let index = 0; index < 2; index++) {
    const bound = capture.bounds[index]!, segments = candidate.legs[index]!;
    const date = boundDate(bound.heading);
    if (date !== segments[0]!.date || bound.segments.length !== segments.length || !new RegExp(`^${index ? 'Return' : 'Departure'} flight`).test(bound.heading)) return null;
    const day = bound.heading.match(/\b\d{1,2} [A-Za-z]+ 20\d{2}$/)?.[0];
    if (!day || !bound.summary.includes('Departure date:') || !bound.summary.includes('Arrival date:') || bound.summary.split(day).length !== 3) return null;
    for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex++) {
      const expected = segments[segmentIndex]!, actual = bound.segments[segmentIndex]!;
      const number = actual.flight.match(/^LH (\d{1,4}[A-Z]?)$/);
      const duration = actual.duration.match(/^Flight duration (\d+) hours? and (\d+) minutes?$/);
      if (!number || !duration || expected.date !== date || expected.arrivalDate !== date || actual.airports.join('|') !== `(${expected.origin})|(${expected.destination})`
        || actual.departure !== time(expected.departureTime) || actual.arrival !== time(expected.arrivalTime) || actual.cabin !== cabins[profile.cabin]
        || Number(duration[1]) * 60 + Number(duration[2]) !== expected.durationMinutes || operator[expected.airline] !== actual.operator
        || expected.airline === 'LH' && number[1] !== expected.number) return null;
      if (expected.airline !== 'LH') aliases.push({ google: expected.airline + expected.number, direct: 'LH' + number[1], operator: actual.operator });
      Object.assign(legs[index]![segmentIndex]!, { airline: 'LH', number: number[1] });
    }
    const name = bound.fare.match(/^(.+?)Rebooking\s*/)?.[1]?.trim();
    const bags = bound.fare.match(/Checked baggage\s*(\d+)×\s*\d+kg/);
    if (!name || !bags || candidate.fare?.name && candidate.fare.name !== name || Number(bags[1]) < profile.flight.checkedBags) return null;
    const excluded = profile.flight.excludedAirlines.map(code => code.toUpperCase());
    if (excluded.includes('LH')) return null;
    fares.push({ name, bags: Number(bags[1]), refundable: /Refundability\s*Not allowed/.test(bound.fare) ? false : /Refundability\s*Allowed/.test(bound.fare) ? true : null,
      changesAllowed: /Rebooking\s*Not allowed/.test(bound.fare) ? false : /Rebooking\s*Allowed/.test(bound.fare) ? true : null });
  }
  if (fares[0]!.name !== fares[1]!.name) return null;
  return { ...candidate, source: 'airline_direct', provenance: 'live', amount, observedAt: now.toISOString(), legs, airlineCodes: [...new Set([...candidate.airlineCodes, 'LH'])],
    checkedBags: Math.min(...fares.map(fare => fare.bags)), selfTransfer: false,
    fare: { provider: 'Lufthansa', name: fares[0]!.name, refundable: fares.every(fare => fare.refundable === false) ? false : fares.every(fare => fare.refundable === true) ? true : null,
      changesAllowed: fares.every(fare => fare.changesAllowed === false) ? false : fares.every(fare => fare.changesAllowed === true) ? true : null },
    directConfirmation: { provider: 'Lufthansa', url: capture.url, googleAmount: candidate.amount, verifiedAt: now.toISOString(), marketingAliases: aliases } };
}
