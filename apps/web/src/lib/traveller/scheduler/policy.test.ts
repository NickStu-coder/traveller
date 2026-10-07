import { describe, it, expect } from 'vitest';
import { profileSchema } from '../profiles';
import { DEFAULT_SCHEDULER, discoveryRequest, nextCheck } from './policy';
import { googleDiscoveryUrl, googlePassengerCategories } from '../sources/google-url';

const profile = profileSchema.parse({ name: 'Anywhere', origins: ['LJU', 'VIE'], destination: { kind: 'anywhere' }, dates: { mode: 'rolling', days: 365 }, duration: { minNights: 5, maxNights: 12 }, passengers: { adults: 1 }, cabin: 'business', positioning: { homeAirports: ['LJU'] } });
describe('bounded adaptive discovery', () => {
  it('defaults to three-hour discovery and rotates samples at the configured interval', () => {
    expect(DEFAULT_SCHEDULER.discoveryMinutes).toBe(180);
    const now = new Date('2026-10-06T00:00:00Z');
    const later = new Date(now.getTime() + 3 * 3600000);
    expect(discoveryRequest(profile, 'profile', now, 180)).not.toEqual(discoveryRequest(profile, 'profile', later, 180));
    expect(discoveryRequest(profile, 'profile', now, 360)).toEqual(discoveryRequest(profile, 'profile', later, 360));
    const minutes = (nextCheck('profile', 'DISCOVERY', 0, now).getTime() - now.getTime()) / 60000;
    expect(minutes).toBeGreaterThanOrEqual(162);
    expect(minutes).toBeLessThanOrEqual(198);
  });
  it('rotates origins and full-year dates without constructing a destination matrix', () => {
    const start = new Date('2026-10-06T00:00:00Z');
    const requests = Array.from({ length: 365 }, (_, slot) => discoveryRequest(profile, 'profile', new Date(start.getTime() + slot * DEFAULT_SCHEDULER.discoveryMinutes * 60000))!);
    expect(new Set(requests.map(request => request.origin))).toEqual(new Set(['LJU', 'VIE']));
    expect(requests.every(request => request.destination === null)).toBe(true);
    expect(requests.every(request => { const nights = (Date.parse(request.returnDate) - Date.parse(request.departure)) / 86400000; return nights >= 5 && nights <= 12; })).toBe(true);
    expect(requests.some(request => Date.parse(request.departure) - start.getTime() > 300 * 86400000)).toBe(true);
  });
  it('honors months, fixed windows and expired windows', () => {
    const now = new Date('2026-10-06T00:00:00Z');
    const request = discoveryRequest({ ...profile, dates: { mode: 'months', months: [1], horizonDays: 365 } }, 'a', now)!;
    expect(request.departure.slice(5, 7)).toBe('01');
    expect(discoveryRequest({ ...profile, dates: { mode: 'window', from: '2026-09-01', to: '2026-09-15' } }, 'a', now)).toBeNull();
  });
  it.each([6, 15, 26, 31, 60, 365])('spreads checks and covers all %i available dates without repetition', days => {
    const start = new Date('2026-10-06T00:00:00Z');
    const from = '2027-04-01';
    const to = new Date(Date.parse(from) + (days + 4) * 86400000).toISOString().slice(0, 10);
    const fixed = { ...profile, dates: { mode: 'window' as const, from, to }, duration: { minNights: 5, maxNights: 5 } };
    const requests = Array.from({ length: days }, (_, slot) => discoveryRequest(fixed, 'date-coverage', new Date(start.getTime() + slot * 180 * 60000))!);
    expect(new Set(requests.map(request => request.departure)).size).toBe(days);
    expect(Math.abs(Date.parse(requests[0]!.departure) - Date.parse(requests[1]!.departure)) / 86400000).toBeGreaterThanOrEqual(days / 3);
    expect(requests.every(request => Date.parse(request.returnDate) - Date.parse(request.departure) === 5 * 86400000)).toBe(true);
  });
  it('backs off failures while keeping hot work ahead of discovery', () => {
    const now = new Date('2026-10-06T00:00:00Z');
    expect(nextCheck('a', 'HOT', 0, now).getTime()).toBeLessThan(nextCheck('a', 'DISCOVERY', 0, now).getTime());
    expect(nextCheck('a', 'DISCOVERY', 3, now).getTime()).toBeGreaterThan(nextCheck('a', 'DISCOVERY', 0, now).getTime());
    expect(nextCheck('a', 'DISCOVERY', 0, now)).toEqual(nextCheck('a', 'DISCOVERY', 0, now));
  });
  it('encodes explicit context and provider passenger age categories', () => {
    expect(googlePassengerCategories({ ...profile, passengers: { adults: 2, children: [4, 15], infants: 1 } })).toEqual([1, 1, 2, 1, 4]);
    const request = { origin: 'LJU', destination: null, departure: '2027-04-01', returnDate: '2027-04-07' };
    const url = new URL(googleDiscoveryUrl(request, profile));
    expect(url.searchParams.get('curr')).toBe('EUR');
    expect(Buffer.from(url.searchParams.get('tfs')!, 'base64url').toString()).toContain('2027-04-01');
    expect(() => googleDiscoveryUrl({ ...request, destination: 'Asia' }, profile)).toThrow('entity');
  });
});
