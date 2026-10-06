import { z } from 'zod';
import type { Prisma } from '@/generated/prisma/client';
import { serializable } from '../../sidedoor/access/transaction';
import { schedulerSchema } from './policy';
import { IMPLEMENTED_SOURCES } from './store';
import { SOURCE_CATALOG } from '../sources/catalog';
import { engineSchema } from '../engine/policy';

export const operationalUpdate = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('scheduler'), revision: z.number().int().nonnegative(), settings: schedulerSchema }).strict(),
  z.object({ kind: z.literal('engine'), revision: z.number().int().nonnegative(), settings: engineSchema }).strict(),
  z.object({ kind: z.literal('source'), source: z.string().max(100), revision: z.number().int().nonnegative(), enabled: z.boolean(), budgetPerDay: z.number().int().min(1).max(200) }).strict(),
]);
export class OperationalConflict extends Error {}
export async function updateTravellerOperations(actorId: string, input: z.output<typeof operationalUpdate>) {
  const key = input.kind === 'source' ? `source:${input.source}` : input.kind;
  if (input.kind === 'source' && (!SOURCE_CATALOG.some(source => source.id === input.source) || input.enabled && !IMPLEMENTED_SOURCES.some(source => source === input.source)))
    throw new OperationalConflict('This source does not have an available adapter');
  return serializable(async tx => {
    const config = await tx.travellerConfig.findUnique({ where: { id: key } });
    if ((config?.revision ?? 0) !== input.revision) throw new OperationalConflict('Configuration changed; reload before saving');
    const settings = (input.kind === 'source' ? { enabled: input.enabled, budgetPerDay: input.budgetPerDay } : input.settings) as Prisma.InputJsonValue;
    const revision = (config?.revision ?? 0) + 1;
    const saved = await tx.travellerConfig.upsert({ where: { id: key }, create: { id: key, settings, revision }, update: { settings, revision } });
    await tx.travellerConfigRevision.create({ data: { configId: key, revision, actorId, settings } });
    if (input.kind === 'source') {
      await tx.travellerSourceState.update({ where: { source: input.source }, data: { enabled: input.enabled, budgetPerDay: input.budgetPerDay,
        status: input.enabled ? 'unconfigured' : 'disabled', failures: 0, lastError: null,
        // Enabling does not reset the day's usage or erase a waiting request slot.
      } });
      if (!input.enabled) await tx.travellerJob.updateMany({ where: { source: input.source, state: { in: ['queued', 'running'] } }, data: { state: 'cancelled', completedAt: new Date(), leaseToken: null, leaseUntil: null } });
    }
    return saved;
  });
}
