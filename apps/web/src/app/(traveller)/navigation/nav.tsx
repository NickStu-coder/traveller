'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import styles from '../traveller.module.css';

const links = [['dashboard', '/dashboard'], ['discover', '/discover'], ['flights', '/flights'], ['hotels', '/hotels'], ['trips', '/trips'], ['surprise', '/surprise'], ['profiles', '/watch-profiles'], ['alerts', '/alerts'], ['history', '/history'], ['settings', '/preferences']] as const;
const adminLinks = [['operations', '/operations'], ['admin', '/admin']] as const;

export function TravellerNavigation({ isAdmin }: { isAdmin: boolean }) {
  const t = useTranslations('Traveller');
  const pathname = usePathname();
  return <nav className={styles.nav} aria-label="Traveller">{[...links, ...(isAdmin ? adminLinks : [])].map(([key, href]) => <Link key={key} href={href} aria-current={pathname === href || pathname.startsWith(href + '/') ? 'page' : undefined}>{t(key)}</Link>)}</nav>;
}
