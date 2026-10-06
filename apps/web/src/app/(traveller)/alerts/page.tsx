import { getTranslations } from 'next-intl/server';
import styles from '../traveller.module.css';
export default async function Alerts() {
  const t = await getTranslations('Traveller');
  return <><h1 className={styles.title}>{t('alerts')}</h1><p>{t('noAlerts')}</p></>;
}
