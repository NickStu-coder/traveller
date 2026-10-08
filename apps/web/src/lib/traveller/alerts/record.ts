import { createHash } from 'node:crypto';
import type { Prisma, TravellerObservation } from '@/generated/prisma/client';
import type { ChannelMessage } from '../../notifications/channels/types';
import { resolveBaseUrl } from '../../notifications/base-url';
import { matchesFlightRoute, profileSchema } from '../profiles';
import { candidateScoreSchema } from '../views/candidates';
import { flightCandidateSchema } from '../sources/flights/schema';
import { hotelCandidateSchema, type HotelCandidate } from '../sources/hotels/schema';
import { tripCandidateSchema } from '../engine/trips/schema';
import { shouldAlert } from './policy';

/** Called inside fenced ingestion. The immutable event and native outbox commit together. */
export async function recordTravellerAlert(tx: Prisma.TransactionClient, observation: TravellerObservation): Promise<void> {
  const profile = await tx.watchProfile.findUnique({ where: { id: observation.profileId }, include: { user: { select: { locale: true, disabledAt: true } } } });
  if (!profile?.active || profile.archivedAt || profile.user.disabledAt || profile.revision !== observation.profileRevision) return;
  const constraints = profileSchema.parse(profile.constraints), score = candidateScoreSchema.safeParse(observation.score);
  if (!score.success || !['flight', 'hotel', 'trip'].includes(observation.kind) || (observation.kind === 'flight' ? constraints.hotel.enabled : !constraints.hotel.enabled)) return;
  let flightDetails = observation.details;
  let hotel: HotelCandidate | null = null;
  if (observation.kind === 'hotel') {
    const parsed = hotelCandidateSchema.safeParse(observation.details);
    if (!parsed.success) return;
    hotel = parsed.data;
  }
  if (observation.kind === 'trip') {
    const trip = await tx.travellerTrip.findUnique({ where: { observationId_profileId: { observationId: observation.id, profileId: profile.id } }, include: { flight: true, hotel: true } });
    const details = tripCandidateSchema.safeParse(observation.details), selectedHotel = hotelCandidateSchema.safeParse(trip?.hotel.details);
    if (!trip || !details.success || !selectedHotel.success || trip.flight.profileRevision !== profile.revision || trip.hotel.profileRevision !== profile.revision) return;
    flightDetails = trip.flight.details; hotel = selectedHotel.data;
  }
  const parsed = flightCandidateSchema.safeParse(flightDetails);
  if (observation.kind !== 'hotel' && (!parsed.success || !parsed.data.legs || !parsed.data.contextConfirmed)) return;
  const flight = parsed.success ? parsed.data : null;
  if (flight && !matchesFlightRoute(constraints, flight)) return;
  const previous = await tx.travellerAlert.findFirst({ where: { profileId: profile.id, identity: observation.identity }, orderBy: { createdAt: 'desc' }, include: { delivery: { select: { deliveredIds: true } } } });
  const amount = Number(observation.amount), evaluation = score.data;
  if (!shouldAlert({ amount, currency: observation.currency, score: evaluation.score, confidence: evaluation.confidence, observedAt: observation.observedAt,
    eligible: evaluation.eligibility.length === 0, historyReady: evaluation.evidence?.ready === true }, constraints.alerts,
    previous ? { amount: Number(previous.amount), currency: previous.currency, createdAt: previous.createdAt, delivered: previous.delivery ? previous.delivery.deliveredIds.length > 0 : true } : null)) return;
  const eventKey = createHash('sha256').update(JSON.stringify([profile.id, observation.identity, String(observation.amount), observation.currency, previous?.id ?? 'first'])).digest('hex');
  if (await tx.travellerAlert.findUnique({ where: { eventKey } })) return;
  const config = await tx.extractionConfig.findUnique({ where: { id: 'singleton' }, select: { publicBaseUrl: true } });
  const base = config?.publicBaseUrl || process.env.APP_URL ? resolveBaseUrl(config?.publicBaseUrl) : null;
  const sl = profile.user.locale === 'sl';
  const price = new Intl.NumberFormat(sl ? 'sl' : 'en', { style: 'currency', currency: observation.currency }).format(amount);
  const baseline = evaluation.evidence ? new Intl.NumberFormat(sl ? 'sl' : 'en', { style: 'currency', currency: observation.currency }).format(evaluation.evidence.median) : '';
  const destination = (flight?.destinationName ?? hotel!.destinationName).replace(/[\r\n]/g, ' '), date = new Intl.DateTimeFormat(sl ? 'sl' : 'en', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(observation.observedAt);
  const cabin = flight ? sl ? { economy: 'Ekonomski', premium_economy: 'Premium ekonomski', business: 'Poslovni', first: 'Prvi' }[flight.cabin] : flight.cabin.replaceAll('_', ' ') : '';
  const provenance = observation.provenance === 'live' ? sl ? 'neposredno potrjena cena' : 'directly confirmed fare' : sl ? 'predpomnjena cena' : 'cached fare';
  const hotelSummary = hotel ? sl ? ` Hotel: ${hotel.hotelName.replace(/[\r\n]/g, ' ')}, ${hotel.stars ?? '?'}★, ${hotel.rating ?? '?'}/${hotel.ratingScale} (${hotel.reviewCount ?? '?'} ocen), ${hotel.checkIn}–${hotel.checkOut}. Skupna cena vključuje let, celotno bivanje in oceno prevoza do odhodnega letališča.`
    : ` Hotel: ${hotel.hotelName.replace(/[\r\n]/g, ' ')}, ${hotel.stars ?? '?'}★, ${hotel.rating ?? '?'}/${hotel.ratingScale} (${hotel.reviewCount ?? '?'} reviews), ${hotel.checkIn}–${hotel.checkOut}. Total includes flights, the full stay and estimated positioning.` : '';
  const message: ChannelMessage = flight ? {
    title: `${evaluation.score! >= 90 ? sl ? 'IZJEMNA PONUDBA' : 'EXTREME DEAL' : 'Traveller'} · ${evaluation.score}/100 · ${flight.origin} → ${destination}`,
    body: sl ? `${cabin} · ${price} ${hotel ? 'za celotno potovanje' : 'povratno'} za celotno skupino (${flight.passengers.adults} odraslih, ${flight.passengers.children.length} otrok, ${flight.passengers.infants} dojenčkov). ${flight.departure}–${flight.returnDate}. Opažena primerljiva mediana: ${baseline}. Prevozniki: ${flight.airlineCodes.join(', ')}. Oddana prtljaga: ${flight.checkedBags ?? 'ni potrjena'}. Preverjeno: ${date} UTC. Zanesljivost: ${evaluation.confidence === 'high' ? 'visoka' : evaluation.confidence === 'medium' ? 'srednja' : 'nizka'}. Vir: ${observation.source}; ${provenance}. Pred rezervacijo preverite trenutno ceno in pogoje.`
      : `${cabin} · ${price} ${hotel ? 'for the whole trip' : 'return'} for the whole party (${flight.passengers.adults} adults, ${flight.passengers.children.length} children, ${flight.passengers.infants} infants). ${flight.departure}–${flight.returnDate}. Observed comparable median: ${baseline}. Airlines: ${flight.airlineCodes.join(', ')}. Checked bags: ${flight.checkedBags ?? 'unconfirmed'}. Checked: ${date} UTC. Confidence: ${evaluation.confidence}. Source: ${observation.source}; ${provenance}. Confirm the current price and conditions before booking.`,
    url: base ? `${base}/${hotel ? 'trips' : 'discover'}/${observation.id}` : '',
    data: { profileId: profile.id, observationId: observation.id, deliveryOwner: profile.userId, score: evaluation.score, price: amount, currency: observation.currency, confidence: evaluation.confidence },
  } : {
    title: `Traveller · ${evaluation.score}/100 · ${hotel!.hotelName.replace(/[\r\n]/g, ' ')}`,
    body: sl ? `${destination} · ${price} za celotno bivanje, ${hotel!.checkIn}–${hotel!.checkOut}, ${hotel!.rooms.length} sob. ${hotel!.stars ?? '?'}★, ${hotel!.rating ?? '?'}/${hotel!.ratingScale} (${hotel!.reviewCount ?? '?'} ocen). Opažena primerljiva mediana: ${baseline}. Preverjeno: ${date} UTC. Vir: ${hotel!.source}; ponudnik ${hotel!.seller}. Cena vključuje davke. Pred rezervacijo preverite trenutno ceno in pogoje.`
      : `${destination} · ${price} for the full stay, ${hotel!.checkIn}–${hotel!.checkOut}, ${hotel!.rooms.length} rooms. ${hotel!.stars ?? '?'}★, ${hotel!.rating ?? '?'}/${hotel!.ratingScale} (${hotel!.reviewCount ?? '?'} reviews). Observed comparable median: ${baseline}. Checked: ${date} UTC. Source: ${hotel!.source}; seller ${hotel!.seller}. Taxes included. Confirm the current price and conditions before booking.`,
    url: base ? `${base}/stays/${observation.id}` : '',
    data: { profileId: profile.id, observationId: observation.id, deliveryOwner: profile.userId, score: evaluation.score, price: amount, currency: observation.currency, confidence: evaluation.confidence },
  };
  if (flight) message.body += hotelSummary;
  if (hotel) {
    const state = (value: boolean | null) => value === null ? sl ? 'ni potrjeno' : 'unconfirmed' : value ? sl ? 'da' : 'yes' : sl ? 'ne' : 'no';
    message.body += sl ? ` Zajtrk vključen: ${state(hotel.breakfast)}. Brezplačna odpoved: ${state(hotel.refundable)}.`
      : ` Breakfast included: ${state(hotel.breakfast)}. Free cancellation: ${state(hotel.refundable)}.`;
    if (!flight) message.body += sl ? ` Zanesljivost: ${evaluation.confidence === 'high' ? 'visoka' : evaluation.confidence === 'medium' ? 'srednja' : 'nizka'}.`
      : ` Confidence: ${evaluation.confidence}.`;
  }
  const channelIds = [...new Set(constraints.alerts.channelIds)];
  await tx.travellerAlert.create({ data: { profileId: profile.id, profileRevision: profile.revision, observationId: observation.id, identity: observation.identity, eventKey, amount: observation.amount, currency: observation.currency,
    score: evaluation.score!, confidence: evaluation.confidence, channelIds, ...(channelIds.length ? { delivery: { create: { eventKey: 'traveller:' + eventKey, message: message as unknown as Prisma.InputJsonValue } } } : {}) } });
}
