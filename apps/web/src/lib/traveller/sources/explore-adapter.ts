import type { Page } from 'playwright';
import { SOURCE_CATALOG } from './catalog';
import { withGooglePage, googlePageState } from './browser';
import { confirmExploreContext, parseExploreCards, readExploreCardElements, type ExploreControls } from './google-explore';
import { googleDiscoveryUrl } from './google-url';
import { SourceError, type FlightSourceAdapter } from './types';

async function settle(page: Page): Promise<void> {
  await googlePageState(page);
  for (const loading of await page.getByText('Loading results', { exact: true }).all()) await loading.waitFor({ state: 'hidden', timeout: 45_000 });
  await googlePageState(page);
}

export const googleExploreAdapter: FlightSourceAdapter = {
  metadata: SOURCE_CATALOG.find(source => source.id === 'google_explore')!,
  async discover(request, context) {
    await context.reserveRequest();
    return withGooglePage(context.signal, async page => {
      const response = await page.goto(googleDiscoveryUrl(request, context.profile), { waitUntil: 'domcontentloaded', timeout: 45_000 });
      if (response?.status() === 429) throw new SourceError('rate_limited', 'Google request budget exhausted');
      if ((response?.status() ?? 200) >= 400) throw new SourceError('degraded', 'Google Explore is unavailable');
      if (new URL(page.url()).hostname === 'consent.google.com') {
        const reject = page.getByRole('button', { name: 'Reject all', exact: true });
        if (!await reject.count()) throw new SourceError('degraded', 'Google consent requires operator review');
        await reject.click();
      }
      await settle(page);
      await page.getByRole('button', { name: /^\d+ passengers?$/ }).click();
      const counts = await page.locator('[aria-valuenow][aria-label]').evaluateAll(elements => Object.fromEntries(elements.map(element => [element.getAttribute('aria-label'), Number(element.getAttribute('aria-valuenow'))])));
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      const controls: ExploreControls = {
        url: page.url(), loading: false,
        origin: (await page.getByRole('combobox', { name: /^Where from\?/ }).getAttribute('aria-label')) ?? '',
        cabin: (await page.getByRole('combobox', { name: /^Change seating class/ }).innerText()).trim(),
        departure: await page.getByRole('textbox', { name: 'Departure', exact: true }).inputValue(),
        returnDate: await page.getByRole('textbox', { name: 'Return', exact: true }).inputValue(),
        adultCount: counts['Number of adult passengers'] ?? -1, childCount: counts['Number of children aged 2 to 11'] ?? -1,
        infantSeatCount: counts['Number of infants in their own seat'] ?? -1, infantLapCount: counts['Number of infants on lap'] ?? -1,
      };
      confirmExploreContext(controls, request, context.profile);
      const cards = await page.locator('li[role="button"][data-code]').evaluateAll(readExploreCardElements, context.profile.currency);
      if (!cards.length && !await page.getByText(/No results|No flights/).count()) throw new SourceError('degraded', 'Google Explore did not render destination cards');
      return parseExploreCards(cards, request, context.profile);
    });
  },
};
