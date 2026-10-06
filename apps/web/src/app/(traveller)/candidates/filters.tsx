import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { CandidateFilters } from '@/lib/traveller/views/candidates';
import styles from '../traveller.module.css';
import { DESTINATION_REGIONS, regionMessageKey } from '@/lib/traveller/views/regions';

export async function CandidateFilterForm({ filters, route = '/discover', kind = 'flight' }: { filters: CandidateFilters; route?: string; kind?: 'flight' | 'hotel' | 'trip' }) {
  const t = await getTranslations('Traveller');
  return <form className={styles.form} method="get"><input type="hidden" name="kind" value={kind} /><fieldset><legend>{t('filters')}</legend><div className={styles.grid}>
    {kind !== 'hotel' && <label className={styles.field}>{t('origin')}<input name="origin" maxLength={3} defaultValue={filters.origin} placeholder="LJU" /></label>}
    <label className={styles.field}>{t('destination')}<input name="destination" maxLength={100} defaultValue={filters.destination} /></label>
    <label className={styles.field}>{t('region')}<select name="region" defaultValue={filters.region ?? ''}><option value="">{t('all')}</option>{DESTINATION_REGIONS.map(region => <option value={region} key={region}>{t('destinationRegions.' + regionMessageKey(region))}</option>)}</select></label>
    <label className={styles.field}>{t('from')}<input name="from" type="date" defaultValue={filters.from} /></label>
    <label className={styles.field}>{t('to')}<input name="to" type="date" defaultValue={filters.to} /></label>
    {kind !== 'hotel' && <label className={styles.field}>{t('cabin')}<select name="cabin" defaultValue={filters.cabin ?? ''}><option value="">{t('all')}</option>{(['economy', 'premium_economy', 'business', 'first'] as const).map(cabin => <option key={cabin} value={cabin}>{t(cabin)}</option>)}</select></label>}
    <label className={styles.field}>{t('currency')}<select name="currency" defaultValue={filters.currency ?? ''}><option value="">{t('all')}</option>{['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD'].map(code => <option key={code}>{code}</option>)}</select></label>
    <label className={styles.field}>{t(kind === 'trip' ? 'tripPrice' : kind === 'hotel' ? 'hotelTotal' : 'maxFlightPrice')}<input name="maxPrice" type="number" min="0.01" max="1000000" step="0.01" defaultValue={filters.maxPrice} /></label>
    <label className={styles.field}>{t('minScore')}<input name="minScore" type="number" min="0" max="100" defaultValue={filters.minScore} /></label>
    <label className={styles.field}>{t('minNights')}<input name="minNights" type="number" min="1" max="90" defaultValue={filters.minNights} /></label>
    <label className={styles.field}>{t('maxNights')}<input name="maxNights" type="number" min="1" max="90" defaultValue={filters.maxNights} /></label>
    {kind !== 'flight' && <>
      <label className={styles.field}>{t('stars')}<input name="minStars" type="number" min="0" max="5" defaultValue={filters.minStars} /></label>
      <label className={styles.field}>{t('rating')}<input name="minRating" type="number" min="0" max="10" step="0.1" defaultValue={filters.minRating} /></label>
      <label className={styles.field}>{t('reviews')}<input name="minReviews" type="number" min="0" max="10000000" defaultValue={filters.minReviews} /></label>
    </>}
  </div>{filters.region && <p className={styles.meta}>{t('regionFilterNotice')}</p>}<div className={styles.actions}><button className={styles.button}>{t('applyFilters')}</button><Link className={styles.button} href={route + '?kind=' + kind}>{t('clearFilters')}</Link></div></fieldset></form>;
}
