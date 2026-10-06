import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getCurrentUser } from '@/lib/user-auth';
import { TravellerLanguage } from './language';
import styles from './traveller.module.css';

export const dynamic = 'force-dynamic';
export default async function TravellerLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/access?next=%2Fdashboard');
  const t = await getTranslations('Traveller');
  const links = [['dashboard', '/dashboard'], ['discover', '/discover'], ['flights', '/flights'], ['hotels', '/hotels'], ['trips', '/trips'], ['profiles', '/watch-profiles'], ['alerts', '/alerts'], ['history', '/history'], ['settings', '/preferences']] as const;
  return <div className={styles.shell}>
    <header className={styles.header}><Link className={styles.brand} href="/dashboard">Traveller</Link><span>{user.displayName ?? user.username}</span><TravellerLanguage /></header>
    <nav className={styles.nav} aria-label="Traveller">{links.map(([key, href]) => <Link key={key} href={href}>{t(key)}</Link>)}{user.isAdmin && <><Link href="/operations">{t('operations')}</Link><Link href="/admin">{t('admin')}</Link></>}</nav>
    <main className={styles.main}>{children}</main>
  </div>;
}
