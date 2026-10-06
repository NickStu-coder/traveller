# Sources and limitations

No mandatory paid travel-data API, proxy, VPN subscription or CAPTCHA service is required. A zero-fee source is not a guarantee of unrestricted access or continuous availability.

| Source | Foundation implementation | Limits / intended handling |
| --- | --- | --- |
| Google Flights | Playwright navigation and AI extraction, exact searches | No official unrestricted free API. Cabin/passengers/round-trip basis must be confirmed; AI can be unavailable. Stop on blocking. |
| Google Flights Explore | Ordinary Chromium, native destination controls and deterministic card extraction | Target-network fixed-date Business discovery returned actual destination candidates on 2026-10-06. Never replace Anywhere with an exhaustive airport/date Cartesian product. |
| Airline direct | Airline-specific deep links and navigation | Airlines vary; high confidence requires observed fare details for the same itinerary, not a marketing page or search URL. |
| Flight Finder Community | Existing opt-in hub API | Cached observations; coverage, age, license/terms and availability matter. Not an independent source from the original provider. |
| Google Hotels | Existing deterministic context and offer parsers | Details/occupancy/date verification can fail; pricing basis and taxes must be preserved. Limit property fanout. |
| Booking.com | Bounded ordinary-browser discovery with existing rate/context capture and deterministic extraction | Native 10-point property rating and review count; default disabled pending runtime verification. Access may be challenged; mark blocked rather than retry aggressively. Room/meal/cancellation equivalence is mandatory for comparison. |
| Public RSS/deal feeds | Adapter planned | Public text creates candidates, not availability or verified prices. Curated allowlist; no arbitrary user URLs. |
| Official Skyscanner | Disabled | Credentials and approved access required. Never mandatory. |

Status vocabulary: disabled, healthy, degraded, blocked, rate-limited, unhealthy. Store last success/error and next allowed request. An enabled adapter with no results must report whether it completed, failed, or lacks capability.

Independent verification groups reflect the underlying provider, not the adapter name. Two Google wrappers, an OTA page mirrored by Google, or Community copies of Google fares must not be counted as two independent confirmations.
# Target-network evidence and current limitations

On 2026-10-06 an ordinary isolated Chromium search from the Synology validation runtime returned five Google Explore destination fares for LJU, two adults, Business, 1–7 April 2027. One query was made. These are partner-cached discovery fares, not live airline confirmation. A selected Flights request originally redirected to Explore because its protobuf surface selector was wrong; the exact-search builder now selects Flights and checks the retained context. The corrected selected round-trip workflow passed on the target network at 07:08 UTC on 2026-10-06. It retained both legs, all segments and Business cabin for two adults; unreported fare conditions remain unknown.

Google Hotels uses a bounded one-property workflow with visibly confirmed full-stay totals, dates, currency and occupancy. Review counts and stars are scoped to the selected property; nearby attractions and sponsored properties cannot supply its quality. Unknown refunds, breakfast, amenities or distance do not satisfy a requested filter. The current Google adapter cannot verify multiple rooms or hotel infant allocation and reports that limitation without recording a fabricated trip total. A seller link is not independent direct verification. Combined flight and hotel checks retain medium confidence for each component.


The Lufthansa entry navigation reached its real public partner entry point on the target network on 2026-10-06, then returned an access challenge. Unattended access stops immediately: a blocked source is disabled until an administrator deliberately re-enables it. No CAPTCHA or security challenge is bypassed. The earlier ordinary browser cart capture and its regression fixture validate the parser, but do not establish ongoing automated provider availability.

A later Google Hotels run exposed a selected-card navigation timeout for OKKO Hotels Paris Porte De Versailles. A subsequent controlled run on tree `e75e5c29b9d1329008b507dff33c534dfaef14ec` succeeded for that property: seven seller offers, visibly confirmed six-night totals for two adults, 4 stars and 4.4/5 from 1,670 reviews. The earlier timeout remains evidence of intermittent source availability.

Discovery offers flight, hotel and complete-trip views with duration, currency-specific budget, quality and score filters. Region filtering uses the confirmed destination airport from the existing OurAirports catalog and the UN M49 country/region snapshot retrieved on 2026-10-06: https://unstats.un.org/unsd/methodology/m49/overview/. Unresolved destination entities are excluded from a region-filtered view. The bundled classification makes no runtime paid-API request.

On tree `88917ae6cd36d08a1013d3c39069fd61ee82a0fa`, Google Hotels subsequently returned visibly confirmed six-night totals for two adults at Hôtel Monte Cristo, with 4 stars and 4.6/5 from 712 property reviews. This proves that selected-property workflow, without claiming the earlier OKKO timeout has been resolved.

The first controlled Booking.com check on the target network encountered an access challenge redirect with `chal_t`, then no result cards. It produced no verified hotel prices. The redirect is now classified immediately as blocked and closes the browser, including when the visible challenge disappears during navigation. Booking remains disabled by default; the ordinary-browser parser fixtures do not establish automated availability. No further challenge retries or bypass were attempted.
