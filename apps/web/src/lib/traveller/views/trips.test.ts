import { expect, it } from 'vitest';
import { safeHotelUrl, surpriseTrips } from './trips';

it('selects distinct destinations only from measured eligible trip scores', () => {
  const row = (destinationName: string, score: number | null, eligibility: string[] = []) => ({ details: { destinationName }, evaluation: { score, eligibility } });
  expect(surpriseTrips([row('Paris', 82), row('London', 86), row('Paris', 87), row('Rome', null), row('Tokyo', 90, ['quality_threshold'])]).map(result => result.details.destinationName)).toEqual(['Paris', 'London']);
  expect(safeHotelUrl('https://www.google.com/travel/hotels/entity/known')).not.toBeNull();
  for (const value of ['http://www.google.com/travel/hotels/entity/known', 'https://www.google.com.evil/travel/hotels/entity/known', 'https://user:pass@www.google.com/travel/hotels/entity/known']) expect(safeHotelUrl(value)).toBeNull();
});
