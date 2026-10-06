import type { SourceMetadata } from './types';

export const SOURCE_CATALOG: readonly SourceMetadata[] = [
  { id: 'google_explore', name: 'Google Flights Explore', independentGroup: 'google_flights', capabilities: ['flight_discovery'], paid: false, defaultEnabled: true,
    limitation: 'Partner-cached discovery prices. Exact dates use bounded rotating broad searches; flexible mode covers only six months. Discovery does not verify the itinerary or fare conditions.' },
  { id: 'google_flights', name: 'Google Flights', independentGroup: 'google_flights', capabilities: ['flight_exact', 'flight_verification'], paid: false, defaultEnabled: true,
    limitation: 'Aggregator confirmation is medium confidence. Selected cabin, dates, passenger allocation and total price must be visibly confirmed.' },
  { id: 'google_hotels', name: 'Google Hotels', independentGroup: 'google_hotels', capabilities: ['hotel_discovery', 'hotel_exact', 'hotel_verification'], paid: false, defaultEnabled: true,
    limitation: 'Stay totals including taxes and selected occupancy are required. Unknown review counts or rate conditions cannot satisfy quality requirements.' },
  { id: 'booking', name: 'Booking.com', independentGroup: 'booking', capabilities: ['hotel_discovery', 'hotel_exact', 'hotel_verification'], paid: false, defaultEnabled: false,
    limitation: 'May block unattended access. Stop and back off on access challenges; no CAPTCHA bypass or paid proxy dependency.' },
  { id: 'airline_direct', name: 'Airline direct · Lufthansa', independentGroup: 'airline_direct', capabilities: ['flight_verification'], paid: false, defaultEnabled: true,
    limitation: 'Supports adult-only LH/VL single-day itineraries. The actual public Lufthansa cart must confirm every segment, cabin, fare, party and total. Stop on an access challenge. No passenger or payment forms are submitted.' },
  { id: 'community', name: 'Flight Finder Community Data', independentGroup: 'community', capabilities: ['flight_discovery'], paid: false, defaultEnabled: false,
    limitation: 'Historical or community observations require a live recheck. Private Traveller queries are never published to the hub.' },
  { id: 'skyscanner_api', name: 'Skyscanner API', independentGroup: 'skyscanner', capabilities: [], paid: true, defaultEnabled: false,
    limitation: 'Unavailable official integration; credentials and an approved adapter are required. Never a mandatory dependency.' },
];
