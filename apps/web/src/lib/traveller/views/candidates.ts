import { z } from 'zod';
import { prisma } from '../../prisma';

const detailsSchema = z.object({ origin: z.string().regex(/^[A-Z]{3}$/), destinationName: z.string().min(1).max(200), departure: z.iso.date(), returnDate: z.iso.date(), cabin: z.enum(['economy', 'premium_economy', 'business', 'first']) });
export async function latestFlightCandidates(userId: string) {
  const rows = await prisma.travellerObservation.findMany({ where: { kind: 'flight', profile: { userId }, expiresAt: { gt: new Date() } },
    orderBy: { observedAt: 'desc' }, distinct: ['profileId', 'identity'], take: 50, include: { profile: { select: { name: true } } } });
  return rows.flatMap(row => {
    const details = detailsSchema.safeParse(row.details);
    if (!details.success || !row.bookingUrl) return [];
    let url: URL;
    try { url = new URL(row.bookingUrl); } catch { return []; }
    if (url.protocol !== 'https:' || url.hostname !== 'www.google.com' || url.username || url.password || url.port || !url.pathname.startsWith('/travel/flights')) return [];
    return [{ ...row, flight: details.data }];
  });
}
