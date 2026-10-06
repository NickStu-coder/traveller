import { expect, it } from 'vitest';
import { profileSchema } from '../../profiles';
import { distanceKm, positioningDistances } from './geography';

it('measures great-circle radius across the antimeridian without inflating longitude', () => {
  expect(distanceKm({ latitude: 0, longitude: 179 }, { latitude: 0, longitude: -179 })).toBeCloseTo(222.390, 2);
  expect(distanceKm({ latitude: 46, longitude: 14 }, { latitude: 46, longitude: 14 })).toBe(0);
});
it('enforces home-airport radius using the existing checked catalog', async () => {
  const profile = profileSchema.parse({ name: 'Positioning', origins: ['LJU', 'VIE'], destination: { kind: 'anywhere' }, dates: { mode: 'rolling', days: 365 }, duration: { minNights: 5, maxNights: 12 }, passengers: { adults: 2 }, cabin: 'business', positioning: { homeAirports: ['LJU'], maxDistanceKm: 500 } });
  const distances = await positioningDistances(profile);
  expect(distances.LJU).toBe(0);
  expect(distances.VIE).toBeGreaterThan(250);
  expect(distances.VIE).toBeLessThan(350);
  await expect(positioningDistances({ ...profile, positioning: { ...profile.positioning, maxDistanceKm: 200 } })).rejects.toThrow(/radius: VIE/);
  await expect(positioningDistances({ ...profile, origins: ['ZZZ'] })).rejects.toThrow(/unavailable: ZZZ/);
}, 60_000);
