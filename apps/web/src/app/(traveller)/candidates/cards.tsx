import { getFormatter, getTranslations } from 'next-intl/server';
import { latestFlightCandidates } from '@/lib/traveller/views/candidates';
import styles from '../traveller.module.css';

export async function FlightCandidateCards({ userId, limit = 50 }: { userId: string; limit?: number }) {
  const [rows, t, format] = await Promise.all([latestFlightCandidates(userId), getTranslations('Traveller'), getFormatter()]);
  if (!rows.length) return <p>{t('noCandidates')}</p>;
  return <div className={styles.cards}>{rows.slice(0, limit).map(row => <article className={styles.card} key={row.id}>
    <h2>{row.flight.origin} · {row.flight.destinationName}</h2><p>{format.number(Number(row.amount), { style: 'currency', currency: row.currency })} · {t('partyTotal')}</p>
    <p>{t(row.flight.cabin)} · {row.flight.departure} – {row.flight.returnDate}</p><p className={styles.meta}>{row.profile.name} · {row.source} · {t(row.provenance)}</p>
    <p className={styles.meta}>{t('observedAt')}: {format.dateTime(row.observedAt, { dateStyle: 'medium', timeStyle: 'short' })}</p>
    <p>{t('candidateUnverified')}</p><a className={styles.button} href={row.bookingUrl!} target="_blank" rel="noopener noreferrer">{t('openSource')}</a>
  </article>)}</div>;
}
