import { expect, it } from 'vitest';
import { profileSchema } from '../../profiles';
import { exactFlight } from '../flights/google-exact';
import google from '../flights/fixtures/google-booking.json';
import cart from './fixtures/lufthansa-cart.json';
import { parseExploreCards } from '../google-explore';
import { verifyLufthansa } from './lufthansa';

const profile = profileSchema.parse({ name: 'Direct', origins: ['LJU'], destination: { kind: 'anywhere' }, dates: { mode: 'rolling', days: 365 }, duration: { minNights: 5, maxNights: 12 }, passengers: { adults: 2 }, cabin: 'business', positioning: { homeAirports: ['LJU'] } });
const broad = parseExploreCards([{ entity: '/m/05qtj', name: 'Paris', flightPrice: '961', currency: 'EUR', stops: '1 stop', duration: '3 hr 30 min' }], { origin: 'LJU', destination: null, departure: '2027-04-01', returnDate: '2027-04-07' }, profile)[0]!;
const candidate = exactFlight(broad, profile, google.url, google.legs, google.fares)!;

it('confirms the actual Lufthansa party total, fare, all segments and explicit operating/marketing identities', () => {
  const result = verifyLufthansa(candidate, profile, cart)!;
  expect(result).toMatchObject({ source: 'airline_direct', provenance: 'live', amount: 960.12, selfTransfer: false, checkedBags: 1,
    fare: { provider: 'Lufthansa', name: 'Business Comfort', refundable: false, changesAllowed: false },
    directConfirmation: { marketingAliases: [{ google: 'VL2231', direct: 'LH4617', operator: 'Lufthansa City Airlines' }] } });
  expect(result.legs?.[1]?.[0]).toMatchObject({ airline: 'LH', number: '4617', cabin: 'business' });
});
it('rejects changed party, currency, route, times, cabin, operating airline, LH number and incomplete cart evidence', () => {
  const variants = [
    { party: ['1 Adult EUR960.12'] }, { wholeParty: false }, { allFlights: false }, { total: 'Total price:USD960.12' },
    { total: 'Total price:EUR1500.00' }, { url: 'https://shop.lufthansa.com/booking/availability' },
  ];
  for (const changed of variants) expect(verifyLufthansa(candidate, profile, { ...cart, ...changed })).toBeNull();
  for (const changed of [{ airports: ['(LJU)', '(FRA)'] }, { departure: '13:25' }, { flight: 'LH 999' }, { cabin: 'Economy' }, { operator: 'Different airline' }]) {
    const capture = structuredClone(cart);
    Object.assign(capture.bounds[0]!.segments[0]!, changed);
    expect(verifyLufthansa(candidate, profile, capture)).toBeNull();
  }
  expect(verifyLufthansa(candidate, { ...profile, passengers: { adults: 1, children: [10], infants: 0 } }, cart)).toBeNull();
});
