import { expect, it } from 'vitest';
import { convertMoney, positioningCost, tripTotal } from './money';
import { dealScore, hotelQuality, priceEvidence, tripScore } from './scoring';
import { hotelStay, verificationConfidence } from './verification';

const now = new Date('2026-10-06T12:00:00Z');
const history = Array.from({ length: 20 }, (_, index) => ({ key: 'business-return-party-1', price: 2000 + index * 10, observedAt: new Date(now.getTime() - (index + 1) * 86400000) }));
it('uses comparable daily medians and resists an extreme outlier', () => {
  const evidence = priceEvidence(history[0]!.key, 1000, [...history, { ...history[0]!, price: 1 }, { key: 'economy', price: 200, observedAt: now }], now)!;
  expect(evidence.median).toBeGreaterThan(2000);
  expect(evidence.samples).toBe(19);
  expect(evidence.rejected).toBe(1);
  expect(evidence.percentile).toBe(0);
  expect(dealScore(evidence, 1, 'high').score).toBeGreaterThanOrEqual(90);
  expect(dealScore(evidence, 1, 'low').score).toBeLessThan(80);
  expect(priceEvidence(history[0]!.key, 1000, Array.from({ length: 30 }, () => history[0]!), now)?.ready).toBe(false);
});
it('penalizes weak hotel evidence and rejects missing review counts', () => {
  const requirement = { minRating: 8, minReviews: 100, minStars: 4 };
  expect(hotelQuality(9.8, 10, 8, 5, requirement).eligible).toBe(false);
  expect(hotelQuality(9.2, 10, 4000, 5, requirement).quality).toBeGreaterThan(hotelQuality(9.8, 10, 8, 5, requirement).quality);
  expect(hotelQuality(6.1, 10, 4000, 4, requirement).eligible).toBe(false);
  expect(hotelQuality(4.6, 5, 4000, 5, requirement).quality).toBeCloseTo(hotelQuality(9.2, 10, 4000, 5, requirement).quality);
  expect(hotelQuality(4.8, 5, null, 5, requirement).eligible).toBe(false);
});
it('requires dated FX and all party costs, including positioning', () => {
  expect(() => convertMoney({ amount: '100', currency: 'USD' }, 'EUR')).toThrow(/quote/);
  expect(convertMoney({ amount: '100.10', currency: 'USD' }, 'EUR', { from: 'USD', to: 'EUR', rate: '0.9', source: 'ECB', at: now })).toEqual({ amount: '90.0900', currency: 'EUR' });
  const flight = { amount: '1087', currency: 'EUR' }, hotel = { amount: '1160', currency: 'EUR' };
  expect(tripTotal(flight, hotel, positioningCost('VIE', ['LJU'], [], 'EUR'))).toBeNull();
  expect(tripTotal(flight, hotel, positioningCost('VIE', ['LJU'], [{ airport: 'VIE', partyCost: 150 }], 'EUR'))).toEqual({ amount: '2397.0000', currency: 'EUR' });
  expect(() => tripTotal(flight, { ...hotel, currency: 'USD' }, { amount: '0', currency: 'EUR' })).toThrow(/currency/);
});
it('requires independent recent evidence for the same itinerary and party price', () => {
  const candidate = { identity: 'exact-business-roundtrip-party-1', amount: 1000, currency: 'EUR' };
  const entry = { ...candidate, source: 'Google', independentGroup: 'google', at: now, direct: false, contextConfirmed: true };
  expect(verificationConfidence(candidate, [entry, { ...entry, source: 'Another Google wrapper' }], now).confidence).toBe('medium');
  expect(verificationConfidence(candidate, [entry, { ...entry, source: 'Airline', independentGroup: 'airline', direct: true }], now).confidence).toBe('high');
  expect(verificationConfidence(candidate, [{ ...entry, identity: 'economy' }, { ...entry, at: new Date(now.getTime() - 16 * 60_000) }, { ...entry, amount: 1600 }], now).confidence).toBe('low');
  expect(hotelStay('2026-11-02', '2026-11-10')).toEqual({ checkIn: '2026-11-02', checkOut: '2026-11-10', nights: 8 });
  expect(hotelStay(null, '2026-11-10')).toBeNull();
  expect(hotelStay('2026-02-31', '2026-03-10')).toBeNull();
});
it('does not call an expensive complete trip a deal because its flight is cheap', () => {
  const evidence = priceEvidence(history[0]!.key, 3500, history, now);
  expect(tripScore(evidence, 98, 55, 'high').score).toBeNull();
});
