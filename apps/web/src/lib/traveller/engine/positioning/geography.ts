import { getCarCatalogAirport } from '../../../cars/locations';
import type { WatchConstraints } from '../../profiles';

type Coordinate = { latitude: number; longitude: number };
/** Great-circle distance is a radius filter, not an invented driving distance. */
export function distanceKm(a: Coordinate, b: Coordinate): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitude = radians(b.latitude - a.latitude), longitude = radians(b.longitude - a.longitude);
  const haversine = Math.sin(latitude / 2) ** 2 + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(longitude / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, haversine))));
}

/** Reuses the integrity-checked OurAirports catalog already shipped with the app. */
export async function positioningDistances(profile: WatchConstraints): Promise<Record<string, number>> {
  const codes = [...new Set([...profile.origins, ...profile.positioning.homeAirports])];
  const airports = new Map(await Promise.all(codes.map(async code => {
    const airport = await getCarCatalogAirport(code);
    if (!airport) throw new Error('Airport coordinates are unavailable: ' + code);
    return [code, airport] as const;
  })));
  const result: Record<string, number> = {};
  for (const origin of profile.origins) {
    result[origin] = Math.min(...profile.positioning.homeAirports.map(home => distanceKm(airports.get(home)!, airports.get(origin)!)));
    if (result[origin]! > profile.positioning.maxDistanceKm) throw new Error('Origin exceeds the positioning radius: ' + origin);
  }
  return result;
}
