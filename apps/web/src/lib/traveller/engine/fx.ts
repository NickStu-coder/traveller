import { Prisma } from '@/generated/prisma/client';
import { prisma } from '../../prisma';
import type { FxQuote } from './money';
import { z } from 'zod';

const ECB_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';
const rateSchema = z.string().max(100).regex(/^\d+(?:\.\d+)?$/).refine(value => new Prisma.Decimal(value).gt(0) && new Prisma.Decimal(value).isFinite());
const dataSchema = z.object({ date: z.iso.date(), fetchedAt: z.iso.datetime(), rates: z.record(z.string().regex(/^[A-Z]{3}$/), rateSchema) });
export type FxData = z.output<typeof dataSchema>;
/** This is a bounded reader for the ECB's fixed Cube feed, not a general XML parser. */
export function parseEcb(xml: string, now = new Date()): FxData {
  if (Buffer.byteLength(xml) > 16384 || /<!DOCTYPE|<!ENTITY|&[^\s]+;/i.test(xml) || !xml.includes('http://www.ecb.int/vocabulary/2002-08-01/eurofxref')) throw new Error('Invalid ECB reference feed');
  const dates = [...xml.matchAll(/<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]\s*>/g)];
  if (dates.length !== 1) throw new Error('ECB reference date unavailable');
  const date = dates[0]![1]!, timestamp = new Date(date + 'T00:00:00Z');
  if (!z.iso.date().safeParse(date).success || timestamp > now || now.getTime() - timestamp.getTime() > 7 * 86400000) throw new Error('ECB reference feed is stale or from the future');
  const rates: Record<string, string> = { EUR: '1' };
  for (const match of xml.matchAll(/<Cube\s+currency=['"]([A-Z]{3})['"]\s+rate=['"](\d+(?:\.\d+)?)['"]\s*\/>/g)) {
    const code = match[1]!, rate = match[2]!;
    if (rates[code] || !Intl.supportedValuesOf('currency').includes(code) || !new Prisma.Decimal(rate).gt(0)) throw new Error('Invalid or duplicate ECB reference rate');
    rates[code] = rate;
  }
  if (Object.keys(rates).length < 10 || Object.keys(rates).length > 50) throw new Error('Incomplete ECB reference feed');
  return { date, rates, fetchedAt: now.toISOString() };
}
let refreshing: Promise<FxData | null> | undefined;
export async function referenceRates(now = new Date()): Promise<FxData | null> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const saved = await prisma.travellerConfig.findUnique({ where: { id: 'fx:ecb' } });
    const parsed = dataSchema.safeParse(saved?.settings);
    const cached = parsed.success ? parsed.data : null;
    if (cached && now.getTime() - Date.parse(cached.fetchedAt) >= 0 && now.getTime() - Date.parse(cached.fetchedAt) < 6 * 3600000) return cached;
    try {
      const response = await fetch(ECB_URL, { redirect: 'error', signal: AbortSignal.timeout(8000) });
      if (!response.ok || !response.body) throw new Error('ECB reference feed unavailable');
      const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
      try {
        for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 16384) { await reader.cancel(); throw new Error('ECB feed too large'); } chunks.push(part.value); }
      } finally { reader.releaseLock(); }
      const data = parseEcb(Buffer.concat(chunks).toString('utf8'), now);
      await prisma.travellerConfig.upsert({ where: { id: 'fx:ecb' }, create: { id: 'fx:ecb', settings: data }, update: { settings: data, revision: { increment: 1 } } });
      return data;
    } catch { return cached; }
  })().finally(() => { refreshing = undefined; });
  return refreshing;
}
/** Reference estimates preserve their original currency; unavailable rates never become 1:1. */
export function fxQuote(data: FxData | null, from: string, to: string, now = new Date()): FxQuote | undefined {
  if (!data || !dataSchema.safeParse(data).success || !data.rates[from] || !data.rates[to]) return undefined;
  const at = new Date(data.date + 'T00:00:00Z');
  if (at > now || now.getTime() - at.getTime() > 7 * 86400000) return undefined;
  return { from, to, rate: new Prisma.Decimal(data.rates[to]!).div(data.rates[from]!).toFixed(8), source: 'ECB reference estimate', at };
}
