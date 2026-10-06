import { expect, it } from 'vitest';
import { profileSchema } from '../profiles';
import { shouldAlert } from './policy';
const profile = profileSchema.parse({ name: 'Alert policy', origins: ['LJU'], destination: { kind: 'anywhere' }, dates: { mode: 'rolling', days: 365 }, duration: { minNights: 5, maxNights: 12 }, passengers: { adults: 2 }, cabin: 'business', positioning: { homeAirports: ['LJU'] } });
const now = new Date('2026-10-06T12:00:00Z');
const candidate = { amount: 1000, currency: 'EUR', score: 89, confidence: 'medium' as const, observedAt: now, eligible: true, historyReady: true };
it('requires qualified measured history and recent permitted confidence before an alert', () => {
  expect(shouldAlert(candidate, profile.alerts, null, now)).toBe(true);
  for (const change of [{ score: null }, { score: 79 }, { confidence: 'low' as const }, { eligible: false }, { historyReady: false }, { amount: 0 }, { observedAt: new Date(now.getTime() - 16 * 60000) }])
    expect(shouldAlert({ ...candidate, ...change }, profile.alerts, null, now)).toBe(false);
});
it('does not repeat unchanged accepted fares and requires both cooldown and a meaningful improvement', () => {
  const previous = { amount: 1200, currency: 'EUR', createdAt: new Date(now.getTime() - 25 * 3600000), delivered: true };
  expect(shouldAlert(candidate, profile.alerts, previous, now)).toBe(true);
  expect(shouldAlert({ ...candidate, amount: 1200 }, profile.alerts, previous, now)).toBe(false);
  expect(shouldAlert({ ...candidate, amount: 1170 }, profile.alerts, previous, now)).toBe(false);
  expect(shouldAlert(candidate, profile.alerts, { ...previous, createdAt: new Date(now.getTime() - 23 * 3600000) }, now)).toBe(false);
  expect(shouldAlert(candidate, profile.alerts, { ...previous, currency: 'USD' }, now)).toBe(false);
  expect(shouldAlert({ ...candidate, amount: 1200 }, profile.alerts, { ...previous, delivered: false }, now)).toBe(true);
});
