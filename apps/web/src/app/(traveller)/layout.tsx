import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/user-auth';
import { TravellerLanguage } from './language';
import { TravellerNavigation } from './navigation/nav';
import styles from './traveller.module.css';

export const dynamic = 'force-dynamic';
export default async function TravellerLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/access?next=%2Fdashboard');
  return <div className={styles.shell}>
    <header className={styles.header}><Link className={styles.brand} href="/dashboard">Traveller</Link><span>{user.displayName ?? user.username}</span><TravellerLanguage /></header>
    <TravellerNavigation isAdmin={user.isAdmin} />
    <main className={styles.main}>{children}</main>
  </div>;
}
