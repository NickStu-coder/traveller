import { getTranslations } from 'next-intl/server';
import styles from '../traveller.module.css';
import { getCurrentUser } from '@/lib/user-auth';
import { TripCards } from '../candidates/trips';
import { CandidateFilterForm } from '../candidates/filters';
import { parseCandidateFilters, type SearchParams } from '@/lib/traveller/views/filters';
export default async function Trips({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const t = await getTranslations('Traveller');
  const user = await getCurrentUser();
  if (!user) return null;
  const parsed = parseCandidateFilters(await searchParams), filters = parsed.success ? parsed.data : {};
  return <><h1 className={styles.title}>{t('trips')}</h1><p className={styles.notice}>{t('tripConfidenceNotice')}</p><CandidateFilterForm filters={filters} route="/trips" kind="trip" />{!parsed.success && <p className={styles.error}>{t('invalidFilters')}</p>}<TripCards userId={user.id} filters={filters} /></>;
}
