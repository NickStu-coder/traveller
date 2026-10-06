import type { Prisma } from '@/generated/prisma/client';

/** Acquire before resource/domain rows. Never hold during browser or network work. */
export async function lockTravelAdmission(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(761932105)`;
}
