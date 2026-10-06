import { getTranslations, getFormatter } from 'next-intl/server';
import { getCurrentUser } from '@/lib/user-auth';
import { prisma } from '@/lib/prisma';
import styles from '../traveller.module.css';
export default async function History() {
  const user = await getCurrentUser();
  if (!user) return null;
  const [t, format] = await Promise.all([getTranslations('Traveller'), getFormatter()]);
  const observations = await prisma.travellerObservation.findMany({ where: { profile: { userId: user.id } }, orderBy: { observedAt: 'desc' }, take: 100, include: { profile: { select: { name: true } } } });
  return <><h1 className={styles.title}>{t('history')}</h1>{observations.length ? <div className={styles.scroll}><table className={styles.table}><thead><tr><th>{t('name')}</th><th>{t('source')}</th><th>{t('tripPrice')}</th><th>{t('observedAt')}</th></tr></thead><tbody>{observations.map(observation => <tr key={observation.id}><td>{observation.profile.name}</td><td>{observation.source} · {t(observation.provenance)}</td><td>{format.number(Number(observation.amount), { style: 'currency', currency: observation.currency })}</td><td>{format.dateTime(observation.observedAt, { dateStyle: 'medium', timeStyle: 'short' })}</td></tr>)}</tbody></table></div> : <p>{t('noHistory')}</p>}</>;
}
