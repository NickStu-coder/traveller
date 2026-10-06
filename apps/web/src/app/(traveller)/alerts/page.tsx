import { getFormatter, getTranslations } from 'next-intl/server';
import styles from '../traveller.module.css';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/user-auth';
import { prisma } from '@/lib/prisma';
export default async function Alerts() {
  const user = await getCurrentUser();
  if (!user) return null;
  const [t, format, rows] = await Promise.all([getTranslations('Traveller'), getFormatter(), prisma.travellerAlert.findMany({ where: { profile: { userId: user.id } }, orderBy: { createdAt: 'desc' }, take: 50,
    include: { profile: { select: { name: true } }, observation: { select: { kind: true } }, delivery: { select: { pending: true, deliveredIds: true, lastError: true, nextAttemptAt: true } } } })]);
  return <><h1 className={styles.title}>{t('alerts')}</h1>{!rows.length && <p>{t('noAlerts')}</p>}<div className={styles.cards}>{rows.map(row => <article className={styles.card} key={row.id}>
    <h2>{row.profile.name} · {t('scoreValue', { score: row.score })}</h2><p>{format.number(Number(row.amount), { style: 'currency', currency: row.currency })} · {t('partyTotal')}</p>
    <p>{t('confidence')}: {t(row.confidence)}</p><p className={styles.meta}>{format.dateTime(row.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}</p>
    <p>{!row.delivery ? t('inAppOnly') : row.delivery.pending ? t('deliveryPending') : row.delivery.deliveredIds.length ? t('deliveryAccepted') : t('deliveryCancelled')}</p>
    {row.delivery && <p className={styles.meta}>{t('acceptedChannels', { count: row.delivery.deliveredIds.length })}</p>}
    <Link className={styles.button} href={(row.observation.kind === 'trip' ? '/trips/' : '/discover/') + row.observationId}>{t('viewEvidence')}</Link>
  </article>)}</div></>;
}
