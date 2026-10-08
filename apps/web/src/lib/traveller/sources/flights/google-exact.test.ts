import { describe, expect, it } from 'vitest';
import fixture from './fixtures/google-booking.json';
import { matchesFlightRoute, profileSchema } from '../../profiles';
import { parseExploreCards } from '../google-explore';
import { exactFlight } from './google-exact';
import { flightEligibility } from '../../engine/pipeline';
import { verifyLufthansa } from '../airlines/lufthansa';
import airlineFixture from '../airlines/fixtures/lufthansa-cart.json';

// Reduced public Google Flights booking evidence, captured 2026-10-06. No live network in tests.
const profile = profileSchema.parse({ name: 'Paris', origins: ['LJU'], destination: { kind: 'anywhere' }, dates: { mode: 'rolling', days: 365 }, duration: { minNights: 5, maxNights: 12 }, passengers: { adults: 2 }, cabin: 'business', positioning: { homeAirports: ['LJU'] } });
const candidate = parseExploreCards([{ entity: '/m/05qtj', name: 'Paris', flightPrice: '961', currency: 'EUR', stops: '1 stop', duration: '3 hr 30 min' }], { origin: 'LJU', destination: null, departure: '2027-04-01', returnDate: '2027-04-07' }, profile)[0]!;
describe('selected round-trip fare verification', () => {
  it('discovers only the requested airport, rejecting unrelated Explore cities and wrong exact destinations', () => {
    const airport = { ...profile, destination: { kind: 'airport' as const, values: ['CDG'] } };
    const request = { origin: 'LJU', destination: 'CDG', destinationName: 'CDG', departure: candidate.departure, returnDate: candidate.returnDate };
    const result = exactFlight(request, airport, fixture.url, fixture.legs, fixture.fares)!;
    expect(result).toMatchObject({ destination: 'CDG', destinationName: 'CDG', amount: 961, passengers: profile.passengers, cabin: profile.cabin });
    expect(matchesFlightRoute(airport, result)).toBe(true);
    expect(matchesFlightRoute(airport, candidate)).toBe(false);
    const cra = { ...airport, destination: { kind: 'airport' as const, values: ['CRA'] } };
    expect(exactFlight({ ...request, destination: 'CRA', destinationName: 'CRA' }, cra, fixture.url, fixture.legs, fixture.fares)).toBeNull();
    expect(exactFlight({ ...request, destination: 'ORY' }, profile, fixture.url, fixture.legs, fixture.fares)).toBeNull();
    expect(matchesFlightRoute(cra, { ...candidate, origin: 'ZAG', destination: '/m/0947l' })).toBe(false);
    expect(matchesFlightRoute(airport, { ...result, origin: 'TRS' })).toBe(false);
    const wrongReturn = structuredClone(result);
    wrongReturn.legs![1]![0]!.origin = 'ORY';
    expect(matchesFlightRoute(airport, wrongReturn)).toBe(false);
    wrongReturn.legs![1]![0]!.origin = 'CDG';
    wrongReturn.legs![1]!.at(-1)!.destination = 'ZAG';
    expect(matchesFlightRoute(airport, wrongReturn)).toBe(false);
  });
  it('keeps the party total, selected segments, local stay dates and fare conditions', () => {
    const result = exactFlight(candidate, profile, fixture.url, fixture.legs, fixture.fares)!;
    expect(result).toMatchObject({ amount: 961, source: 'google_flights', provenance: 'cached', arrivalLocal: '2027-04-01', returnDepartureLocal: '2027-04-07', checkedBags: 1,
      selfTransfer: null, overnight: false, durationMinutes: 310, layoverMinutes: [80, 170], fare: { provider: 'Lufthansa', name: 'Business Comfort', refundable: false, changesAllowed: false } });
    expect(result.legs?.flat()).toHaveLength(4);
    expect(result.airlineCodes).toEqual(['LH', 'VL']);
  });
  it('rejects mixed cabin, changed flights and incomplete arrival dates', () => {
    for (const changed of [{ cabin: 'Economy' }, { flight: 'LH 999' }, { arrival: '' }]) {
      const legs = structuredClone(fixture.legs);
      Object.assign(legs[0]![0]!, changed);
      expect(exactFlight(candidate, profile, fixture.url, legs, fixture.fares)).toBeNull();
    }
  });
  it('retains a compact airline total without inventing omitted fare conditions', () => {
    const fare = [{ label: 'Continue to book with Lufthansa airline for 961 euros', text: 'Book with Lufthansa\nAirline\n€961\nContinue' }];
    expect(exactFlight(candidate, profile, fixture.url, fixture.legs, fare)).toMatchObject({ amount: 961, checkedBags: null, selfTransfer: null, fare: { provider: 'Lufthansa', name: null, refundable: null } });
    const requiresBag = { ...profile, flight: { ...profile.flight, checkedBags: 1 } };
    const pending = exactFlight(candidate, requiresBag, fixture.url, fixture.legs, fare)!;
    expect(flightEligibility(pending, requiresBag)).toContain('baggage');
    const confirmed = verifyLufthansa(pending, requiresBag, airlineFixture)!;
    expect(confirmed.checkedBags).toBe(1);
    expect(flightEligibility(confirmed, requiresBag)).not.toContain('baggage');
  });
  it('applies baggage to the selected fare and enforces both legs and airport exclusions', () => {
    const withBags = { ...profile, flight: { ...profile.flight, checkedBags: 2 } };
    expect(exactFlight(candidate, withBags, fixture.url, fixture.legs, fixture.fares)?.amount).toBe(1633);
    for (const changed of [{ maxStops: 0 }, { maxDurationMinutes: 300 }, { maxLayoverMinutes: 120 }, { excludedAirports: ['MUC'] }, { excludedAirlines: ['VL'] }, { checkedBags: 3 }])
      expect(exactFlight(candidate, { ...profile, flight: { ...profile.flight, ...changed } }, fixture.url, fixture.legs, fixture.fares)).toBeNull();
    expect(() => exactFlight(candidate, { ...profile, passengers: { ...profile.passengers, adults: 1 } }, fixture.url, fixture.legs, fixture.fares)).toThrow(/one adult/);
    expect(exactFlight(candidate, profile, fixture.url, fixture.legs, [{ label: 'Continue to book with Unknown OTA for 1 euro', text: '€1' }])).toBeNull();
  });
});
