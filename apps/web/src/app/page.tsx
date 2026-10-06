import { redirect } from 'next/navigation';
import { FlightHomePage } from '@/components/FlightHome/FlightHome';
export const dynamic = 'force-dynamic';
export default async function HomePage() {
  if (process.env.TRAVELLER_AUTH_MODE === 'individual') redirect('/dashboard');
  return FlightHomePage();
}
