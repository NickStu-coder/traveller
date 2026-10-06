import { getTranslations } from 'next-intl/server';
import { getCurrentUser } from '@/lib/user-auth';
import { TripCards } from '../candidates/trips';
import styles from '../traveller.module.css';

export default async function Surprise() {
  const user = await getCurrentUser();
  if (!user) return null;
  const t = await getTranslations('Traveller');
  return <><h1 className={styles.title}>{t('surprise')}</h1><p>{t('surpriseExplanation')}</p><TripCards userId={user.id} surprise limit={6} /></>;
}
