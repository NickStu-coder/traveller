import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from './locales';
import { getCurrentUser } from '@/lib/user-auth';

const AREAS = ['common', 'components', 'pages', 'settings', 'admin', 'hotels', 'cars', 'traveller'] as const;

type Messages = Record<string, unknown>;

async function loadMessages(locale: Locale): Promise<Messages> {
  const areas = await Promise.all(
    AREAS.map(async (area) => (await import(`../../messages/${locale}/${area}.json`)).default),
  );
  return Object.assign({}, ...areas);
}

// Recursive merge so a locale missing a nested key falls back to the English
// string instead of rendering the raw key. A shallow spread would replace a
// whole namespace object when any key inside it drifts.
function deepMerge(fallback: Messages, override: Messages): Messages {
  const out: Messages = { ...fallback };
  for (const [key, value] of Object.entries(override)) {
    const base = out[key];
    out[key] =
      value && typeof value === 'object' && base && typeof base === 'object'
        ? deepMerge(base as Messages, value as Messages)
        : value;
  }
  return out;
}

export default getRequestConfig(async () => {
  const store = await cookies().catch(() => null);
  const cookieLocale = store?.get(LOCALE_COOKIE)?.value;
  const user = store && !isLocale(cookieLocale) && process.env.TRAVELLER_AUTH_MODE === 'individual' ? await getCurrentUser() : null;
  const locale = isLocale(cookieLocale) ? cookieLocale : isLocale(user?.locale) ? user.locale : DEFAULT_LOCALE;

  const fallback = await loadMessages(DEFAULT_LOCALE);
  const messages =
    locale === DEFAULT_LOCALE ? fallback : deepMerge(fallback, await loadMessages(locale));

  return { locale, messages };
});
