import type { Page } from 'playwright';
import { SOURCE_CATALOG } from './catalog';
import { withGooglePage } from './browser';
import { confirmExploreContext, parseExploreCards, readExploreCardElements } from './google-explore';
import { readGoogleControls, rejectGoogleConsent, settleGoogle } from './shared/context';
import { googleDiscoveryUrl } from './google-url';
import { ProfileSearchError, SourceError, type FlightSourceAdapter } from './types';

/** Resolve names through the provider's own visible autocomplete, never guessed IDs. */
async function selectDestination(page: Page, destination: string): Promise<string> {
  await page.getByRole('combobox', { name: 'Where to?', exact: true }).fill(destination);
  const options = page.getByRole('option');
  await options.first().waitFor({ state: 'visible' });
  const exact = options.filter({ has: page.locator('[jsname="V1ur5d"]').filter({ hasText: new RegExp('^' + destination.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') }) });
  const selected = await exact.count() === 1 ? exact : await options.count() === 1 ? options : null;
  if (!selected) throw new ProfileSearchError('Destination is ambiguous; use the provider city, country or region name');
  const entity = await selected.getAttribute('data-code');
  if (!entity || !/^\/m\/[a-zA-Z0-9_]+$/.test(entity)) throw new ProfileSearchError('Destination could not be resolved to a supported geographic entity');
  await selected.click();
  await settleGoogle(page);
  return entity;
}

export const googleExploreAdapter: FlightSourceAdapter = {
  metadata: SOURCE_CATALOG.find(source => source.id === 'google_explore')!,
  async discover(request, context) {
    const namedDestination = request.destination && !/^[A-Z]{3}$/.test(request.destination) ? request.destination : null;
    // Reserve the complete bounded search before opening the provider, including region submission.
    await context.reserveRequest(namedDestination ? 2 : 1);
    return withGooglePage(context.signal, async (page, navigation) => {
      const response = await page.goto(googleDiscoveryUrl(namedDestination ? { ...request, destination: null } : request, context.profile), { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await navigation.settle();
      if (response?.status() === 429) throw new SourceError('rate_limited', 'Google request budget exhausted');
      if ((response?.status() ?? 200) >= 400) throw new SourceError('degraded', 'Google Explore is unavailable');
      await rejectGoogleConsent(page, navigation);
      await settleGoogle(page);
      const destinationEntity = namedDestination ? await selectDestination(page, namedDestination) : undefined;
      const controls = await readGoogleControls(page, destinationEntity);
      confirmExploreContext(controls, request, context.profile);
      await page.waitForFunction(() => document.querySelector('li[role="button"][data-code]') !== null
        || /No results|No flights/.test(document.body.innerText), undefined, { timeout: 45_000 });
      const cards = await page.locator('li[role="button"][data-code]').evaluateAll(readExploreCardElements, context.profile.currency);
      if (!cards.length && !await page.getByText(/No results|No flights/).count()) throw new SourceError('degraded', 'Google Explore did not render destination cards');
      return parseExploreCards(cards, request, context.profile);
    });
  },
};
