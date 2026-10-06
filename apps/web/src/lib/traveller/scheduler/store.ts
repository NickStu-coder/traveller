import { createHash } from 'node:crypto';
import { prisma } from '../../prisma';
import type { Prisma } from '@/generated/prisma/client';
import { serializable } from '../../sidedoor/access/transaction';
import { profileSchema } from '../profiles';
import { SOURCE_CATALOG } from '../sources/catalog';
import { SourceError } from '../sources/types';
import { DEFAULT_SCHEDULER, discoveryRequest, nextCheck, schedulerSchema, LANE_PRIORITY } from './policy';

export const IMPLEMENTED_SOURCES = ['google_explore', 'google_flights', 'google_hotels', 'booking', 'airline_direct'] as const;
export async function schedulerSettings() {
  const stored = await prisma.travellerConfig.findUnique({ where: { id: 'scheduler' } });
  return stored ? schedulerSchema.parse(stored.settings) : DEFAULT_SCHEDULER;
}
export async function initializeTravellerSources(): Promise<void> {
  for (const source of SOURCE_CATALOG) {
    const implemented = IMPLEMENTED_SOURCES.some(id => id === source.id);
    const existing = await prisma.travellerSourceState.findUnique({ where: { source: source.id } });
    const newlyImplemented = implemented && existing?.status === 'unconfigured' && Array.isArray(existing.capabilities) && existing.capabilities.length === 0;
    await prisma.travellerSourceState.upsert({ where: { source: source.id }, update: { capabilities: implemented ? [...source.capabilities] : [], ...(newlyImplemented ? { enabled: source.defaultEnabled } : {}) }, create: {
      source: source.id, enabled: implemented && source.defaultEnabled, status: 'unconfigured',
      capabilities: implemented ? [...source.capabilities] : [], budgetPerDay: 100,
    } });
  }
}

/** Serializable profile scheduling and a unique key prevent duplicate jobs across replicas. */
export async function scheduleTravellerDiscovery(now = new Date()): Promise<number> {
  const settings = await schedulerSettings();
  const source = await prisma.travellerSourceState.findUnique({ where: { source: 'google_explore' } });
  if (!source?.enabled) return 0;
  const due = await prisma.watchProfile.findMany({ where: { active: true, archivedAt: null, nextCheckAt: { lte: now }, user: { disabledAt: null } }, orderBy: { nextCheckAt: 'asc' }, take: 20 });
  let queued = 0;
  for (const profile of due) {
    const constraints = profileSchema.safeParse(profile.constraints);
    if (!constraints.success) continue;
    const request = discoveryRequest(constraints.data, profile.id, now);
    const created = await serializable(async tx => {
      const updated = await tx.watchProfile.updateMany({ where: { id: profile.id, revision: profile.revision, active: true, archivedAt: null, nextCheckAt: { lte: now }, user: { disabledAt: null } }, data: { nextCheckAt: nextCheck(profile.id, request ? 'DISCOVERY' : 'COLD', source.failures, now, settings) } });
      if (!updated.count || !request || await tx.travellerJob.count({ where: { profileId: profile.id, kind: 'discovery', state: { in: ['queued', 'running'] } } })) return false;
      const slot = Math.floor(now.getTime() / (settings.discoveryMinutes * 60000));
      const dedupKey = createHash('sha256').update(JSON.stringify([profile.id, profile.revision, source.source, request, slot])).digest('hex');
      const existing = await tx.travellerJob.findUnique({ where: { dedupKey } });
      if (existing) return false;
      await tx.travellerJob.create({ data: { profileId: profile.id, profileRevision: profile.revision, kind: 'discovery', source: source.source, dedupKey,
        lane: 'DISCOVERY', priority: LANE_PRIORITY.DISCOVERY, runAt: now, request: request as unknown as Prisma.InputJsonValue } });
      return true;
    });
    if (created) queued++;
  }
  return queued;
}

/** A request reservation is atomic, persisted and shared by every worker. */
export async function reserveSourceRequest(tx: Prisma.TransactionClient, source: string, spacingSeconds: number, units = 1): Promise<void> {
  if (!Number.isInteger(units) || units < 1 || units > 10) throw new Error('Invalid source request reservation');
  const state = await tx.travellerSourceState.findUnique({ where: { source } });
  const now = new Date(), day = now.toISOString().slice(0, 10);
  if (!state?.enabled) throw new SourceError('unconfigured', 'Source is disabled');
  if (state.nextAllowedAt > now) throw new SourceError('rate_limited', 'Source is waiting for its next request slot');
  const used = state.budgetDate === day ? state.usedToday : 0;
  if (used + units > state.budgetPerDay) throw new SourceError('rate_limited', 'Source daily request budget exhausted');
  const updated = await tx.travellerSourceState.updateMany({ where: { source, enabled: true, budgetDate: state.budgetDate, usedToday: state.usedToday, nextAllowedAt: state.nextAllowedAt }, data: { budgetDate: day, usedToday: used + units, nextAllowedAt: new Date(now.getTime() + spacingSeconds * 1000) } });
  if (!updated.count) throw new SourceError('rate_limited', 'Source request slot was claimed by another worker');
}
