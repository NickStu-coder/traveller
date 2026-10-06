'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ProviderAvailability } from '@/lib/scraper/ai-registry';
import styles from '../traveller.module.css';
type Health = { database: string; redis: string };
export function TravellerHealth() {
  const t = useTranslations('Traveller');
  const [health, setHealth] = useState<Health | null>(null), [provider, setProvider] = useState<ProviderAvailability | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/health', { cache: 'no-store', signal: controller.signal }).then(async response => {
      const data = await response.json() as Health;
      if (!controller.signal.aborted) setHealth(data);
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    void fetch('/api/admin/providers', { cache: 'no-store', signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Provider readiness unavailable');
      const data = await response.json() as { data: Record<string, { status: ProviderAvailability }> };
      if (!controller.signal.aborted) setProvider(data.data.openai?.status ?? null);
    }).catch(() => { /* Unknown remains explicit; deterministic sources continue. */ });
    return () => controller.abort();
  }, []);
  const status = (value?: string) => t(value === 'connected' ? 'healthConnected' : value === 'disabled' ? 'disabled' : value === 'error' ? 'healthError' : 'unknown');
  return <section><h2>{t('runtimeHealth')}</h2>{failed && <p className={styles.error}>{t('healthError')}</p>}<div className={styles.cards}>
    <article className={styles.card}><h3>PostgreSQL</h3><p>{status(health?.database)}</p></article>
    <article className={styles.card}><h3>Redis</h3><p>{status(health?.redis)}</p></article>
    <article className={styles.card}><h3>OpenAI</h3><p>{provider ? t('provider_' + provider) : t('unknown')}</p><p className={styles.meta}>{t('providerReadinessNotice')}</p></article>
  </div></section>;
}
