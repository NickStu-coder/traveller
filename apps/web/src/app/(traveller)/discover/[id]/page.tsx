import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { getCurrentUser } from '@/lib/user-auth';
import { prisma } from '@/lib/prisma';
import { flightCandidateSchema } from '@/lib/traveller/sources/flights/schema';
import { matchesFlightRoute, profileSchema } from '@/lib/traveller/profiles';
import { candidateScoreSchema, safeCandidateBookingUrl } from '@/lib/traveller/views/candidates';
import { hotelStay } from '@/lib/traveller/engine/verification';
import styles from '../../traveller.module.css';
import { ObservationChart } from '../../candidates/history';

export default async function DealEvidence({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) notFound();
  const { id } = await params;
  if (id.length > 100) notFound();
  const row = await prisma.travellerObservation.findFirst({ where: { id, kind: 'flight', profile: { userId: user.id } }, include: { profile: { select: { name: true, constraints: true } }, evidence: { orderBy: { verifiedAt: 'desc' }, take: 20 } } });
  if (!row) notFound();
  const parsed = flightCandidateSchema.safeParse(row.details);
  const profile = profileSchema.safeParse(row.profile.constraints);
  if (!parsed.success || !profile.success || !matchesFlightRoute(profile.data, parsed.data)) notFound();
  const flight = parsed.data, score = candidateScoreSchema.safeParse(row.score), bookingUrl = safeCandidateBookingUrl(row.bookingUrl);
  const [t, format, history] = await Promise.all([getTranslations('Traveller'), getFormatter(), prisma.travellerObservation.findMany({ where: { profileId: row.profileId, identity: row.identity, observedAt: { lte: row.observedAt } }, orderBy: { observedAt: 'desc' }, take: 50, select: { id: true, observedAt: true, amount: true, currency: true, source: true } })]);
  const money = (value: number, currency = row.currency) => format.number(value, { style: 'currency', currency });
  const date = (value: Date) => format.dateTime(value, { dateStyle: 'medium', timeStyle: 'short' });
  const yesNo = (value: boolean | null) => t(value === null ? 'unknown' : value ? 'yes' : 'no');
  const stay = hotelStay(flight.arrivalLocal, flight.returnDepartureLocal);
  const expired = row.expiresAt !== null && row.expiresAt <= new Date();
  return <>
    <Link href="/discover">← {t('discover')}</Link><h1 className={styles.title}>{flight.origin} · {flight.destinationName}</h1>
    <p>{money(Number(row.amount))} · {t('partyTotal')} · {t(flight.cabin)}</p><p>{flight.departure} – {flight.returnDate}</p>
    <p className={styles.meta}>{row.profile.name} · {t('profileRevision', { revision: row.profileRevision })} · {t('observedAt')}: {date(row.observedAt)}</p>
    {expired && <p className={styles.notice}>{t('priceExpired')}</p>}
    <div className={styles.cards}>
      <section className={styles.card}><h2>{t('dealScore')}</h2>
        <p>{score.success && score.data.score !== null ? t('scoreValue', { score: score.data.score }) : t('scoreUnavailable')}</p>
        {score.success && <><p>{t('confidence')}: {t(score.data.confidence)}</p>
          {score.data.evidence && <><p>{t('observedBaseline')}: {money(score.data.evidence.median)}</p><p>{t('historyDays', { days: score.data.evidence.samples })}</p>
            <p>{t('discountValue', { percent: format.number(score.data.evidence.discount, { style: 'percent', maximumFractionDigits: 1 }) })}</p></>}
          {score.data.eligibility.length > 0 && <><h3>{t('requirementsUnconfirmed')}</h3><ul>{score.data.eligibility.map(reason => <li key={reason}>{t.has('eligibilityReasons.' + reason) ? t('eligibilityReasons.' + reason) : t('requirementsUnconfirmed')}</li>)}</ul></>}
        </>}
        {row.baseAmount !== null && row.baseCurrency && row.baseCurrency !== row.currency && <p className={styles.meta}>{t('referenceEstimate', { amount: money(Number(row.baseAmount), row.baseCurrency), source: row.fxSource ?? '', date: row.fxAt ? format.dateTime(row.fxAt, { dateStyle: 'medium' }) : '' })}</p>}
      </section>
      <section className={styles.card}><h2>{t('fareConditions')}</h2><dl>
        <dt>{t('party')}</dt><dd>{t('partyCounts', { adults: flight.passengers.adults, children: flight.passengers.children.length, infants: flight.passengers.infants })}</dd>
        <dt>{t('fare')}</dt><dd>{flight.fare ? flight.fare.provider + ' · ' + (flight.fare.name ?? t('unknown')) : t('unknown')}</dd>
        <dt>{t('bags')}</dt><dd>{flight.checkedBags ?? t('unknown')}</dd>
        <dt>{t('refundable')}</dt><dd>{yesNo(flight.fare?.refundable ?? null)}</dd>
        <dt>{t('changesAllowed')}</dt><dd>{yesNo(flight.fare?.changesAllowed ?? null)}</dd>
        <dt>{t('selfTransfer')}</dt><dd>{yesNo(flight.selfTransfer)}</dd>
        <dt>{t('overnight')}</dt><dd>{yesNo(flight.overnight)}</dd>
        {stay && <><dt>{t('localHotelDates')}</dt><dd>{stay.checkIn} – {stay.checkOut} · {t('stayNights', { nights: stay.nights })}</dd></>}
      </dl></section>
    </div>
    {flight.legs && <section><h2>{t('itinerary')}</h2>{flight.legs.map((leg, index) => <article className={styles.card} key={index}><h3>{t(index === 0 ? 'outbound' : 'inbound')}</h3><ol>{leg.map((segment, segmentIndex) => <li key={segmentIndex}>
      {segment.origin} → {segment.destination} · {segment.airline}{segment.number} · {t(segment.cabin)}<br />{segment.date} {segment.departureTime} → {segment.arrivalDate} {segment.arrivalTime}
    </li>)}</ol></article>)}</section>}
    <section><h2>{t('verificationEvidence')}</h2><p className={styles.notice}>{t(flight.directConfirmation ? 'directConfidenceNotice' : 'googleConfidenceNotice')}</p>
      {flight.directConfirmation && <><p>{t('directPriceComparison', { google: money(flight.directConfirmation.googleAmount), direct: money(flight.amount) })}</p>
        {flight.directConfirmation.marketingAliases.map(alias => <p className={styles.meta} key={alias.google}>{alias.google} / {alias.direct} · {alias.operator}</p>)}</>}
      {row.evidence.length ? <ul>{row.evidence.map(evidence => <li key={evidence.id}>{evidence.source} · {money(Number(evidence.amount), evidence.currency)} · {date(evidence.verifiedAt)} · {t(evidence.direct ? 'directEvidence' : 'aggregatorEvidence')}</li>)}</ul> : <p>{t('candidateUnverified')}</p>}
    </section>
    <section><h2>{t('history')}</h2><ObservationChart rows={history} currency={row.currency} /><div className={styles.scroll}><table className={styles.table}><thead><tr><th>{t('observedAt')}</th><th>{t('partyTotal')}</th><th>{t('source')}</th></tr></thead><tbody>{history.map(sample => <tr key={sample.id}><td>{date(sample.observedAt)}</td><td>{money(Number(sample.amount), sample.currency)}</td><td>{sample.source}</td></tr>)}</tbody></table></div></section>
    {bookingUrl && <p><a className={styles.button} href={bookingUrl} target="_blank" rel="noopener noreferrer">{t('openSource')}</a></p>}
  </>;
}
