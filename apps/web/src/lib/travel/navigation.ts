import type { BrowserContext, Page, Route } from 'playwright';

export interface TravelNavigationGuard {
  reset(): void;
  status(): number;
  settle(): Promise<void>;
}

const guards = new WeakMap<Page, { policy: string; guard: TravelNavigationGuard; handle(route: Route): Promise<void> }>();

/** Fetches redirect hops individually so an allowed origin cannot redirect into a private network. */
function navigationState(page: Page | null, policy: string, allowed: (url: URL) => boolean, maxRedirects = 10) {
  const existing = page ? guards.get(page) : undefined;
  if (existing) {
    if (existing.policy !== policy) throw new Error('A browser page cannot change its navigation security policy');
    return existing;
  }
  let redirects = 0;
  let finalStatus = 0;
  const guard: TravelNavigationGuard = {
    reset() { redirects = 0; finalStatus = 0; },
    status() { return finalStatus; },
    async settle() {
      if (!page) throw new Error('Initial navigation has not created its page');
      await page.waitForFunction(() => !document.documentElement.hasAttribute('data-travel-redirect'), undefined, { timeout: 45_000 });
      if (finalStatus >= 400) throw new Error(`Provider returned HTTP ${finalStatus}`);
    },
  };
  const handle = async (route: Route) => {
    const request = route.request();
    if (!request.isNavigationRequest()) return route.fallback();
    if (page && request.frame() !== page.mainFrame()) return route.fallback();
    const destination = new URL(request.url());
    if (!allowed(destination)) return route.abort('blockedbyclient');
    const response = await route.fetch({ maxRedirects: 0, timeout: 45_000 }).catch(() => null);
    if (!response) return route.abort('failed');
    finalStatus = response.status();
    // A popup's first POST can precede its frame. It cannot expose error markup
    // before a page exists to retain/check the terminal status.
    if (!page && finalStatus >= 400) return route.abort('failed');
    const location = response.headers().location;
    if (![301, 302, 303, 307, 308].includes(finalStatus) || !location) return route.fulfill({ response });
    let next: URL;
    try { next = new URL(location, destination); } catch { return route.abort('blockedbyclient'); }
    if (!allowed(next) || ++redirects > maxRedirects || ([307, 308].includes(finalStatus) && request.method() !== 'GET')) return route.abort('blockedbyclient');
    const target = JSON.stringify(next.href).replaceAll('<', '\\u003c');
    return route.fulfill({ status: 200, contentType: 'text/html', body: `<html data-travel-redirect="pending"><script>location.replace(${target})</script></html>` });
  };
  const state = { policy, guard, handle };
  if (page) guards.set(page, state);
  return state;
}

export async function guardTravelNavigation(page: Page, policy: string, allowed: (url: URL) => boolean): Promise<TravelNavigationGuard> {
  const existing = guards.has(page);
  const state = navigationState(page, policy, allowed);
  if (!existing) await page.route('**/*', state.handle);
  return state.guard;
}

/** Installs before any page or popup exists, including its initial form POST.
 * Each page keeps its own redirect counter and status; the allowed policy is fixed.
 */
export async function guardTravelContext(context: BrowserContext, policy: string, allowed: (url: URL) => boolean): Promise<(page: Page) => TravelNavigationGuard> {
  await context.route('**/*', async route => {
    const request = route.request();
    if (!request.isNavigationRequest()) return route.fallback();
    let frame;
    try { frame = request.frame(); } catch { /* The initial popup POST precedes its frame. */ }
    if (frame && frame !== frame.page().mainFrame()) return route.fallback();
    // Reserve one hop for a frameless initial POST; each later page remains bounded.
    await navigationState(frame?.page() ?? null, policy, allowed, 9).handle(route);
  });
  return page => navigationState(page, policy, allowed).guard;
}
