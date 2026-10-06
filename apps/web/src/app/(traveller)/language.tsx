'use client';
import { useLocale } from 'next-intl';
import { LOCALE_COOKIE, LOCALES, LOCALE_LABELS } from '@/i18n/locales';
export function TravellerLanguage() {
  const locale = useLocale();
  return <select aria-label="Language / Jezik" value={locale} onChange={event => {
    document.cookie = `${LOCALE_COOKIE}=${event.target.value};path=/;max-age=31536000;samesite=lax${location.protocol === 'https:' ? ';secure' : ''}`;
    location.reload();
  }}>{LOCALES.map(code => <option key={code} value={code}>{LOCALE_LABELS[code]}</option>)}</select>;
}
