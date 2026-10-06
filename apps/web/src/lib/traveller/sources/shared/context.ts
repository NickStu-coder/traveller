import type { Page } from 'playwright';
import type { ExploreControls } from '../google-explore';
import { googlePageState } from '../browser';
import { SourceError } from '../types';
import type { TravelNavigationGuard } from '../../../travel/navigation';

export async function settleGoogle(page: Page): Promise<void> {
  await googlePageState(page);
  // Google retains screen-reader text inside aria-hidden progress components after completion.
  await page.getByRole('progressbar', { name: 'Loading results', exact: true }).first().waitFor({ state: 'hidden', timeout: 45_000 });
  await googlePageState(page);
}
export async function readGoogleControls(page: Page, destinationEntity?: string): Promise<ExploreControls> {
  await page.getByRole('button', { name: /^\d+ passengers?(?:, change number of passengers\.)?$/ }).click();
  const counts = await page.locator('[aria-valuenow][aria-label]').evaluateAll(elements => Object.fromEntries(elements.map(element => [element.getAttribute('aria-label'), Number(element.getAttribute('aria-valuenow'))])));
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  return { url: page.url(), loading: false, destinationEntity,
    origin: (await page.getByRole('combobox', { name: /^Where from\?/ }).getAttribute('aria-label')) ?? '',
    cabin: (await page.getByRole('combobox', { name: /^Change seating class/ }).innerText()).trim(),
    departure: await page.getByRole('textbox', { name: 'Departure', exact: true }).inputValue(), returnDate: await page.getByRole('textbox', { name: 'Return', exact: true }).inputValue(),
    adultCount: counts['Number of adult passengers'] ?? -1, childCount: counts['Number of children aged 2 to 11'] ?? -1,
    infantSeatCount: counts['Number of infants in their own seat'] ?? -1, infantLapCount: counts['Number of infants on lap'] ?? -1 };
}
export async function rejectGoogleConsent(page: Page, navigation: TravelNavigationGuard): Promise<void> {
  if (new URL(page.url()).hostname !== 'consent.google.com') return;
  const reject = page.getByRole('button', { name: 'Reject all', exact: true });
  if (!await reject.count()) throw new SourceError('degraded', 'Google consent requires operator review');
  navigation.reset();
  // The guarded POST may commit an intermediate document that immediately redirects.
  // Wait for the final document, rather than a load event aborted by that redirect.
  await reject.click({ noWaitAfter: true });
  await page.waitForFunction(() => location.hostname === 'www.google.com' && /^\/travel(?:\/|$)/.test(location.pathname)
    && !document.documentElement.hasAttribute('data-travel-redirect'), undefined, { timeout: 45_000 });
  await navigation.settle();
}
