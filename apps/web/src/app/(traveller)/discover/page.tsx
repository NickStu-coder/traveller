import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import styles from '../traveller.module.css';
import { getCurrentUser } from '@/lib/user-auth';
import { FlightCandidateCards } from '../candidates/cards';
import { TripCards } from '../candidates/trips';
import { HotelCards } from '../candidates/hotels';
import { CandidateFilterForm } from '../candidates/filters';
import { parseCandidateFilters, type SearchParams } from '@/lib/traveller/views/filters';

export default async function Discover({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const t = await getTranslations('Traveller'), user = await getCurrentUser();
  if (!user) return null;
  const params = await searchParams, kind = params.kind === 'hotel' || params.kind === 'trip' ? params.kind : 'flight';
  const parsed = parseCandidateFilters(params), filters = parsed.success ? parsed.data : {};
  return <><h1 className={styles.title}>{t('discover')}</h1><p className={styles.notice}>{t('discoveryNotice')}</p>
    <nav className={styles.actions} aria-label={t('discover')}>{(['flight', 'hotel', 'trip'] as const).map(value => <Link className={styles.button} aria-current={kind === value ? 'page' : undefined} href={'/discover?kind=' + value} key={value}>{t(value === 'flight' ? 'flights' : value === 'hotel' ? 'hotels' : 'trips')}</Link>)}</nav>
    <CandidateFilterForm filters={filters} kind={kind} />{!parsed.success && <p className={styles.error}>{t('invalidFilters')}</p>}
    {kind === 'trip' ? <TripCards userId={user.id} filters={filters} /> : kind === 'hotel' ? <HotelCards userId={user.id} filters={filters} /> : <FlightCandidateCards userId={user.id} filters={filters} />}
    <Link className={styles.button} href="/watch-profiles">{t('createProfile')}</Link></>;
}
