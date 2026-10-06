import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { getCurrentUser } from '@/lib/user-auth';
import { TravellerOperations } from './operations';
import { TravellerMetrics } from './metrics';
import { TravellerHealth } from './health';
import { TravelRecovery } from '@/components/travel/TravelRecovery';
export default async function OperationsPage() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) notFound();
  const messages = await getMessages();
  return <><TravellerOperations /><TravellerHealth />
    <NextIntlClientProvider messages={{ AdminTravel: messages.AdminTravel ?? {} }}><TravelRecovery /></NextIntlClientProvider>
    <TravellerMetrics /></>;
}
