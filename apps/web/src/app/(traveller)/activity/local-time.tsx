'use client';
import { useEffect, useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';

export function useBrowserTimeZone() {
  const [timeZone, setTimeZone] = useState('UTC');
  useEffect(() => { setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone); }, []);
  return timeZone;
}

export function LocalTime({ value }: { value: string | null }) {
  const format = useFormatter();
  const t = useTranslations('Traveller');
  const timeZone = useBrowserTimeZone();
  if (!value) return <>{t('unavailable')}</>;
  return <time dateTime={value} title={timeZone}>{format.dateTime(new Date(value), { dateStyle: 'medium', timeStyle: 'short', timeZone })}</time>;
}
