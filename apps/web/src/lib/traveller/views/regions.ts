import regions from './regions.json';
import { getCarCatalogAirport } from '../../cars/locations';

export const DESTINATION_REGIONS = [...new Set(Object.values(regions.countries).flat().filter(Boolean))].sort();
const countries: Record<string, string[]> = regions.countries;
export const regionMessageKey = (region: string) => region.toLowerCase().replaceAll(' ', '_').replaceAll('-', '_');

/** Uses the confirmed arrival airport and UN M49 grouping; names are never guessed. */
export async function filterDestinationRegion<T>(rows: T[], region: string | undefined, arrivalAirport: (row: T) => string | null | undefined): Promise<T[]> {
  if (!region) return rows;
  const matches = await Promise.all(rows.map(async row => {
    const code = arrivalAirport(row), airport = code ? await getCarCatalogAirport(code) : null;
    return Boolean(airport && countries[airport.country]?.includes(region));
  }));
  return rows.filter((_, index) => matches[index]);
}
