# Sources and limitations

No mandatory paid travel-data API, proxy, VPN subscription or CAPTCHA service is required. A zero-fee source is not a guarantee of unrestricted access or continuous availability.

| Source | Foundation implementation | Limits / intended handling |
| --- | --- | --- |
| Google Flights | Playwright navigation and AI extraction, exact searches | No official unrestricted free API. Cabin/passengers/round-trip basis must be confirmed; AI can be unavailable. Stop on blocking. |
| Google Flights Explore | New broad-discovery adapter required | Investigate actual destination cards and date/cabin controls before claiming live capability. Never replace Anywhere with an exhaustive airport/date Cartesian product. |
| Airline direct | Airline-specific deep links and navigation | Airlines vary; high confidence requires observed fare details for the same itinerary, not a marketing page or search URL. |
| Flight Finder Community | Existing opt-in hub API | Cached observations; coverage, age, license/terms and availability matter. Not an independent source from the original provider. |
| Google Hotels | Existing deterministic context and offer parsers | Details/occupancy/date verification can fail; pricing basis and taxes must be preserved. Limit property fanout. |
| Booking.com | Existing rate/context capture and deterministic extraction | Access may be challenged; mark blocked rather than retry aggressively. Room/meal/cancellation equivalence is mandatory for comparison. |
| Public RSS/deal feeds | Adapter planned | Public text creates candidates, not availability or verified prices. Curated allowlist; no arbitrary user URLs. |
| Official Skyscanner | Disabled | Credentials and approved access required. Never mandatory. |

Status vocabulary: disabled, healthy, degraded, blocked, rate-limited, unhealthy. Store last success/error and next allowed request. An enabled adapter with no results must report whether it completed, failed, or lacks capability.

Independent verification groups reflect the underlying provider, not the adapter name. Two Google wrappers, an OTA page mirrored by Google, or Community copies of Google fares must not be counted as two independent confirmations.
