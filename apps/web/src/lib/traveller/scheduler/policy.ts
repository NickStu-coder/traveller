import { createHash } from 'node:crypto';
import { z } from 'zod';
import { matchesDates, travelWindow, type WatchConstraints } from '../profiles';
import type { DiscoveryRequest } from '../sources/types';

export const schedulerSchema = z.object({
  discoveryMinutes: z.number().int().min(60).max(10080).default(180),
  watchMinutes: z.number().int().min(30).max(10080).default(60),
  hotMinutes: z.number().int().min(5).max(15).default(10),
  coldMinutes: z.number().int().min(360).max(43200).default(1440),
  maxFailures: z.number().int().min(1).max(20).default(5),
  maxCandidatesPerJob: z.number().int().min(1).max(50).default(20),
  sourceSpacingSeconds: z.number().int().min(30).max(86400).default(120),
}).strict();
export type SchedulerSettings = z.output<typeof schedulerSchema>;
export const DEFAULT_SCHEDULER = schedulerSchema.parse({});
export type Lane = 'DISCOVERY' | 'WATCH' | 'HOT' | 'COLD';
export const LANE_PRIORITY: Record<Lane, number> = { HOT: 100, WATCH: 50, DISCOVERY: 20, COLD: 0 };

/** Jitter is deterministic per key, so competing scheduler processes agree. */
export function nextCheck(key: string, lane: Lane, failures: number, now = new Date(), settings = DEFAULT_SCHEDULER): Date {
  const intervals = { DISCOVERY: settings.discoveryMinutes, WATCH: settings.watchMinutes, HOT: settings.hotMinutes, COLD: settings.coldMinutes };
  const jitter = createHash('sha256').update(key + now.toISOString().slice(0, 13)).digest().readUInt16BE(0) / 65535;
  const minutes = failures > 0 ? Math.min(10080, Math.max(30, intervals[lane]) * 2 ** Math.min(8, failures)) : intervals[lane];
  return new Date(now.getTime() + minutes * 60000 * (0.9 + jitter * 0.2));
}

/** One broad origin search, never an airport × destination × date matrix.
 * Date samples rotate through the full window; coverage is deliberately sampled.
 */
export function discoveryRequest(profile: WatchConstraints, key: string, now = new Date(), discoveryMinutes = DEFAULT_SCHEDULER.discoveryMinutes): DiscoveryRequest | null {
  const window = travelWindow(profile, now);
  const today = now.toISOString().slice(0, 10);
  const from = window.from < today ? today : window.from;
  const available = Math.floor((Date.parse(window.to) - Date.parse(from)) / 86400000) - profile.duration.minNights + 1;
  if (available <= 0) return null;
  const slot = Math.floor(now.getTime() / (discoveryMinutes * 60000));
  const offset = createHash('sha256').update(key).digest().readUInt32BE(0);
  const origin = profile.origins[(slot + offset) % profile.origins.length]!;
  const destination = profile.destination.kind === 'anywhere' ? null : profile.destination.values[(Math.floor(slot / profile.origins.length) + offset) % profile.destination.values.length]!;
  for (let attempt = 0; attempt < available; attempt++) {
    const departure = new Date(Date.parse(from) + ((slot + offset + attempt) % available) * 86400000).toISOString().slice(0, 10);
    const remaining = Math.floor((Date.parse(window.to) - Date.parse(departure)) / 86400000);
    const range = Math.min(profile.duration.maxNights, remaining) - profile.duration.minNights + 1;
    const nights = profile.duration.minNights + (slot + offset) % range;
    const returnDate = new Date(Date.parse(departure) + nights * 86400000).toISOString().slice(0, 10);
    if (matchesDates(profile, departure, returnDate, now)) return { origin, destination, departure, returnDate };
  }
  return null;
}
