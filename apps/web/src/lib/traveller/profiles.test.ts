import { expect, it } from 'vitest';
import { matchesDates, profileSchema, travelWindow } from './profiles';

const input = { name: 'Anywhere Business', origins: ['LJU', 'VIE', 'LJU'], destination: { kind: 'anywhere' }, dates: { mode: 'rolling', days: 365 }, duration: { minNights: 5, maxNights: 12 }, passengers: { adults: 1 }, cabin: 'business', positioning: { homeAirports: ['LJU'] } };
it('validates and retains the actual Anywhere Business constraints without expanding a route grid', () => {
  const profile = profileSchema.parse(input);
  expect(profile.origins).toEqual(['LJU', 'VIE']);
  expect(profile.hotel.minReviews).toBe(100);
  expect(profile.flight.allowSelfTransfer).toBe(false);
  expect(travelWindow(profile, new Date('2026-10-06T22:00:00Z'))).toEqual({ from: '2026-10-06', to: '2027-10-06' });
  expect(matchesDates(profile, '2026-11-09', '2026-11-17', new Date('2026-10-06'))).toBe(true);
  expect(matchesDates(profile, '2027-10-04', '2027-10-12', new Date('2026-10-06'))).toBe(false);
  expect(matchesDates(profile, '2026-02-31', '2026-03-08', new Date('2026-01-01'))).toBe(false);
});
it.each([
  { userId: 'attacker' }, { origins: ['bad'] }, { currency: 'ZZZ' },
  { dates: { mode: 'window', from: '2026-02-31', to: '2026-03-10' } },
  { duration: { minNights: 12, maxNights: 5 } },
  { passengers: { adults: 1, infants: 2 } },
  { flight: { minLayoverMinutes: 500, maxLayoverMinutes: 100 } },
])('rejects invalid constraints and client-controlled ownership: %j', patch => {
  expect(profileSchema.safeParse({ ...input, ...patch }).success).toBe(false);
});
