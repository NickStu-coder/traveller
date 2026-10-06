import { z } from 'zod';

const airport = z.string().regex(/^[A-Z]{3}$/);
const currency = z.string().regex(/^[A-Z]{3}$/).refine(code => {
  try { return new Intl.NumberFormat('en', { style: 'currency', currency: code }).resolvedOptions().currency === code && Intl.supportedValuesOf('currency').includes(code); }
  catch { return false; }
});
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(value + 'T00:00:00Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
});
const optionalPrice = z.number().finite().positive().max(1_000_000).nullable().default(null);
const boundedList = z.array(z.string().trim().min(1).max(100)).max(40).default([]);

export const profileSchema = z.object({
  version: z.literal(1).default(1),
  name: z.string().trim().min(1).max(100),
  origins: z.array(airport).min(1).max(12).transform(values => [...new Set(values)]),
  destination: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('anywhere') }).strict(),
    z.object({ kind: z.literal('airport'), values: z.array(airport).min(1).max(30) }).strict(),
    z.object({ kind: z.enum(['city', 'country', 'region', 'continent']), values: z.array(z.string().trim().min(1).max(100)).min(1).max(30) }).strict(),
  ]),
  dates: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('window'), from: date, to: date }).strict().refine(value => value.from <= value.to, 'Date window is reversed'),
    z.object({ mode: z.literal('rolling'), days: z.number().int().min(2).max(730) }).strict(),
    z.object({ mode: z.literal('months'), months: z.array(z.number().int().min(1).max(12)).min(1).max(12), horizonDays: z.number().int().min(2).max(730) }).strict(),
  ]),
  duration: z.object({ minNights: z.number().int().min(1).max(90), maxNights: z.number().int().min(1).max(90) }).strict()
    .refine(value => value.minNights <= value.maxNights, 'Duration range is reversed'),
  passengers: z.object({ adults: z.number().int().min(1).max(9), children: z.array(z.number().int().min(2).max(17)).max(8).default([]), infants: z.number().int().min(0).max(8).default(0) }).strict()
    .refine(value => value.infants <= value.adults && value.adults + value.children.length + value.infants <= 9, 'Invalid passenger allocation'),
  cabin: z.enum(['economy', 'premium_economy', 'business', 'first']),
  currency: currency.default('EUR'),
  flight: z.object({
    maxPrice: optionalPrice, maxStops: z.number().int().min(0).max(5).nullable().default(null),
    maxDurationMinutes: z.number().int().min(30).max(4320).nullable().default(null),
    minLayoverMinutes: z.number().int().min(0).max(1440).default(45),
    maxLayoverMinutes: z.number().int().min(0).max(2880).default(480),
    checkedBags: z.number().int().min(0).max(4).default(0),
    preferredAirlines: boundedList, excludedAirlines: boundedList,
    excludedAirports: z.array(airport).max(40).default([]),
    allowSelfTransfer: z.boolean().default(false), allowOvernight: z.boolean().default(false),
  }).strict().prefault({}).refine(value => value.minLayoverMinutes <= value.maxLayoverMinutes, 'Layover range is reversed'),
  hotel: z.object({
    enabled: z.boolean().default(true), rooms: z.number().int().min(1).max(9).default(1),
    minStars: z.number().int().min(0).max(5).default(4),
    minRating: z.number().min(0).max(10).default(8), minReviews: z.number().int().min(0).max(1_000_000).default(100),
    maxNightlyPrice: optionalPrice, maxTotalPrice: optionalPrice,
    radiusKm: z.number().positive().max(200).nullable().default(null),
    amenities: boundedList, propertyTypes: boundedList,
    breakfast: z.boolean().default(false), refundable: z.boolean().default(false),
  }).strict().prefault({}),
  positioning: z.object({
    homeAirports: z.array(airport).min(1).max(12), maxDistanceKm: z.number().positive().max(3000).default(500),
    estimates: z.array(z.object({ airport, partyCost: z.number().finite().nonnegative().max(100_000) }).strict()).max(12).default([]),
  }).strict(),
  alerts: z.object({
    minScore: z.number().int().min(0).max(100).default(80), maxTripPrice: optionalPrice,
    allowLowConfidence: z.boolean().default(false), cooldownHours: z.number().int().min(1).max(720).default(24),
    minImprovementPercent: z.number().min(0).max(100).default(5),
    channelIds: z.array(z.string().min(1).max(100)).max(10).default([]),
  }).strict().prefault({}),
}).strict().superRefine((profile, context) => {
  if (profile.dates.mode === 'window' && (Date.parse(profile.dates.to) - Date.parse(profile.dates.from)) / 86400000 < profile.duration.minNights)
    context.addIssue({ code: 'custom', path: ['dates'], message: 'Travel window is shorter than the minimum stay' });
  if (profile.dates.mode === 'window' && (Date.parse(profile.dates.to) - Date.parse(profile.dates.from)) / 86400000 > 730)
    context.addIssue({ code: 'custom', path: ['dates'], message: 'Travel window cannot exceed 730 days' });
  if (profile.dates.mode !== 'window' && (profile.dates.mode === 'rolling' ? profile.dates.days : profile.dates.horizonDays) < profile.duration.minNights)
    context.addIssue({ code: 'custom', path: ['dates'], message: 'Travel window is shorter than the minimum stay' });
  if (profile.flight.excludedAirports.some(value => profile.origins.includes(value)))
    context.addIssue({ code: 'custom', path: ['origins'], message: 'An origin is excluded' });
});

export type WatchConstraints = z.output<typeof profileSchema>;

export function travelWindow(profile: WatchConstraints, now = new Date()): { from: string; to: string } {
  if (profile.dates.mode === 'window') return { from: profile.dates.from, to: profile.dates.to };
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const days = profile.dates.mode === 'rolling' ? profile.dates.days : profile.dates.horizonDays;
  return { from: start.toISOString().slice(0, 10), to: new Date(start.getTime() + days * 86400000).toISOString().slice(0, 10) };
}

export function matchesDates(profile: WatchConstraints, departure: string, arrivalHome: string, now = new Date()): boolean {
  if (!date.safeParse(departure).success || !date.safeParse(arrivalHome).success) return false;
  const window = travelWindow(profile, now);
  const nights = (Date.parse(arrivalHome) - Date.parse(departure)) / 86400000;
  return departure >= window.from && arrivalHome <= window.to && departure >= now.toISOString().slice(0, 10)
    && nights >= profile.duration.minNights && nights <= profile.duration.maxNights
    && (profile.dates.mode !== 'months' || profile.dates.months.includes(Number(departure.slice(5, 7))));
}
