import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/user-auth';
import { TravellerOperations } from './operations';
export default async function OperationsPage() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) notFound();
  return <TravellerOperations />;
}
