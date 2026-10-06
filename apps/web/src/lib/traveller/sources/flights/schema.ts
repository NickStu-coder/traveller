import { z } from 'zod';
import { profileSchema } from '../../profiles';
const airport = z.string().regex(/^[A-Z]{3}$/);
const segment = z.object({ origin: airport, destination: airport, date: z.iso.date(), arrivalDate: z.iso.date(), airline: z.string().regex(/^[A-Z0-9]{2}$/), number: z.string().regex(/^\d{1,4}[A-Z]?$/), cabin: profileSchema.shape.cabin,
  departureTime: z.string().max(30), arrivalTime: z.string().max(30), durationMinutes: z.number().positive().max(4320) }).strict();
export const flightCandidateSchema = z.object({ kind: z.literal('flight'), origin: airport, destination: z.string().max(100), destinationName: z.string().min(1).max(200), departure: z.iso.date(), returnDate: z.iso.date(),
  cabin: profileSchema.shape.cabin, passengers: profileSchema.shape.passengers, amount: z.number().positive().max(1_000_000), currency: profileSchema.shape.currency,
  stops: z.number().int().nonnegative().max(5).nullable(), durationMinutes: z.number().positive().max(4320).nullable(), bookingUrl: z.url().max(20000), source: z.enum(['google_explore', 'google_flights', 'airline_direct']),
  provenance: z.enum(['live', 'cached']), observedAt: z.iso.datetime(), contextConfirmed: z.literal(true), checkedBags: z.number().int().nonnegative().max(4).nullable(), selfTransfer: z.boolean().nullable(), overnight: z.boolean().nullable(),
  airlineCodes: z.array(z.string().regex(/^[A-Z0-9]{2}$/)).max(20), connectionAirports: z.array(airport).max(20), layoverMinutes: z.array(z.number().nonnegative().max(2880)).max(8).nullable(), arrivalLocal: z.iso.date().nullable(), returnDepartureLocal: z.iso.date().nullable(),
  legs: z.array(z.array(segment).min(1).max(4)).length(2).optional(), fare: z.object({ provider: z.string().max(100), name: z.string().max(100).nullable(), refundable: z.boolean().nullable(), changesAllowed: z.boolean().nullable() }).strict().optional(),
  directConfirmation: z.object({ provider: z.literal('Lufthansa'), url: z.literal('https://shop.lufthansa.com/booking/cart'), googleAmount: z.number().positive().max(1_000_000), verifiedAt: z.iso.datetime(),
    marketingAliases: z.array(z.object({ google: z.string().regex(/^VL\d{1,4}[A-Z]?$/), direct: z.string().regex(/^LH\d{1,4}[A-Z]?$/), operator: z.literal('Lufthansa City Airlines') }).strict()).max(8) }).strict().optional(),
}).strict();
