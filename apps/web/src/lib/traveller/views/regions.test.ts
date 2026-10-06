import { expect, it } from 'vitest';
import { filterDestinationRegion } from './regions';

it('uses confirmed arrival airports and excludes unresolved destination entities', async () => {
  const rows = [{ airport: 'CDG' }, { airport: 'HND' }, { airport: '/m/unknown' }];
  expect(await filterDestinationRegion(rows, 'Asia', row => row.airport)).toEqual([{ airport: 'HND' }]);
  expect(await filterDestinationRegion(rows, 'Europe', row => row.airport)).toEqual([{ airport: 'CDG' }]);
  expect(await filterDestinationRegion(rows, undefined, row => row.airport)).toEqual(rows);
});
