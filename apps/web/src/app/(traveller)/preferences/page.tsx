import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Channels } from './channels';
import styles from '../traveller.module.css';
export default async function Preferences() {
  const t = await getTranslations('Traveller');
  return <><h1 className={styles.title}>{t('settings')}</h1><div className={styles.actions}><Link className={styles.button} href="/account/settings">{t('appearance')}</Link><Link className={styles.button} href="/access/security">{t('security')}</Link></div><Channels /></>;
}
