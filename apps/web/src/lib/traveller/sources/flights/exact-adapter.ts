import type { Page } from 'playwright';
import { SOURCE_CATALOG } from '../catalog';
import { withGooglePage } from '../browser';
import { confirmExploreContext } from '../google-explore';
import { googleFlightSearchUrl } from '../google-url';
import { ProfileSearchError, SourceError, type SourceContext, type FlightSourceAdapter } from '../types';
import { readGoogleControls, rejectGoogleConsent, settleGoogle } from '../shared/context';
import { exactFlight, minutes, readFareCards, readSegmentCards, type ExactFlightRequest, type SegmentCard } from './google-exact';
import type { WatchConstraints } from '../../profiles';

async function chooseFlight(page: Page, profile: WatchConstraints): Promise<boolean> {
  const empty = page.getByRole('heading', { name: 'No options matching your search', exact: true });
  await page.getByRole('link', { name: /^From [\d,.]+ .+ round trip total\./ }).first().or(empty).first().waitFor({ state: 'visible', timeout: 45_000 });
  if (await empty.isVisible()) return false;
  const choices = await page.getByRole('link', { name: /^From [\d,.]+ .+ round trip total\./ }).all();
  const eligible: { label: string; amount: number }[] = [];
  for (const choice of choices.slice(0, 30)) {
    const label = await choice.getAttribute('aria-label') ?? '';
    const price = label.match(/^From ([\d,.]+) /), stops = /Nonstop flight/.test(label) ? 0 : Number(label.match(/(\d+) stops? flight/)?.[1] ?? NaN);
    const duration = minutes(label.match(/Total duration ([^.]+)\./)?.[1] ?? '');
    if (!price || !Number.isFinite(stops) || duration === null || /Class \+|separate tickets|self.transfer/i.test(label)
      || profile.flight.maxStops !== null && stops > profile.flight.maxStops || profile.flight.maxDurationMinutes !== null && duration > profile.flight.maxDurationMinutes) continue;
    eligible.push({ label, amount: Number(price[1]!.replaceAll(',', '')) });
  }
  const best = eligible.sort((a, b) => a.amount - b.amount)[0];
  if (!best) return false;
  // Google overlays the accessible link with the visual flight card. Its native
  // keyboard action selects the same itinerary without bypassing an overlay.
  await page.getByRole('link', { name: best.label, exact: true }).press('Enter');
  await settleGoogle(page);
  return true;
}
async function search(candidate: ExactFlightRequest, context: SourceContext) {
  await context.reserveRequest(3);
  return withGooglePage(context.signal, async (page, navigation) => {
    const request = { origin: candidate.origin, destination: candidate.destination, departure: candidate.departure, returnDate: candidate.returnDate };
    const response = await page.goto(googleFlightSearchUrl(request, context.profile), { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await navigation.settle();
    if (response?.status() === 429) throw new SourceError('rate_limited', 'Google Flights request limit');
    if ((response?.status() ?? 200) >= 400) throw new SourceError('degraded', 'Google Flights is unavailable');
    await rejectGoogleConsent(page, navigation); await settleGoogle(page);
    confirmExploreContext(await readGoogleControls(page), request, context.profile, ['/travel/flights', '/travel/flights/search']);
    if (!await chooseFlight(page, context.profile) || !await chooseFlight(page, context.profile)) return null;
    if (new URL(page.url()).pathname !== '/travel/flights/booking') throw new SourceError('degraded', 'Google Flights did not select a complete round trip');
    await page.getByRole('heading', { name: 'Booking options', exact: true }).waitFor({ state: 'visible', timeout: 45_000 });
    if (!await page.getByRole('button', { name: 'Currency ' + context.profile.currency, exact: true }).count()) throw new SourceError('degraded', 'Google Flights changed the fare currency');
    const details = await page.getByRole('button', { name: /^Flight details\./ }).all();
    if (details.length !== 2) throw new SourceError('degraded', 'Google Flights did not provide both itinerary legs');
    const cards: SegmentCard[][] = [];
    for (const detail of details) {
      await detail.click();
      const id = await detail.getAttribute('aria-controls');
      if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) throw new SourceError('degraded', 'Google Flights segment details are unavailable');
      cards.push(await page.locator('#' + id + ' .c257Jb').evaluateAll(readSegmentCards));
    }
    const fares = await page.getByRole('button', { name: /^Continue to book with / }).evaluateAll(readFareCards);
    return exactFlight(candidate, context.profile, page.url(), cards, fares);
  });
}

export const googleExactAdapter: FlightSourceAdapter = {
  metadata: SOURCE_CATALOG.find(source => source.id === 'google_flights')!,
  async discover(request, context) {
    if (context.profile.destination.kind !== 'airport' || !request.destination || !context.profile.destination.values.includes(request.destination)
      || !context.profile.origins.includes(request.origin)) throw new ProfileSearchError('Exact discovery requires selected profile airports');
    const candidate = await search({ ...request, destination: request.destination, destinationName: request.destination }, context);
    return candidate ? [candidate] : [];
  },
  verify: search,
};
