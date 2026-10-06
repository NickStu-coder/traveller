import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchBrowser } from '../scraper/browser';
import { guardTravelContext, guardTravelNavigation } from './navigation';
import { settleGoogle } from '../traveller/sources/shared/context';

describe.skipIf(process.env.TRAVEL_BROWSER_TESTS !== '1')('guarded browser redirects', () => {
  let server: Server;
  let browser: Browser;
  let origin: string;
  let forbiddenRequests = 0;
  beforeAll(async () => {
    server = createServer((request, response) => {
      if (request.url === '/forbidden') forbiddenRequests++;
      if (request.url === '/consent') {
        response.writeHead(200, { 'content-type': 'text/html' });
        response.end('<form method="post" action="/save"><button>Reject all</button></form>'); return;
      }
      if (request.url === '/popup') {
        response.writeHead(200, { 'content-type': 'text/html' });
        response.end('<form target="_blank" method="post" action="/save"><button>Open provider</button></form>'); return;
      }
      if (request.url === '/save') {
        response.writeHead(303, { location: '/cookie-result', 'set-cookie': ['consent=necessary; Path=/; HttpOnly', 'second=retained; Path=/'] }); response.end(); return;
      }
      if (request.url === '/cookie-result') {
        response.writeHead(200, { 'content-type': 'text/html' });
        response.end(`<h1>${request.headers.cookie ?? 'missing cookies'}</h1>`); return;
      }
      const paths: Record<string, string> = { '/redirect': '/success', '/error-redirect': '/unavailable', '/unsafe': '/forbidden', '/malformed': 'http://[' };
      if (request.url && paths[request.url]) {
        response.writeHead(302, { location: paths[request.url]! }); response.end(); return;
      }
      if (request.url === '/unavailable') {
        setTimeout(() => { response.writeHead(503); response.end('<h1>Rental results</h1><a href="/options?rate_reference=stale">Select car</a>'); }, 100); return;
      }
      response.writeHead(200, { 'content-type': 'text/html' }); response.end('<h1>Rental results</h1>');
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test server port');
    origin = `http://127.0.0.1:${address.port}`;
    browser = await launchBrowser();
  });
  afterAll(async () => {
    await browser?.close();
    if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });
  const allowed = (url: URL) => url.origin === origin && url.pathname !== '/forbidden';
  it('follows allowed redirects and supports repeated independent navigation', async () => {
    const page = await browser.newPage();
    try {
      const guard = await guardTravelNavigation(page, 'fixture', allowed);
      for (let run = 0; run < 2; run++) {
        guard.reset();
        await page.goto(`${origin}/redirect`);
        await guard.settle();
        expect(await page.locator('h1').textContent()).toBe('Rental results');
        expect(page.url()).toBe(`${origin}/success`);
      }
      await expect(guardTravelNavigation(page, 'different-provider', allowed)).rejects.toThrow(/policy/);
    } finally { await page.close(); }
  });
  it.each(['/unsafe', '/malformed'])('rejects an unsafe redirect without requesting its destination: %s', async path => {
    const page = await browser.newPage();
    try {
      await guardTravelNavigation(page, 'fixture', allowed);
      await expect(page.goto(`${origin}${path}`)).rejects.toThrow(/ERR_BLOCKED_BY_CLIENT/);
      expect(forbiddenRequests).toBe(0);
    } finally { await page.close(); }
  });
  it('retains response cookies across a guarded form POST and synthetic redirect', async () => {
    const page = await browser.newPage();
    try {
      const guard = await guardTravelNavigation(page, 'fixture', allowed);
      await page.goto(`${origin}/consent`);
      guard.reset();
      await page.getByRole('button', { name: 'Reject all', exact: true }).click({ noWaitAfter: true });
      await page.waitForFunction(() => location.pathname === '/cookie-result' && !document.documentElement.hasAttribute('data-travel-redirect'));
      await guard.settle();
      expect(await page.locator('h1').textContent()).toContain('consent=necessary');
      expect(await page.locator('h1').textContent()).toContain('second=retained');
    } finally { await page.close(); }
  });
  it('guards a popup initial POST and every redirect before a new tab can reach a forbidden destination', async () => {
    const context = await browser.newContext();
    try {
      const navigation = await guardTravelContext(context, 'popup-fixture', allowed);
      const page = await context.newPage();
      await page.goto(`${origin}/popup`);
      const popupPromise = context.waitForEvent('page');
      await page.getByRole('button', { name: 'Open provider', exact: true }).click();
      const popup = await popupPromise;
      await popup.waitForURL(`${origin}/cookie-result`, { timeout: 15_000 });
      await navigation(popup).settle();
      expect(await popup.locator('h1').textContent()).toContain('consent=necessary');
      navigation(popup).reset();
      await expect(popup.goto(`${origin}/unsafe`)).rejects.toThrow(/ERR_BLOCKED_BY_CLIENT/);
      expect(forbiddenRequests).toBe(0);
    } finally { await context.close(); }
  }, 30_000);
  it('recognizes completed results despite retained aria-hidden loading text', async () => {
    const page = await browser.newPage();
    try {
      await page.goto(`${origin}/success`);
      await page.setContent('<div aria-hidden="true"><div>Loading results</div><div role="progressbar" aria-label="Loading results"></div></div><h1>Paris · €961</h1>');
      await settleGoogle(page);
      expect(await page.locator('h1').textContent()).toBe('Paris · €961');
      await page.setContent('<div id="loading" role="progressbar" aria-label="Loading results">Loading results</div><script>setTimeout(() => document.getElementById("loading").setAttribute("aria-hidden", "true"), 100)</script>');
      await settleGoogle(page);
      expect(await page.locator('#loading').getAttribute('aria-hidden')).toBe('true');
    } finally { await page.close(); }
  });
  it('rejects a delayed terminal HTTP error even when it contains selectable offer markup', async () => {
    const page = await browser.newPage();
    try {
      const guard = await guardTravelNavigation(page, 'fixture', allowed);
      await page.goto(`${origin}/error-redirect`);
      await expect(guard.settle()).rejects.toThrow(/503/);
    } finally { await page.close(); }
  });
});
