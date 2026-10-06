import { createHash } from 'node:crypto';
import type { Prisma, TravellerJob, TravellerObservation } from '@/generated/prisma/client';
import type { WatchConstraints } from '../../profiles';
import type { FlightCandidate } from '../../sources/types';
import type { HotelCandidate } from '../../sources/hotels/schema';
import { hotelEligibility } from '../../sources/hotels/google-hotel';
import { dealScore, hotelQuality, tripScore } from '../scoring';
import { historicalPrice } from '../history/daily';
import { convertMoney, positioningCost, tripTotal } from '../money';
import { fxQuote, type FxData } from '../fx';
import type { ScoreWeights } from '../policy';
import { flightComparison, flightEligibility, flightIdentity } from '../pipeline';
import { hotelStay } from '../verification';
import { candidateScoreSchema } from '../../views/candidates';
import { recordTravellerAlert } from '../../alerts/record';
import { tripCandidateSchema } from './schema';

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const hotelIdentity = (hotel: HotelCandidate) => hash([hotel.propertyId, hotel.checkIn, hotel.checkOut, hotel.rooms, hotel.seller, hotel.roomName, hotel.rateName, hotel.refundable, hotel.breakfast]);
export const hotelComparison = (hotel: HotelCandidate) => hash(['hotel-v1', hotel.propertyId, hotel.rooms, hotel.currency, hotel.checkIn.slice(5, 7),
  (Date.parse(hotel.checkOut) - Date.parse(hotel.checkIn)) / 86400000, hotel.seller, hotel.roomName, hotel.rateName, hotel.refundable, hotel.breakfast]);

/** Components and trip observations reference the same private profile in database constraints. */
export async function recordHotels(tx: Prisma.TransactionClient, job: TravellerJob, userId: string, profile: WatchConstraints, flightObservation: TravellerObservation,
  flight: FlightCandidate, hotels: HotelCandidate[], engine: { baseCurrency: string; weights: ScoreWeights }, fx: FxData | null): Promise<void> {
  const stay = hotelStay(flight.arrivalLocal, flight.returnDepartureLocal);
  if (!stay || flightObservation.profileId !== job.profileId || flightObservation.profileRevision !== job.profileRevision) throw new Error('Trip flight context no longer matches the private profile');
  const flightScore = candidateScoreSchema.safeParse(flightObservation.score);
  for (const hotel of hotels) {
    if (hotel.checkIn !== stay.checkIn || hotel.checkOut !== stay.checkOut || hotel.destinationName !== flight.destinationName) throw new Error('Hotel context differs from the selected itinerary');
    const identity = hotelIdentity(hotel), comparisonKey = hotelComparison(hotel), observedAt = new Date(hotel.observedAt);
    const reasons = hotelEligibility(hotel, profile), quality = hotelQuality(hotel.rating, hotel.ratingScale, hotel.reviewCount, hotel.stars, profile.hotel);
    const evidence = await historicalPrice(tx, userId, comparisonKey, hotel.amount, observedAt);
    const score = { ...dealScore(evidence, quality.quality, 'medium', reasons.length === 0, engine.weights), confidence: 'medium', eligibility: reasons, reviewConfidence: quality.reviewConfidence, kind: 'hotel' };
    const quote = hotel.currency === engine.baseCurrency ? { from: hotel.currency, to: engine.baseCurrency, rate: '1', source: 'same currency', at: observedAt } : fxQuote(fx, hotel.currency, engine.baseCurrency, observedAt);
    const converted = quote ? convertMoney({ amount: String(hotel.amount), currency: hotel.currency }, engine.baseCurrency, quote, observedAt) : null;
    const hotelObservation = await tx.travellerObservation.upsert({ where: { profileId_source_identity_observedAt: { profileId: job.profileId, source: hotel.source, identity, observedAt } }, update: {}, create: {
      profileId: job.profileId, profileRevision: job.profileRevision, kind: 'hotel', source: hotel.source, provenance: hotel.provenance, identity, comparisonKey, observedAt, expiresAt: new Date(observedAt.getTime() + 30 * 60000),
      amount: String(hotel.amount), currency: hotel.currency, bookingUrl: hotel.propertyUrl, details: hotel as unknown as Prisma.InputJsonValue, score: score as unknown as Prisma.InputJsonValue,
      ...(converted && quote ? { baseAmount: converted.amount, baseCurrency: converted.currency, fxRate: quote.rate, fxSource: quote.source, fxAt: quote.at } : {}),
    } });
    if (!await tx.travellerVerification.count({ where: { observationId: hotelObservation.id, source: hotel.source, verifiedAt: observedAt } }))
      await tx.travellerVerification.create({ data: { observationId: hotelObservation.id, source: hotel.source, independentGroup: hotel.source, identity, amount: String(hotel.amount), currency: hotel.currency, verifiedAt: observedAt, contextConfirmed: true } });
    await recordTravellerAlert(tx, hotelObservation);
    const now = new Date();
    if (now.getTime() - flightObservation.observedAt.getTime() > 15 * 60000 || !flightObservation.expiresAt || flightObservation.expiresAt <= now) continue;
    const positioning = positioningCost(flight.origin, profile.positioning.homeAirports, profile.positioning.estimates, profile.currency);
    const hotelQuote = fxQuote(fx, hotel.currency, profile.currency, observedAt), flightQuote = fxQuote(fx, flight.currency, profile.currency, observedAt);
    if (hotel.currency !== profile.currency && !hotelQuote || flight.currency !== profile.currency && !flightQuote) continue;
    const flightCost = convertMoney({ amount: String(flight.amount), currency: flight.currency }, profile.currency, flightQuote);
    const hotelCost = convertMoney({ amount: String(hotel.amount), currency: hotel.currency }, profile.currency, hotelQuote);
    const total = tripTotal(flightCost, hotelCost, positioning);
    if (!total || !positioning) continue;
    const tripAt = observedAt;
    const tripIdentity = hash([flightIdentity(flight), identity, positioning]);
    const tripComparison = hash(['trip-v1', flightComparison(flight), comparisonKey, positioning, profile.currency]);
    const tripReasons = [...flightEligibility(flight, profile), ...reasons];
    if (stay.nights < profile.duration.minNights || stay.nights > profile.duration.maxNights) tripReasons.push('local_stay_duration');
    if (profile.alerts.maxTripPrice !== null && Number(total.amount) > profile.alerts.maxTripPrice) tripReasons.push('trip_price');
    const tripEvidence = await historicalPrice(tx, userId, tripComparison, Number(total.amount), tripAt);
    const evaluation = { ...tripScore(tripReasons.length ? null : tripEvidence, flightScore.success ? flightScore.data.score : null, score.score, 'medium', engine.weights), confidence: 'medium', eligibility: tripReasons, kind: 'trip' };
    const details = tripCandidateSchema.parse({ kind: 'trip', origin: flight.origin, destinationName: flight.destinationName, departure: flight.departure, returnDate: flight.returnDate, cabin: flight.cabin,
      ...stay, hotelName: hotel.hotelName, flightObservationId: flightObservation.id, hotelObservationId: hotelObservation.id, costs: { flight: flightCost, hotel: hotelCost, positioning, total } });
    const trip = await tx.travellerObservation.upsert({ where: { profileId_source_identity_observedAt: { profileId: job.profileId, source: 'combined', identity: tripIdentity, observedAt: tripAt } }, update: {}, create: {
      profileId: job.profileId, profileRevision: job.profileRevision, kind: 'trip', source: 'combined', provenance: 'cached', identity: tripIdentity, comparisonKey: tripComparison, observedAt: tripAt,
      expiresAt: new Date(Math.min(flightObservation.expiresAt.getTime(), hotelObservation.expiresAt!.getTime(), flightObservation.observedAt.getTime() + 15 * 60000, observedAt.getTime() + 15 * 60000)), amount: total.amount, currency: total.currency,
      details: details as unknown as Prisma.InputJsonValue, score: evaluation as unknown as Prisma.InputJsonValue,
    } });
    await tx.travellerTrip.upsert({ where: { profileId_flightObservationId_hotelObservationId: { profileId: job.profileId, flightObservationId: flightObservation.id, hotelObservationId: hotelObservation.id } }, update: {},
      create: { profileId: job.profileId, observationId: trip.id, flightObservationId: flightObservation.id, hotelObservationId: hotelObservation.id } });
    await recordTravellerAlert(tx, trip);
  }
}
