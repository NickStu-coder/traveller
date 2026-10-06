import type { Page } from 'playwright';
import { closeTravelBrowser, currentTravelExecution } from '../../travel/execution';
import { guardTravelContext } from '../../travel/navigation';
import type { TravelNavigationGuard } from '../../travel/navigation';
import { SourceError } from './types';

/** Provider navigation paths observed in public, ordinary booking flows. */
export function travellerNavigationAllowed(url: URL, provider: 'google' | 'lufthansa' | 'booking' = 'google'): boolean {
  return url.protocol === 'https:' && !url.port && !url.username && !url.password
    && ((url.hostname === 'www.google.com' && /^\/(?:travel|sorry)(?:\/|$)/.test(url.pathname)) || url.hostname === 'consent.google.com'
      || provider === 'lufthansa' && (url.hostname === 'shop.lufthansa.com' && url.pathname.startsWith('/booking/')
        || url.hostname === 'www.lufthansa.com' && url.pathname === '/deeplink/partner')
      || provider === 'booking' && url.hostname === 'www.booking.com' && (/^\/searchresults(?:\.[a-z]{2}(?:-[a-z]{2})?)?\.html$/.test(url.pathname) || /^\/hotel\/[a-z]{2}\/[\w.-]+\.html$/.test(url.pathname)));
}

/** Use an ordinary isolated browser: no navigator spoofing or challenge bypass. */
export async function withGooglePage<T>(signal: AbortSignal, work: (page: Page, navigation: TravelNavigationGuard, navigationFor: (page: Page) => TravelNavigationGuard) => Promise<T>, provider: 'google' | 'lufthansa' | 'booking' = 'google'): Promise<T> {
  const execution = currentTravelExecution();
  if (!execution) throw new Error('Traveller sources require the shared travel worker lease');
  signal.throwIfAborted(); execution.check();
  const { chromium } = await import('playwright');
  const browser = await execution.launch(() => chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] }));
  const abort = () => execution.abort(signal.reason);
  signal.addEventListener('abort', abort, { once: true });
  let failure: unknown;
  try {
    signal.throwIfAborted();
    const context = await browser.newContext({ locale: 'en-US', timezoneId: 'UTC', serviceWorkers: 'block' });
    // Provider pages may load static assets, never arbitrary destinations/private services.
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      return url.protocol === 'https:' && !url.username && !url.password && !url.port
        && (/^(?:(?:www|consent)\.google\.com|(?:[a-z0-9-]+\.)*(?:gstatic\.com|googleusercontent\.com|googleapis\.com))$/.test(url.hostname)
          || provider === 'lufthansa' && ['shop.lufthansa.com', 'www.lufthansa.com', 'cdn.cookielaw.org'].includes(url.hostname)
          || provider === 'booking' && /^(?:www\.booking\.com|(?:[a-z0-9-]+\.)*bstatic\.com)$/.test(url.hostname))
        ? route.continue() : route.abort('blockedbyclient');
    });
    const navigationFor = await guardTravelContext(context, 'traveller-' + provider, url => travellerNavigationAllowed(url, provider));
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    return await work(page, navigationFor(page), navigationFor);
  } catch (error) { failure = error; throw error; }
  finally { signal.removeEventListener('abort', abort); await closeTravelBrowser(browser, failure); }
}

export async function googlePageState(page: Page): Promise<void> {
  const text = (await page.locator('body').innerText()).slice(0, 10000);
  if (/captcha|unusual traffic|verify (?:that )?you(?:'re| are) human|access denied/i.test(text) || new URL(page.url()).pathname.startsWith('/sorry'))
    throw new SourceError('blocked', 'Google access challenge; unattended requests paused');
  if (/too many requests|rate limit/i.test(text)) throw new SourceError('rate_limited', 'Google request limit; unattended requests paused');
}
