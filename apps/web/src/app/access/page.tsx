import { AccessScreen } from './AccessScreen';
import { InvitationScreen } from './InvitationScreen';
import { sanitizeNext } from '@/lib/safe-next';
import { sharedAccessStore } from '@/lib/sidedoor/access/service';

export const dynamic = 'force-dynamic';

export default async function AccessPage({ searchParams }: { searchParams: Promise<{ next?: string; mode?: string }> }) {
  const params = await searchParams;
  const next = sanitizeNext(params.next);
  const hosted = process.env.SELF_HOSTED !== 'true';
  const policy = await sharedAccessStore.admissionPolicy();
  const individual = policy.mode === 'individual';
  if ((hosted || individual) && params.mode === 'invite') return <InvitationScreen next={next ?? '/'} />;
  const mode = individual && !policy.hasOwner ? 'claim' : hosted || individual ? (params.mode === 'recover' ? 'recover' : 'login') : 'household';
  const needsLocalSetup = !hosted && !individual && !policy.hasOwner;
  return <AccessScreen next={next ?? (individual ? '/discover' : null)} mode={mode} hosted={hosted || individual} individual={individual} needsLocalSetup={needsLocalSetup} />;
}
