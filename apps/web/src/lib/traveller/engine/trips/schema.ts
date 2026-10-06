import { z } from 'zod';

const money = z.object({ amount: z.string().regex(/^\d+(?:\.\d+)?$/), currency: z.string().regex(/^[A-Z]{3}$/) });
export const tripCandidateSchema = z.object({
  kind: z.literal('trip'), origin: z.string().regex(/^[A-Z]{3}$/), destinationName: z.string().min(1),
  departure: z.iso.date(), returnDate: z.iso.date(), cabin: z.enum(['economy', 'premium_economy', 'business', 'first']),
  checkIn: z.iso.date(), checkOut: z.iso.date(), nights: z.number().int().positive().max(90),
  flightObservationId: z.string().min(1), hotelObservationId: z.string().min(1),
  hotelName: z.string().min(1), costs: z.object({ flight: money, hotel: money, positioning: money, total: money }),
}).strict();
