import { withGooglePage } from '../browser';
import { ProfileSearchError, SourceError, type FlightSourceAdapter } from '../types';
import { SOURCE_CATALOG } from '../catalog';
import { rejectGoogleConsent, settleGoogle } from '../shared/context';
import { captureLufthansa, verifyLufthansa } from './lufthansa';

export const lufthansaAdapter: FlightSourceAdapter = {
  metadata: SOURCE_CATALOG.find(source => source.id === 'airline_direct')!,
  async discover() { throw new ProfileSearchError('Airline confirmation requires a selected Google itinerary'); },
  async verify(candidate, context) {
    if (!candidate.legs || candidate.fare?.provider !== 'Lufthansa' || context.profile.passengers.children.length || context.profile.passengers.infants
      || candidate.legs.flat().some(segment => !['LH', 'VL'].includes(segment.airline) || segment.arrivalDate !== segment.date))
      throw new ProfileSearchError('Direct confirmation currently supports adult-only Lufthansa/Lufthansa City single-day itineraries');
    const url = new URL(candidate.bookingUrl);
    if (url.origin !== 'https://www.google.com' || url.pathname !== '/travel/flights/booking') throw new ProfileSearchError('Selected Google booking context is unavailable');
    // Worker reserves this together with one Google refresh, before either provider opens.
    await context.reserveRequest(2);
    return withGooglePage(context.signal, async (page, navigation, navigationFor) => {
      await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await navigation.settle(); await rejectGoogleConsent(page, navigation); await settleGoogle(page);
      await page.getByRole('heading', { name: 'Booking options', exact: true }).waitFor({ state: 'visible', timeout: 45_000 });
      const name = candidate.fare!.name;
      const buttons = await page.getByRole('button', { name: /^Continue to book with Lufthansa(?: airline|, )/ }).all();
      let label: string | null = null;
      for (const button of buttons) {
        const value = await button.getAttribute('aria-label') ?? '';
        if (name ? value.startsWith(`Continue to book with Lufthansa, ${name} for `) : /^Continue to book with Lufthansa airline for /.test(value)) { label = value; break; }
      }
      if (!label) throw new ProfileSearchError('The selected Lufthansa fare is no longer available');
      const popupPromise = page.context().waitForEvent('page', { timeout: 45_000 });
      await page.getByRole('button', { name: label, exact: true }).click();
      const provider = await popupPromise;
      provider.setDefaultTimeout(15_000);
      try {
        await provider.waitForURL('https://shop.lufthansa.com/booking/cart', { timeout: 45_000 });
        await navigationFor(provider).settle();
      } catch {
        const text = (await provider.locator('body').innerText().catch(() => '')).slice(0, 10000);
        if (/security check|captcha|verify.*human|access denied|just a moment/i.test(text)) throw new SourceError('blocked', 'Lufthansa access challenge; unattended requests paused');
        throw new SourceError('degraded', 'Lufthansa did not confirm the public itinerary');
      }
      const consent = provider.getByRole('button', { name: 'Only necessary', exact: true });
      if (await consent.isVisible()) await consent.click();
      const details = await provider.getByRole('button', { name: /Show flight details from / }).all();
      if (details.length !== 2) throw new SourceError('degraded', 'Lufthansa did not provide both itinerary bounds');
      for (const detail of details) {
        if (await detail.getAttribute('aria-expanded') !== 'true') await detail.click();
        await provider.locator('refx-flight-breakdown').filter({ visible: true }).first().waitFor({ state: 'visible' });
      }
      await provider.locator('refx-flight-breakdown').filter({ visible: true }).nth(1).waitFor({ state: 'visible' });
      const capture = await provider.evaluate(captureLufthansa);
      await provider.getByRole('button', { name: /Show price details/ }).click();
      const dialog = provider.getByRole('dialog', { name: 'Price details', exact: true });
      await dialog.waitFor({ state: 'visible' });
      const party = await dialog.getByRole('button', { name: /^\d+ (?:Adults?|Children|Infants?)/ }).evaluateAll(elements => elements.map(element => (element as HTMLElement).innerText.replace(/\s+/g, ' ').trim()));
      return verifyLufthansa(candidate, context.profile, { ...capture, party });
    }, 'lufthansa');
  },
};
