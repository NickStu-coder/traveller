import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { getCurrentUser } from '@/lib/user-auth';
import { prisma } from '@/lib/prisma';
import { hotelCandidateSchema } from '@/lib/traveller/sources/hotels/schema';
import { candidateScoreSchema } from '@/lib/traveller/views/candidates';
import { safeHotelUrl } from '@/lib/traveller/views/trips';
import styles from '../../traveller.module.css';
import { ObservationChart } from '../../candidates/history';

export default async function HotelEvidence({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) notFound();
  const { id } = await params;
  if (id.length > 100) notFound();
  const row = await prisma.travellerObservation.findFirst({ where: { id, kind: 'hotel', profile: { userId: user.id } }, include: { profile: { select: { name: true } }, evidence: true } });
  if (!row) notFound();
  const hotel = hotelCandidateSchema.safeParse(row.details);
  if (!hotel.success) notFound();
  const [t, format, history] = await Promise.all([getTranslations('Traveller'), getFormatter(), prisma.travellerObservation.findMany({ where: { profileId: row.profileId, identity: row.identity, observedAt: { lte: row.observedAt } }, orderBy: { observedAt: 'desc' }, take: 50 })]);
  const money = (amount: string | number, currency = row.currency) => format.number(Number(amount), { style: 'currency', currency });
  const date = (value: Date) => format.dateTime(value, { dateStyle: 'medium', timeStyle: 'short' });
  const yesNo = (value: boolean | null) => t(value === null ? 'unknown' : value ? 'yes' : 'no');
  const evaluation = candidateScoreSchema.safeParse(row.score), url = safeHotelUrl(hotel.data.propertyUrl);
  return <><Link href="/discover?kind=hotel">← {t('hotels')}</Link><h1 className={styles.title}>{hotel.data.hotelName}</h1>
    <p>{hotel.data.destinationName} · {money(row.amount.toString())} · {t('hotelTotal')}</p>
    <p className={styles.meta}>{row.profile.name} · {t('observedAt')}: {date(row.observedAt)}</p>
    {row.expiresAt && row.expiresAt <= new Date() && <p className={styles.notice}>{t('priceExpired')}</p>}
    <div className={styles.cards}><section className={styles.card}><h2>{t('hotelConditions')}</h2><dl>
      <dt>{t('localHotelDates')}</dt><dd>{hotel.data.checkIn} – {hotel.data.checkOut}</dd>
      <dt>{t('stars')}</dt><dd>{hotel.data.stars ?? t('unknown')}★</dd>
      <dt>{t('minRating')}</dt><dd>{hotel.data.rating ?? t('unknown')}/{hotel.data.ratingScale} · {hotel.data.reviewCount === null ? t('unknown') : t('reviewCount', { count: hotel.data.reviewCount })}</dd>
      <dt>{t('rooms')}</dt><dd>{hotel.data.rooms.length}</dd>
      <dt>{t('party')}</dt><dd>{t('partyCounts', { adults: hotel.data.rooms.reduce((sum, room) => sum + room.adults, 0), children: hotel.data.rooms.reduce((sum, room) => sum + room.children.length, 0), infants: 0 })}</dd>
      <dt>{t('fare')}</dt><dd>{hotel.data.roomName ?? t('unknown')} · {hotel.data.seller}</dd>
      <dt>{t('refundable')}</dt><dd>{yesNo(hotel.data.refundable)}</dd>
      <dt>{t('breakfast')}</dt><dd>{yesNo(hotel.data.breakfast)}</dd>
      <dt>{t('taxesIncluded')}</dt><dd>{t('yes')}</dd>
    </dl>{url && <a className={styles.button} href={url} target="_blank" rel="noopener noreferrer">{t('openHotelSource')}</a>}</section>
    <section className={styles.card}><h2>{t('hotelScore')}</h2><p>{evaluation.success && evaluation.data.score !== null ? t('scoreValue', { score: evaluation.data.score }) : t('scoreUnavailable')}</p>
      {evaluation.success && <><p>{t('confidence')}: {t(evaluation.data.confidence)}</p>{evaluation.data.evidence && <><p>{t('observedBaseline')}: {money(evaluation.data.evidence.median)}</p><p>{t('historyDays', { days: evaluation.data.evidence.samples })}</p></>}
        {evaluation.data.eligibility.length > 0 && <ul>{evaluation.data.eligibility.map(reason => <li key={reason}>{t.has('eligibilityReasons.' + reason) ? t('eligibilityReasons.' + reason) : t('requirementsUnconfirmed')}</li>)}</ul>}</>}
    </section></div>
    <section><h2>{t('verificationEvidence')}</h2><ul>{row.evidence.map(evidence => <li key={evidence.id}>{evidence.source} · {money(evidence.amount.toString(), evidence.currency)} · {date(evidence.verifiedAt)} · {t(evidence.direct ? 'directEvidence' : 'aggregatorEvidence')}</li>)}</ul></section>
    <section><h2>{t('history')}</h2><ObservationChart rows={history} currency={row.currency} /><div className={styles.scroll}><table className={styles.table}><thead><tr><th>{t('observedAt')}</th><th>{t('hotelTotal')}</th></tr></thead><tbody>{history.map(sample => <tr key={sample.id}><td>{date(sample.observedAt)}</td><td>{money(sample.amount.toString(), sample.currency)}</td></tr>)}</tbody></table></div></section>
  </>;
}
