'use client';
import { useLocale, useTranslations } from 'next-intl';
import { LOCALE_COOKIE, LOCALES, LOCALE_LABELS } from '@/i18n/locales';
import { useState } from 'react';
export function TravellerLanguage() {
  const locale = useLocale();
  const t = useTranslations('Traveller');
  const [busy, setBusy] = useState(false), [failed, setFailed] = useState(false);
  async function save(value: string) {
    setBusy(true); setFailed(false);
    try {
      const response = await fetch('/api/account/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ locale: value }) });
      if (!response.ok) throw new Error('Language could not be saved');
      document.cookie = `${LOCALE_COOKIE}=${value};path=/;max-age=31536000;samesite=lax${location.protocol === 'https:' ? ';secure' : ''}`;
      location.reload();
    } catch { setFailed(true); setBusy(false); }
  }
  return <div><select aria-label="Language / Jezik" value={locale} disabled={busy} onChange={event => void save(event.target.value)}>{LOCALES.map(code => <option key={code} value={code}>{LOCALE_LABELS[code]}</option>)}</select>{failed && <p role="alert">{t('saveLanguageError')}</p>}</div>;
}
