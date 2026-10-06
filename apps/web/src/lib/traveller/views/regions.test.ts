import { beforeAll, expect, it } from 'vitest';
import { getCarCatalogAirport } from '../../cars/locations';
import { filterDestinationRegion } from './regions';

// Loading and verifying the real 73 MB catalog is fixture setup, as in cars/locations.test.ts.
beforeAll(async () => {
  expect(await getCarCatalogAirport('CDG')).toMatchObject({ iata: 'CDG', country: 'FR' });
}, 60_000);

it('uses confirmed arrival airports and excludes unresolved destination entities', async () => {
  const rows = [{ airport: 'CDG' }, { airport: 'HND' }, { airport: '/m/unknown' }];
  expect(await filterDestinationRegion(rows, 'Asia', row => row.airport)).toEqual([{ airport: 'HND' }]);
  expect(await filterDestinationRegion(rows, 'Europe', row => row.airport)).toEqual([{ airport: 'CDG' }]);
  expect(await filterDestinationRegion(rows, undefined, row => row.airport)).toEqual(rows);
});
