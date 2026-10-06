import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { latestHotels } from '@/lib/traveller/views/hotels';
import type { CandidateFilters } from '@/lib/traveller/views/candidates';
import styles from '../traveller.module.css';

export async function HotelCards({ userId, filters = {} }: { userId: string; filters?: CandidateFilters }) {
  const [rows, t, format] = await Promise.all([latestHotels(userId, filters), getTranslations('Traveller'), getFormatter()]);
  if (!rows.length) return <p>{t('noHotelCandidates')}</p>;
  return <div className={styles.cards}>{rows.map(row => <article className={styles.card} key={row.id}>
    <h2>{row.hotel.hotelName} · {row.hotel.destinationName}</h2>
    <p>{format.number(Number(row.amount), { style: 'currency', currency: row.currency })} · {t('hotelTotal')}</p>
    <p>{row.hotel.checkIn} – {row.hotel.checkOut} · {t('stayNights', { nights: (Date.parse(row.hotel.checkOut) - Date.parse(row.hotel.checkIn)) / 86400000 })}</p>
    <p>{row.hotel.stars ?? t('unknown')}★ · {row.hotel.rating ?? t('unknown')}/{row.hotel.ratingScale} · {row.hotel.reviewCount === null ? t('unknown') : t('reviewCount', { count: row.hotel.reviewCount })}</p>
    <p>{row.evaluation?.score !== null && row.evaluation?.score !== undefined ? t('scoreValue', { score: row.evaluation.score }) : t('scoreUnavailable')}</p>
    <p className={styles.meta}>{row.profile.name} · {row.hotel.seller} · {t('observedAt')}: {format.dateTime(row.observedAt, { dateStyle: 'medium', timeStyle: 'short' })}</p>
    <Link className={styles.button} href={'/stays/' + row.id}>{t('viewEvidence')}</Link>
  </article>)}</div>;
}
