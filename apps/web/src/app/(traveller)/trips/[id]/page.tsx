import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { getCurrentUser } from '@/lib/user-auth';
import { prisma } from '@/lib/prisma';
import { tripCandidateSchema } from '@/lib/traveller/engine/trips/schema';
import { hotelCandidateSchema } from '@/lib/traveller/sources/hotels/schema';
import { flightCandidateSchema } from '@/lib/traveller/sources/flights/schema';
import { matchesFlightRoute, profileSchema } from '@/lib/traveller/profiles';
import { candidateScoreSchema } from '@/lib/traveller/views/candidates';
import { safeHotelUrl } from '@/lib/traveller/views/trips';
import styles from '../../traveller.module.css';
import { ObservationChart } from '../../candidates/history';

export default async function TripEvidence({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) notFound();
  const { id } = await params;
  if (id.length > 100) notFound();
  const row = await prisma.travellerObservation.findFirst({ where: { id, kind: 'trip', profile: { userId: user.id } }, include: { profile: { select: { name: true, constraints: true } }, trip: { include: { flight: { include: { evidence: true } }, hotel: { include: { evidence: true } } } } } });
  if (!row?.trip) notFound();
  const details = tripCandidateSchema.safeParse(row.details), hotel = hotelCandidateSchema.safeParse(row.trip.hotel.details), flight = flightCandidateSchema.safeParse(row.trip.flight.details);
  const profile = profileSchema.safeParse(row.profile.constraints);
  if (!details.success || !hotel.success || !flight.success || details.data.flightObservationId !== row.trip.flight.id || details.data.hotelObservationId !== row.trip.hotel.id
    || !profile.success || !matchesFlightRoute(profile.data, flight.data)) notFound();
  const [t, format, history] = await Promise.all([getTranslations('Traveller'), getFormatter(), prisma.travellerObservation.findMany({ where: { profileId: row.profileId, identity: row.identity, observedAt: { lte: row.observedAt } }, orderBy: { observedAt: 'desc' }, take: 50 })]);
  const money = (amount: string | number, currency = row.currency) => format.number(Number(amount), { style: 'currency', currency });
  const date = (value: Date) => format.dateTime(value, { dateStyle: 'medium', timeStyle: 'short' });
  const yesNo = (value: boolean | null) => t(value === null ? 'unknown' : value ? 'yes' : 'no');
  const scores = [['tripScore', row], ['flightScore', row.trip.flight], ['hotelScore', row.trip.hotel]] as const;
  const hotelUrl = safeHotelUrl(hotel.data.propertyUrl);
  return <>
    <Link href="/trips">← {t('trips')}</Link><h1 className={styles.title}>{details.data.origin} · {details.data.destinationName}</h1>
    <p>{money(row.amount.toString())} · {t('wholeTripTotal')}</p><p>{t(details.data.cabin)} · {details.data.departure} – {details.data.returnDate}</p>
    <p className={styles.meta}>{row.profile.name} · {t('observedAt')}: {date(row.observedAt)}</p>
    {row.expiresAt && row.expiresAt <= new Date() && <p className={styles.notice}>{t('priceExpired')}</p>}
    <p className={styles.notice}>{t('tripConfidenceNotice')}</p>
    <div className={styles.cards}>
      <section className={styles.card}><h2>{t('tripCosts')}</h2><dl>
        <dt>{t('flights')}</dt><dd>{money(details.data.costs.flight.amount, details.data.costs.flight.currency)}</dd>
        <dt>{t('hotels')}</dt><dd>{money(details.data.costs.hotel.amount, details.data.costs.hotel.currency)}</dd>
        <dt>{t('positioningEstimate')}</dt><dd>{money(details.data.costs.positioning.amount, details.data.costs.positioning.currency)}</dd>
        <dt>{t('wholeTripTotal')}</dt><dd>{money(details.data.costs.total.amount, details.data.costs.total.currency)}</dd>
      </dl><Link href={'/discover/' + row.trip.flight.id}>{t('itinerary')} · {t('fareConditions')}</Link></section>
      <section className={styles.card}><h2>{t('hotelConditions')}</h2><h3>{hotel.data.hotelName}</h3><dl>
        <dt>{t('localHotelDates')}</dt><dd>{hotel.data.checkIn} – {hotel.data.checkOut} · {t('stayNights', { nights: details.data.nights })}</dd>
        <dt>{t('minStars')}</dt><dd>{hotel.data.stars ?? t('unknown')}★</dd>
        <dt>{t('minRating')}</dt><dd>{hotel.data.rating ?? t('unknown')}/{hotel.data.ratingScale} · {hotel.data.reviewCount === null ? t('unknown') : t('reviewCount', { count: hotel.data.reviewCount })}</dd>
        <dt>{t('rooms')}</dt><dd>{hotel.data.rooms.length}</dd>
        <dt>{t('party')}</dt><dd>{t('partyCounts', { adults: flight.data.passengers.adults, children: flight.data.passengers.children.length, infants: flight.data.passengers.infants })}</dd>
        <dt>{t('fare')}</dt><dd>{hotel.data.roomName ?? t('unknown')} · {hotel.data.seller}</dd>
        <dt>{t('refundable')}</dt><dd>{yesNo(hotel.data.refundable)}</dd>
        <dt>{t('breakfast')}</dt><dd>{yesNo(hotel.data.breakfast)}</dd>
        <dt>{t('taxesIncluded')}</dt><dd>{t('yes')}</dd>
      </dl>{hotelUrl && <a className={styles.button} href={hotelUrl} target="_blank" rel="noopener noreferrer">{t('openSource')}</a>}</section>
      {scores.map(([title, observation]) => {
        const parsed = candidateScoreSchema.safeParse(observation.score);
        return <section className={styles.card} key={title}><h2>{t(title)}</h2>
          <p>{parsed.success && parsed.data.score !== null ? t('scoreValue', { score: parsed.data.score }) : t('scoreUnavailable')}</p>
          {parsed.success && <><p>{t('confidence')}: {t(parsed.data.confidence)}</p>
            {parsed.data.evidence && <><p>{t('observedBaseline')}: {money(parsed.data.evidence.median, observation.currency)}</p><p>{t('historyDays', { days: parsed.data.evidence.samples })}</p></>}
            {parsed.data.eligibility.length > 0 && <ul>{parsed.data.eligibility.map(reason => <li key={reason}>{t.has('eligibilityReasons.' + reason) ? t('eligibilityReasons.' + reason) : t('requirementsUnconfirmed')}</li>)}</ul>}
          </>}
        </section>;
      })}
    </div>
    <section><h2>{t('verificationEvidence')}</h2><ul>{[...row.trip.flight.evidence, ...row.trip.hotel.evidence].map(evidence => <li key={evidence.id}>{evidence.source} · {money(evidence.amount.toString(), evidence.currency)} · {date(evidence.verifiedAt)} · {t(evidence.direct ? 'directEvidence' : 'aggregatorEvidence')}</li>)}</ul></section>
    <section><h2>{t('history')}</h2><ObservationChart rows={history} currency={row.currency} /><div className={styles.scroll}><table className={styles.table}><thead><tr><th>{t('observedAt')}</th><th>{t('wholeTripTotal')}</th></tr></thead><tbody>{history.map(sample => <tr key={sample.id}><td>{date(sample.observedAt)}</td><td>{money(sample.amount.toString(), sample.currency)}</td></tr>)}</tbody></table></div></section>
  </>;
}
