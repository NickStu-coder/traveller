'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import styles from '../traveller.module.css';

export function ActivityRefresh() {
  const router = useRouter();
  const t = useTranslations('Traveller');
  useEffect(() => {
    const timer = setInterval(() => { if (document.visibilityState === 'visible') router.refresh(); }, 60_000);
    return () => clearInterval(timer);
  }, [router]);
  return <button className={styles.button} onClick={() => router.refresh()}>{t('refreshActivity')}</button>;
}
