import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import styles from '../traveller.module.css';
import { getCurrentUser } from '@/lib/user-auth';
import { FlightCandidateCards } from '../candidates/cards';
export default async function Discover() {
  const t = await getTranslations('Traveller');
  const user = await getCurrentUser();
  if (!user) return null;
  return <><h1 className={styles.title}>{t('discover')}</h1><p className={styles.notice}>{t('discoveryNotice')}</p><FlightCandidateCards userId={user.id} /><Link className={styles.button} href="/watch-profiles">{t('createProfile')}</Link></>;
}
