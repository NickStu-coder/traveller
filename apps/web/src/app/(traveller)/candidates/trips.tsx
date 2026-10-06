import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { latestTrips, surpriseTrips } from '@/lib/traveller/views/trips';
import styles from '../traveller.module.css';
import type { CandidateFilters } from '@/lib/traveller/views/candidates';

export async function TripCards({ userId, surprise = false, limit = 50, filters = {} }: { userId: string; surprise?: boolean; limit?: number; filters?: CandidateFilters }) {
  const [available, t, format] = await Promise.all([latestTrips(userId, filters), getTranslations('Traveller'), getFormatter()]);
  const rows = surprise ? surpriseTrips(available, 70, limit) : available.slice(0, limit);
  if (!rows.length) return <p>{t(surprise ? 'noSurprises' : 'noTrips')}</p>;
  return <div className={styles.cards}>{rows.map(row => <article className={styles.card} key={row.id}>
    <h2>{row.details.origin} · {row.details.destinationName}</h2>
    <p>{format.number(Number(row.amount), { style: 'currency', currency: row.currency })} · {t('wholeTripTotal')}</p>
    <p>{t(row.details.cabin)} · {row.details.departure} – {row.details.returnDate}</p>
    <p>{row.hotel.hotelName} · {row.hotel.stars ?? t('unknown')}★ · {row.hotel.rating ?? t('unknown')}/{row.hotel.ratingScale} · {row.hotel.reviewCount === null ? t('unknown') : t('reviewCount', { count: row.hotel.reviewCount })}</p>
    <p>{row.details.checkIn} – {row.details.checkOut} · {t('stayNights', { nights: row.details.nights })}</p>
    <p>{row.evaluation?.score !== null && row.evaluation?.score !== undefined ? t('scoreValue', { score: row.evaluation.score }) : t('scoreUnavailable')}</p>
    <p className={styles.meta}>{row.profile.name} · {t('observedAt')}: {format.dateTime(row.observedAt, { dateStyle: 'medium', timeStyle: 'short' })}</p>
    <Link className={styles.button} href={'/trips/' + row.id}>{t('viewEvidence')}</Link>
  </article>)}</div>;
}
