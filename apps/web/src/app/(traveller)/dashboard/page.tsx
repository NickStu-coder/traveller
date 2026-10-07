import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { getCurrentUser } from '@/lib/user-auth';
import { prisma } from '@/lib/prisma';
import styles from '../traveller.module.css';
import { FlightCandidateCards } from '../candidates/cards';
import { TripCards } from '../candidates/trips';
import { LocalTime } from '../activity/local-time';
import { ActivityRefresh } from '../activity/refresh';
export default async function Dashboard() {
  const t = await getTranslations('Traveller');
  const user = await getCurrentUser();
  if (!user) return null;
  const profiles = await prisma.watchProfile.findMany({ where: { userId: user.id, archivedAt: null }, orderBy: { createdAt: 'desc' }, take: 50,
    include: { _count: { select: { observations: true, jobs: { where: { startedAt: { not: null } } } } }, jobs: { where: { kind: 'discovery', startedAt: { not: null } }, orderBy: { startedAt: 'desc' }, take: 1, select: { state: true, startedAt: true, error: true } } } });
  return <><h1 className={styles.title}>{t('welcome')}</h1><p className={styles.intro}>{t('intro')}</p><div className={styles.actions}><Link className={styles.button} href="/watch-profiles">{t('createProfile')}</Link><ActivityRefresh /></div>
    <h2>{t('monitoringActivity')}</h2><div className={styles.cards}>{profiles.map(profile => <article className={styles.card} key={profile.id}><h2>{profile.name}</h2><p>{profile.active ? t('active') : t('paused')}</p>
      <dl className={styles.facts}><div><dt>{t('checksRecorded')}</dt><dd>{profile._count.jobs}</dd></div><div><dt>{t('observations')}</dt><dd>{profile._count.observations}</dd></div>
        <div><dt>{t('lastDiscovery')}</dt><dd><LocalTime value={profile.jobs[0]?.startedAt?.toISOString() ?? null} /></dd></div>
        <div><dt>{t('nextDiscovery')}</dt><dd>{profile.active ? <LocalTime value={profile.nextCheckAt.toISOString()} /> : t('paused')}</dd></div>
      </dl>{profile.jobs[0] && <p>{t('latestCheckState')}: {t('job_' + profile.jobs[0].state)}</p>}{profile.jobs[0]?.error && <p className={styles.error}>{profile.jobs[0].error}</p>}
      <div className={styles.actions}><Link className={styles.button} href="/watch-profiles">{t('edit')}</Link>{user.isAdmin && <Link className={styles.button} href="/operations">{t('jobs')}</Link>}</div></article>)}</div>
    {!profiles.length && <p>{t('noProfiles')}</p>}<h2>{t('trips')}</h2><TripCards userId={user.id} limit={6} /><h2>{t('flights')}</h2><p className={styles.notice}>{t('discoveryNotice')}</p><FlightCandidateCards userId={user.id} limit={6} /></>;
}
