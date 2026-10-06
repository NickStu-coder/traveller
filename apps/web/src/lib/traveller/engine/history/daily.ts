import type { Prisma } from '@/generated/prisma/client';
import { priceEvidence } from '../scoring';

/** Aggregate in PostgreSQL so frequent checks never crowd out independent days. */
export async function historicalPrice(tx: Prisma.TransactionClient, userId: string, comparisonKey: string, current: number, observedAt: Date) {
  const history = await tx.$queryRaw<{ amount: Prisma.Decimal; observedAt: Date }[]>`
    SELECT (percentile_cont(0.5) WITHIN GROUP (ORDER BY o.amount))::numeric AS amount,
           date_trunc('day', o."observedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS "observedAt"
    FROM "TravellerObservation" o JOIN "WatchProfile" p ON p.id = o."profileId"
    WHERE o."comparisonKey" = ${comparisonKey} AND p."userId" = ${userId}
      AND o."observedAt" < ${observedAt} AND o."observedAt" >= ${new Date(observedAt.getTime() - 365 * 86400000)}
    GROUP BY date_trunc('day', o."observedAt" AT TIME ZONE 'UTC')
    ORDER BY "observedAt" DESC LIMIT 366`;
  return priceEvidence(comparisonKey, current, history.map(sample => ({ key: comparisonKey, price: Number(sample.amount), observedAt: sample.observedAt })), observedAt);
}
