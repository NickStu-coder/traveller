import { z } from 'zod';

export const hotelCandidateSchema = z.object({
  kind: z.literal('hotel'), source: z.enum(['google_hotels', 'booking']), provenance: z.enum(['cached', 'live']),
  propertyId: z.string().min(1).max(300), hotelName: z.string().min(1).max(300), destinationName: z.string().min(1).max(200),
  destinationAirport: z.string().regex(/^[A-Z]{3}$/).nullable().default(null),
  checkIn: z.iso.date(), checkOut: z.iso.date(), rooms: z.array(z.object({ adults: z.number().int().min(1).max(9), children: z.array(z.number().int().min(0).max(17)).max(8) })).min(1).max(9),
  amount: z.number().finite().positive().max(1_000_000), currency: z.string().regex(/^[A-Z]{3}$/),
  propertyUrl: z.url(), seller: z.string().min(1).max(200), observedAt: z.iso.datetime(),
  contextConfirmed: z.literal(true), taxesIncluded: z.literal(true),
  roomName: z.string().max(300).nullable(), rateName: z.string().max(300).nullable(),
  refundable: z.boolean().nullable(), breakfast: z.boolean().nullable(),
  stars: z.number().int().min(0).max(5).nullable(), rating: z.number().min(0).max(10).nullable(), ratingScale: z.union([z.literal(5), z.literal(10)]), reviewCount: z.number().int().min(0).max(10_000_000).nullable(),
  amenities: z.array(z.string().max(100)).max(50), propertyType: z.string().max(100).nullable(), distanceKm: z.number().finite().nonnegative().nullable(),
}).strict().refine(value => value.rating === null || value.rating <= value.ratingScale, 'Rating exceeds its source scale');
export type HotelCandidate = z.output<typeof hotelCandidateSchema>;
