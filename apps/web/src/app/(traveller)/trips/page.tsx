import { getTranslations } from 'next-intl/server';
import styles from '../traveller.module.css';
export default async function Trips() {
  const t = await getTranslations('Traveller');
  return <><h1 className={styles.title}>{t('trips')}</h1><p>{t('noDeals')}</p><p className={styles.notice}>{t('sourcesUnavailable')}</p></>;
}
