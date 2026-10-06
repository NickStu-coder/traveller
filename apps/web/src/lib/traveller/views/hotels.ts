import { prisma } from '../../prisma';
import { hotelCandidateSchema } from '../sources/hotels/schema';
import { candidateScoreSchema, type CandidateFilters } from './candidates';
import { hotelMatchesFilters } from './filters';
import { filterDestinationRegion } from './regions';

export async function latestHotels(userId: string, filters: CandidateFilters = {}) {
  const rows = await prisma.travellerObservation.findMany({ where: { kind: 'hotel', profile: { userId, active: true, archivedAt: null }, expiresAt: { gt: new Date() } },
    orderBy: { observedAt: 'desc' }, distinct: ['profileId', 'identity'], take: 100, include: { profile: { select: { name: true, revision: true } } } });
  const parsedRows = rows.flatMap(row => {
    const hotel = hotelCandidateSchema.safeParse(row.details), score = candidateScoreSchema.safeParse(row.score);
    if (!hotel.success || row.profileRevision !== row.profile.revision || !hotelMatchesFilters(hotel.data, filters)) return [];
    if (filters.destination && !hotel.data.destinationName.toLocaleLowerCase('en').includes(filters.destination.toLocaleLowerCase('en'))
      || filters.from && hotel.data.checkIn < filters.from || filters.to && hotel.data.checkOut > filters.to
      || filters.currency && row.currency !== filters.currency || filters.maxPrice !== undefined && row.amount.greaterThan(filters.maxPrice)
      || filters.minScore !== undefined && (!score.success || score.data.score === null || score.data.score < filters.minScore)) return [];
    return [{ ...row, hotel: hotel.data, evaluation: score.success ? score.data : null }];
  });
  return filterDestinationRegion(parsedRows, filters.region, row => row.hotel.destinationAirport);
}
