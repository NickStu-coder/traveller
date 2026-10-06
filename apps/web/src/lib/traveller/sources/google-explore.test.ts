/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { profileSchema } from '../profiles';
import { confirmExploreContext, parseExploreCards, readExploreCardElements, type ExploreControls } from './google-explore';
import { googleDiscoveryUrl } from './google-url';

const profile = profileSchema.parse({ name: 'Anywhere', origins: ['LJU'], destination: { kind: 'anywhere' }, dates: { mode: 'rolling', days: 365 }, duration: { minNights: 5, maxNights: 12 }, passengers: { adults: 2 }, cabin: 'business', positioning: { homeAirports: ['LJU'] } });
const request = { origin: 'LJU', destination: null, departure: '2027-04-01', returnDate: '2027-04-07' };
const controls: ExploreControls = { url: googleDiscoveryUrl(request, profile), loading: false, origin: 'Where from? Ljubljana LJU', cabin: 'Business', departure: 'Thu, Apr 1', returnDate: 'Wed, Apr 7', adultCount: 2, childCount: 0, infantSeatCount: 0, infantLapCount: 0 };
// Reduced structural fixture captured from the public Google Explore UI on 2026-10-06.
const fixture = '<ul><li role="button" data-code="/m/05qtj"><h3>Paris</h3><span data-gs="flight" aria-label="961 euros">€961</span><span class="nx0jzf">1 stop</span><span class="Xq1DAb">3 hr 30 min</span><span data-gs="">€172</span></li><li role="button" data-code="/m/07pfk"><h3>Venice</h3><span>3h</span><span data-gs="">€170</span></li></ul>';

describe('Google Explore captured context', () => {
  it('accepts the party total and excludes hotel averages and ground-only destinations', () => {
    document.body.innerHTML = fixture;
    const cards = readExploreCardElements([...document.querySelectorAll('li[role="button"][data-code]')], 'EUR');
    confirmExploreContext(controls, request, profile);
    const result = parseExploreCards(cards, request, profile, new Date('2026-10-06T06:00:00Z'));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ amount: 961, provenance: 'cached', destination: '/m/05qtj', stops: 1, durationMinutes: 210, passengers: { adults: 2 }, checkedBags: null, selfTransfer: null });
    expect(result[0]!.bookingUrl).toContain('/travel/flights?');
  });
  it('rejects stale loading results, wrong cabin, dates and passenger allocation', () => {
    for (const changed of [{ loading: true }, { cabin: 'Economy' }, { departure: 'Fri, Apr 2' }, { adultCount: 1 }])
      expect(() => confirmExploreContext({ ...controls, ...changed }, request, profile)).toThrow(/context/);
    expect(() => confirmExploreContext({ ...controls, url: googleDiscoveryUrl({ ...request, returnDate: '2027-04-08' }, profile) }, request, profile)).toThrow(/date/);
  });
  it('rejects malformed prices and duplicate city observations', () => {
    const card = { entity: '/m/05qtj', name: 'Paris', flightPrice: '1,234', currency: 'EUR', stops: 'Nonstop', duration: '2 hr' };
    expect(parseExploreCards([card, card, { ...card, entity: '/m/other', flightPrice: '-1' }], request, profile)).toHaveLength(1);
    expect(parseExploreCards([{ ...card, flightPrice: 'unavailable' }], request, profile)).toHaveLength(0);
  });
});
