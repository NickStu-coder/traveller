import { expect, it } from 'vitest';
import { travellerNavigationAllowed } from '../browser';

it('admits the observed Lufthansa partner entry only during airline verification', () => {
  const partner = new URL('https://www.lufthansa.com/deeplink/partner');
  expect(travellerNavigationAllowed(partner)).toBe(false);
  expect(travellerNavigationAllowed(partner, 'lufthansa')).toBe(true);
  expect(travellerNavigationAllowed(new URL('https://shop.lufthansa.com/booking/cart'), 'lufthansa')).toBe(true);
});
it.each([
  'https://www.lufthansa.com/account/login', 'https://shop.lufthansa.com/account',
  'https://www.lufthansa.com.attacker.example/deeplink/partner', 'https://shop.lufthansa.com:8443/booking/cart',
  'http://www.lufthansa.com/deeplink/partner', 'https://user:secret@www.lufthansa.com/deeplink/partner',
  'https://www.google.com/accounts', 'https://127.0.0.1/booking/cart',
])('rejects credential, account, private, alternate-port or lookalike navigation: %s', value => {
  expect(travellerNavigationAllowed(new URL(value), 'lufthansa')).toBe(false);
});
it('limits Booking navigation to public searches and property pages', () => {
  for (const value of ['https://www.booking.com/searchresults.html', 'https://www.booking.com/searchresults.en-gb.html', 'https://www.booking.com/hotel/fr/mob-house-paris.en-gb.html'])
    expect(travellerNavigationAllowed(new URL(value), 'booking')).toBe(true);
  for (const value of ['https://www.booking.com/login', 'https://secure.booking.com/book.html', 'https://account.booking.com/auth/oauth2', 'https://www.booking.com:8443/hotel/fr/a.html', 'https://www.booking.com.attacker.example/hotel/fr/a.html'])
    expect(travellerNavigationAllowed(new URL(value), 'booking')).toBe(false);
});
