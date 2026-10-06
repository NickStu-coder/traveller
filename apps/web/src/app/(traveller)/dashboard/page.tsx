import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { getCurrentUser } from '@/lib/user-auth';
import { prisma } from '@/lib/prisma';
import styles from '../traveller.module.css';
import { FlightCandidateCards } from '../candidates/cards';
import { TripCards } from '../candidates/trips';
export default async function Dashboard() {
  const t = await getTranslations('Traveller');
  const user = await getCurrentUser();
  if (!user) return null;
  const profiles = await prisma.watchProfile.findMany({ where: { userId: user.id, archivedAt: null }, orderBy: { createdAt: 'desc' }, take: 50 });
  return <><h1 className={styles.title}>{t('welcome')}</h1><p className={styles.intro}>{t('intro')}</p><Link className={styles.button} href="/watch-profiles">{t('createProfile')}</Link>
    <div className={styles.cards}>{profiles.map(profile => <article className={styles.card} key={profile.id}><h2>{profile.name}</h2><p>{profile.active ? t('active') : t('paused')}</p><Link href="/watch-profiles">{t('edit')}</Link></article>)}</div>
    {!profiles.length && <p>{t('noProfiles')}</p>}<h2>{t('trips')}</h2><TripCards userId={user.id} limit={6} /><h2>{t('flights')}</h2><p className={styles.notice}>{t('discoveryNotice')}</p><FlightCandidateCards userId={user.id} limit={6} /></>;
}
