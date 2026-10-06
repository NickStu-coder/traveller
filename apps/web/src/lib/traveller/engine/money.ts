import { Prisma } from '@/generated/prisma/client';

export type Money = { amount: string; currency: string };
export type FxQuote = { from: string; to: string; rate: string; source: string; at: Date };

function amount(value: string, allowZero = false) {
  const parsed = new Prisma.Decimal(value);
  if (!parsed.isFinite() || (allowZero ? parsed.isNegative() : !parsed.isPositive())) throw new Error('Invalid money amount');
  return parsed;
}

export function convertMoney(original: Money, target: string, quote?: FxQuote): Money {
  const value = amount(original.amount);
  if (original.currency === target) return { amount: value.toFixed(4), currency: target };
  if (!quote || quote.from !== original.currency || quote.to !== target || !quote.source || !Number.isFinite(quote.at.getTime())) throw new Error('A matching dated FX quote is required');
  return { amount: value.mul(amount(quote.rate)).toFixed(4), currency: target };
}

export function tripTotal(flight: Money, hotel: Money, positioning: Money | null): Money | null {
  if (!positioning) return null;
  if (hotel.currency !== flight.currency || positioning.currency !== flight.currency) throw new Error('Trip components must use the same currency');
  return { amount: amount(flight.amount).add(amount(hotel.amount)).add(amount(positioning.amount, true)).toFixed(4), currency: flight.currency };
}

export function positioningCost(origin: string, homeAirports: string[], estimates: { airport: string; partyCost: number }[], currency: string): Money | null {
  if (homeAirports.includes(origin)) return { amount: '0', currency };
  const estimate = estimates.find(value => value.airport === origin);
  return estimate ? { amount: amount(String(estimate.partyCost), true).toFixed(4), currency } : null;
}
