import type { WatchConstraints } from '../profiles';

export type SourceCapability = 'flight_discovery' | 'flight_exact' | 'flight_verification' | 'hotel_discovery' | 'hotel_exact' | 'hotel_verification';
export type SourceStatus = 'healthy' | 'degraded' | 'blocked' | 'rate_limited' | 'disabled' | 'unconfigured';
export interface SourceMetadata {
  id: string;
  name: string;
  independentGroup: string;
  capabilities: readonly SourceCapability[];
  paid: boolean;
  defaultEnabled: boolean;
  limitation: string;
}
export interface DiscoveryRequest {
  origin: string;
  destination: string | null;
  departure: string;
  returnDate: string;
}
export interface SourceContext {
  profile: WatchConstraints;
  signal: AbortSignal;
  /** Reserve one logical provider search before navigation or a filter submission. */
  reserveRequest(): Promise<void>;
}
export interface FlightCandidate {
  kind: 'flight';
  origin: string;
  destination: string;
  destinationName: string;
  departure: string;
  returnDate: string;
  cabin: WatchConstraints['cabin'];
  passengers: WatchConstraints['passengers'];
  amount: number;
  currency: string;
  stops: number | null;
  durationMinutes: number | null;
  bookingUrl: string;
  source: string;
  provenance: 'live' | 'cached';
  observedAt: string;
  contextConfirmed: boolean;
  /** Unknown fare conditions cannot be treated as satisfying a required filter. */
  checkedBags: number | null;
  selfTransfer: boolean | null;
  overnight: boolean | null;
  airlineCodes: string[];
  connectionAirports: string[];
  layoverMinutes: number[] | null;
  arrivalLocal: string | null;
  returnDepartureLocal: string | null;
}
export interface FlightSourceAdapter {
  metadata: SourceMetadata;
  discover(request: DiscoveryRequest, context: SourceContext): Promise<FlightCandidate[]>;
  verify?(candidate: FlightCandidate, context: SourceContext): Promise<FlightCandidate | null>;
}
export class SourceError extends Error {
  constructor(readonly status: Exclude<SourceStatus, 'healthy' | 'disabled'>, message: string) {
    super(message); this.name = 'SourceError';
  }
}
