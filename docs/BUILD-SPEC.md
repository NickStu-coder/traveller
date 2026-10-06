# TRAVELLER — MASTER BUILD PROMPT

You are the lead software architect and developer for **Traveller**, a self-hosted, multi-user, 24/7 travel deal discovery and price-monitoring platform.

Your job is NOT to blindly build a new application from scratch.

Your first task is to inspect, evaluate, and reuse the best existing open-source implementations where legally and technically appropriate, especially **Flight Finder by affromero**, while keeping our changes maintainable and as upstream-compatible as reasonably possible.

Traveller should ultimately become significantly more capable than a conventional flight price tracker.

---

# 1. PRODUCT VISION

Traveller continuously searches for unusually good:

- flights,
- hotels,
- combined flight + hotel trips.

Users should NOT need to know exact travel dates or even exact destinations.

Examples:

### Specific destination

Origin:
LJU, VIE, VCE

Destination:
New York

Travel:
any time between November and February

Length:
5–10 nights

Cabin:
Business

Traveller continuously searches for good combinations.

### Region

Origins:
LJU, VIE, VCE, ZAG

Destination:
Asia

Travel:
next 12 months

Length:
7–14 nights

Cabin:
Business

Traveller discovers destinations automatically.

### Anywhere

Origins:
LJU, VIE, VCE, ZAG, MUC, MXP

Destination:
ANYWHERE

Travel:
next 365 days

Length:
4–12 nights

Cabin:
Business

Traveller should automatically discover unusually cheap destinations.

### Complete trip

Traveller may discover:

VIE → HND
Business return
€1,087

Tokyo 5-star hotel
Booking rating 9.2
€145/night
8 nights

and calculate:

Flight: €1,087
Hotel: €1,160
Positioning estimate: €150

TOTAL TRIP: €2,397

Normal estimated trip cost: €4,500

Trip Deal Score: 96/100

This should trigger an alert.

---

# 2. CRITICAL COST REQUIREMENT

Traveller must have:

**ZERO mandatory paid travel-data APIs.**

Do NOT make the core product dependent on:

- SerpAPI
- RapidAPI
- paid Amadeus calls
- paid Skyscanner access
- paid proxies
- residential proxies
- CAPTCHA solving services
- Bright Data
- other mandatory paid travel APIs

OpenAI API usage IS allowed.

However:

OpenAI should NOT be required for deterministic operations such as:

- scheduling,
- price history,
- statistical analysis,
- scoring,
- alert triggering,
- database operations.

Use OpenAI where it provides real value, for example:

- extraction from difficult pages,
- normalization,
- interpreting natural-language watch profiles,
- identifying destination/location entities,
- assisting with deal classification,
- parsing unstructured deal feeds.

Minimize unnecessary token consumption.

Traveller must continue functioning if OpenAI is temporarily unavailable.

---

# 3. FIRST TASK — OPEN SOURCE AUDIT

Before implementing major changes, inspect the latest versions of relevant open-source projects.

Start with:

### Primary candidate

affromero/flight-finder

Evaluate using it as the upstream foundation for Traveller.

Inspect:

- architecture,
- current features,
- authentication,
- users,
- passkeys/WebAuthn,
- PostgreSQL,
- Prisma,
- Redis,
- Playwright,
- scheduling,
- Google Flights,
- Google Hotels,
- Booking.com,
- airline-direct support,
- hotel tracking,
- price history,
- notifications,
- email,
- Telegram,
- ntfy,
- webhooks,
- PWA,
- REST API,
- Community Data,
- Docker deployment,
- Codex/OpenAI integration.

Also inspect relevant ideas/implementations from projects such as:

- flight-price-radar / flight-radar
- Flight-Price-Tracker
- FlightsPricingTracker
- fast-hotels
- Google Hotels scraper projects
- other actively maintained open-source projects you discover that materially improve Traveller.

DO NOT copy incompatible-license code.

For every external project considered, record:

- repository URL,
- license,
- maintenance/activity,
- useful functionality,
- whether code can legally be reused,
- whether we should reuse code, adapt the concept, or ignore it.

Prefer mature existing implementations over rewriting functionality.

---

# 4. UPSTREAM STRATEGY

If Flight Finder remains the best foundation after inspection:

fork it and keep an upstream remote.

Architect Traveller-specific functionality so future upstream changes can still reasonably be merged.

Avoid unnecessary modifications to upstream core files.

Prefer:

- adapters,
- services,
- separate modules,
- feature flags,
- extensions,

over invasive rewrites.

Document unavoidable divergences.

Create:

`docs/UPSTREAM.md`

containing:

- upstream repository,
- upstream version/commit,
- Traveller changes,
- merge strategy,
- known conflicts.

---

# 5. APPLICATION NAME

The product name is:

# Traveller

Remove user-facing Flight Finder branding where legally permitted.

Do not unnecessarily rename internal upstream components if doing so would make future upstream merges significantly harder.

---

# 6. DEPLOYMENT

Target environment:

- Synology NAS
- Docker
- Portainer
- DSM reverse proxy

Preferred stack where compatible with upstream:

- Next.js
- TypeScript
- PostgreSQL
- Prisma
- Redis
- Playwright
- Docker Compose

Deployment should be production-ready.

Provide:

- health checks,
- restart policies,
- persistent volumes,
- migrations,
- backup instructions,
- restore instructions,
- environment template,
- production compose file.

Secrets must never be committed.

---

# 7. MULTI-USER AUTHENTICATION

Traveller is MULTI-USER.

No LDAP.

No Active Directory.

No Keycloak requirement.

Implement or retain a native authentication system supporting:

- username/email,
- password,
- secure sessions,
- password reset,
- optional passkeys/WebAuthn,
- administrator role,
- normal user role.

Users must only see their own:

- searches,
- watch profiles,
- alerts,
- preferences,

unless explicitly shared.

Administrators need system-wide operational visibility.

---

# 8. INTERNATIONALIZATION

Build i18n correctly from the beginning.

Required languages:

- Slovenian
- English

Do not hard-code UI strings throughout components.

---

# 9. RESPONSIVE UI / PWA

Traveller should work extremely well on:

- desktop,
- tablet,
- mobile.

Retain/build PWA capability.

The experience should feel like a modern travel application.

Primary navigation should approximately include:

- Dashboard
- Discover
- Flights
- Hotels
- Trips
- Watch Profiles
- Alerts
- History
- Settings

Admin additionally receives:

- Sources
- Workers
- Queue
- Health
- Logs
- OpenAI usage
- System settings

---

# 10. WATCH PROFILES

This is a core Traveller concept.

Users can create multiple Watch Profiles.

Examples:

- NYC Business
- Anywhere Business
- Cheap Asia
- European Weekend
- Luxury Hotel Deals
- Summer Family Trip
- Maldives
- Extreme Deals Anywhere

Each Watch Profile can independently configure search constraints.

---

# 11. ORIGIN SELECTION

Users may configure:

- one airport,
- multiple airports,
- saved home airports,
- nearby airports,
- optional geographic radius.

Example:

LJU
ZAG
TRS
VCE
VIE
MUC
MXP

Do NOT assume one fixed origin.

---

# 12. DESTINATION SELECTION

Support:

- airport,
- city,
- country,
- region,
- continent,
- multiple destinations,
- ANYWHERE.

ANYWHERE is a critical feature.

Examples:

LJU → Anywhere

VIE + VCE + ZAG → Asia

LJU + VIE → North America

The system should discover destinations rather than requiring users to create hundreds of individual trackers.

---

# 13. DATE FLEXIBILITY

Support:

- exact dates,
- date ranges,
- flexible departure dates,
- flexible return dates,
- trip duration ranges,
- months,
- seasons,
- next X months,
- next 365 days.

Example:

Travel anytime during next 12 months.

Stay:
5–12 nights.

Traveller should automatically evaluate suitable combinations.

---

# 14. PASSENGERS

Support:

- adults,
- children,
- infants,

and persist these per Watch Profile.

---

# 15. FLIGHT PREFERENCES

Support filters including:

- Economy
- Premium Economy
- Business
- First

and:

- maximum price,
- maximum stops,
- nonstop only,
- maximum total duration,
- maximum layover,
- minimum layover,
- baggage requirements,
- excluded airlines,
- preferred airlines,
- excluded airports,
- self-transfer allowed/not allowed,
- overnight connection allowed/not allowed.

Design the data model so future support for:

- open-jaw,
- multi-city

can be added cleanly.

If reasonably achievable without destabilizing V1, implement them.

---

# 16. FLIGHT DISCOVERY

Traveller must NOT simply monitor predefined exact routes.

Create a proper:

# Flight Discovery Engine

It should discover unusually attractive flights automatically.

Primary free discovery mechanisms should be evaluated, including:

- Google Flights
- Google Flights Explore
- Flight Finder Community Data
- public/community deal feeds
- airline websites
- other reliable free sources discovered during audit.

Google Flights Explore / broad discovery should be heavily investigated because it may return many destinations from relatively few queries.

Avoid naive brute-force combinations such as:

airport × destination × every date × cabin

when a broad discovery query can achieve the same result.

---

# 17. SOURCE ADAPTER ARCHITECTURE

Build a provider/adapter architecture.

Example conceptual interface:

`FlightSourceAdapter`

`HotelSourceAdapter`

Each adapter should expose capabilities such as:

- discovery
- exact search
- verification
- booking URL
- historical observation

Sources can independently be:

- enabled,
- disabled,
- degraded,
- blocked,
- rate-limited,
- unhealthy.

Failure of one provider must NOT break Traveller.

Admin UI must show source health.

---

# 18. FUTURE API SOURCES

Design adapters for future official integrations.

For example:

`SkyscannerProvider`

may exist but remain disabled until credentials/access are available.

Do not make unavailable APIs mandatory.

---

# 19. SCRAPING POLICY

Be conservative and robust.

Do NOT try to defeat CAPTCHAs or intentionally circumvent access controls.

Do NOT depend on paid proxy infrastructure.

Use:

- reasonable scheduling,
- caching,
- backoff,
- jitter,
- deduplication,
- request budgets,
- adaptive polling.

If a source blocks requests:

mark it degraded and continue using other sources.

---

# 20. ADAPTIVE SCHEDULER

Do NOT simply run everything every few minutes.

Create an adaptive scheduler.

Conceptually:

### DISCOVERY

Broad searches.

Approximately every few hours, dynamically adjusted.

### WATCH

Interesting routes/hotels already being monitored.

Approximately hourly where reasonable.

### HOT

Potential extreme deal detected.

Immediately recheck.

Then optionally recheck again after approximately 5–15 minutes.

### COLD

Low-interest combinations.

Check less frequently.

Exact intervals must be configurable.

Introduce:

- per-source request budgets,
- exponential backoff,
- jitter,
- queue priorities.

---

# 21. PRICE HISTORY

Never automatically delete useful historical price observations.

Price history is one of Traveller's most valuable assets.

Store sufficient normalized information to analyze:

- route,
- destination,
- dates,
- cabin,
- airline,
- stops,
- duration,
- provider,
- fare,
- hotel,
- room/rate where available,
- timestamps,
- currencies.

Avoid unnecessary duplicate observations.

---

# 22. CURRENCY

Support multiple currencies.

Normalize internally to a configurable base currency while retaining:

- original amount,
- original currency,
- conversion rate,
- conversion timestamp.

Users can select preferred display currency.

Default deployment currency:

EUR.

---

# 23. FLIGHT DEAL ENGINE

Do NOT define a good deal only as:

`price < user threshold`

Traveller should determine whether something is statistically unusual.

Build:

# Flight Deal Score: 0–100

Potential factors:

- current vs historical median,
- historical percentile,
- route baseline,
- cabin baseline,
- seasonality,
- distance/value,
- airline quality,
- stops,
- total duration,
- layover quality,
- baggage,
- positioning cost,
- verification confidence.

The weights must be configurable.

Initial conceptual bands:

90–100:
EXTREME

80–89:
EXCELLENT

70–79:
GOOD

below threshold:
do not alert unless user explicitly requests it.

Use robust statistics.

Avoid allowing a single bad historical observation to distort the score.

---

# 24. POSITIONING

Traveller should understand positioning.

Example:

LJU → JFK Business:
€1,950

VIE → JFK Business:
€980

Positioning estimate:
€200

Effective:
€1,180

Potential saving:
€770

Allow users to configure:

- maximum positioning distance,
- allowed positioning airports,
- optional positioning cost estimates.

Do NOT present positioning as free.

---

# 25. DEAL VERIFICATION

Discovery does NOT automatically mean alert.

Pipeline:

DISCOVERY
→ candidate
→ normalize
→ calculate preliminary score
→ if sufficiently interesting:
→ live recheck
→ independent verification where possible
→ final score
→ alert.

Store:

- verification timestamp,
- source,
- observed price,
- confidence.

UI should show:

`Verified X minutes ago`

where appropriate.

---

# 26. SOURCE CONFIDENCE

Implement confidence levels.

Example:

HIGH:
airline direct confirms fare.

HIGH/MEDIUM:
multiple reputable independent sources agree.

MEDIUM:
Google Flights result but no airline confirmation.

LOW:
single OTA/unverified source.

Avoid strong alerts for low-confidence deals unless the user explicitly enables them.

---

# 27. BOOKING

Traveller does NOT automatically purchase travel.

Provide booking/deep links.

Prefer:

1. airline direct
2. hotel direct
3. trusted major OTA
4. other provider

Clearly label the provider.

Never silently redirect through an unknown OTA.

---

# 28. HOTELS

Hotel functionality is a first-class feature.

Support:

- city/destination,
- geographic radius,
- dates,
- flexible dates,
- number of nights,
- rooms,
- guests,
- star category,
- maximum nightly price,
- maximum total price,
- amenities,
- breakfast,
- refundable,
- property type.

Where reliable data is available, include:

- Google rating,
- Google review count,
- Booking rating,
- Booking review count,
- star category.

---

# 29. HOTEL QUALITY

A cheap bad hotel is NOT a good Traveller deal.

Hotel scoring must account for quality.

For example:

Hotel A:
€60
rating 6.1

should not outrank:

Hotel B:
€115
Booking 9.2
4,300 reviews

just because Hotel A is cheaper.

Use:

- rating,
- number of reviews,
- star category,
- historical price,
- location where available,
- amenities,
- cancellation terms,

to determine value.

Do not compare Google 5-point and Booking 10-point ratings naively.

Normalize them while retaining original values.

Review count should influence confidence.

A 9.8 rating from 8 reviews should have less confidence than 9.2 from 4,000 reviews.

---

# 30. HOTEL SOURCES

Evaluate and use legal/reliable free methods from:

- Google Hotels
- Booking.com where technically sustainable
- direct hotel websites where practical
- existing Flight Finder hotel support
- relevant open-source hotel search projects.

Google Hotels can be valuable as an aggregator of offers from multiple providers.

Use provider adapters so hotel sources can evolve independently.

---

# 31. HOTEL PRICE HISTORY

Track hotel prices similarly to flights.

Normalize where possible by:

- hotel,
- dates,
- occupancy,
- room,
- meal plan,
- cancellation conditions.

Avoid comparing:

non-refundable room-only

directly against:

refundable breakfast-included

without accounting for differences.

---

# 32. HOTEL DEAL SCORE

Create:

# Hotel Deal Score: 0–100

Potential factors:

- historical price deviation,
- destination baseline,
- star category,
- Google rating,
- Booking rating,
- review confidence,
- room conditions,
- breakfast,
- refundable status,
- location,
- source confidence.

---

# 33. TRIP ENGINE

This is a major Traveller differentiator.

Combine:

FLIGHT + HOTEL + POSITIONING

into complete trips.

Example:

VIE → HND Business:
€1,087

Hotel:
€145 × 8 = €1,160

Positioning:
€150

TOTAL:
€2,397

Compare this against estimated normal trip cost.

---

# 34. TRIP DEAL SCORE

Create:

# Trip Deal Score: 0–100

Consider:

- Flight Deal Score,
- Hotel Deal Score,
- total trip price,
- historical total trip baseline,
- hotel quality,
- flight quality,
- positioning,
- source confidence.

A spectacular flight with an extremely expensive hotel may NOT be a spectacular trip.

Conversely:

a moderately cheap flight + unusually cheap luxury hotel

may create an excellent total trip.

---

# 35. SURPRISE ME

Create a mode conceptually called:

# Surprise Me

User provides:

- origin airports,
- date window,
- trip length,
- budget,
- cabin,
- hotel preferences.

Destination is:

ANYWHERE.

Traveller finds the best opportunities automatically.

This should eventually become one of Traveller's flagship features.

---

# 36. DASHBOARD

The primary dashboard should emphasize useful opportunities, not configuration.

Example:

🔥 96/100 EXTREME

Vienna → Tokyo

BUSINESS

€1,087 return

Normal observed:
~€2,400

Hotel:
5★
Booking 9.2
€145/night

8-night trip:
€2,397

Verified:
4 minutes ago

Sources:
Google Flights ✓
Airline ✓
Hotel source ✓

[VIEW DEAL]

---

# 37. DISCOVER PAGE

Create a discovery experience where users can browse:

- best flight deals,
- best hotel deals,
- best complete trips,
- anywhere deals.

Filters:

- origin,
- destination region,
- dates,
- trip duration,
- cabin,
- budget,
- hotel quality,
- Deal Score.

---

# 38. ALERTS

Retain/use existing notification infrastructure wherever possible.

Required:

- email

Also retain/support where practical:

- Telegram
- ntfy
- webhook.

Each Watch Profile can configure:

- minimum Deal Score,
- maximum price,
- notification channels,
- cooldown,
- re-alert conditions.

Avoid notification spam.

Do not repeatedly notify for the same unchanged deal.

---

# 39. EMAIL CONTENT

A useful email should contain enough information to decide quickly.

Example:

EXTREME DEAL — 96/100

VIE → HND
Business
€1,087 return

Observed normal:
~€2,400

Dates:
9–18 November

Stops:
0

Airline:
...

Hotel:
...

Trip total:
...

Verified:
2 minutes ago

Confidence:
HIGH

Sources:
...

VIEW DEAL
BOOK DIRECT

---

# 40. ADMINISTRATION

Admin dashboard should show:

- workers,
- queue,
- scheduled jobs,
- last successful scrape per source,
- failed jobs,
- blocked/degraded sources,
- average execution time,
- database health,
- Redis health,
- Playwright health,
- OpenAI availability,
- OpenAI token usage,
- estimated OpenAI cost,
- alerts sent,
- discovery statistics.

Allow source adapters to be enabled/disabled from configuration.

---

# 41. OBSERVABILITY

Implement structured logs.

Every search job should have:

- job ID,
- user/watch profile,
- source,
- start time,
- duration,
- result count,
- error state.

Never log passwords, session secrets or API keys.

---

# 42. OPENAI

OpenAI API is allowed.

Implement it behind a provider abstraction.

Track:

- model,
- calls,
- input tokens,
- output tokens,
- estimated cost,
- failures.

Use deterministic code instead of AI whenever deterministic code is sufficient.

AI should enhance Traveller, not become a fragile dependency.

---

# 43. SECURITY

Perform a security review.

At minimum:

- secure password hashing,
- secure cookies,
- CSRF protection where relevant,
- authorization checks,
- per-user data isolation,
- rate limiting,
- secret encryption where appropriate,
- no secrets in logs,
- input validation,
- SSRF protection,
- safe URL handling,
- safe Playwright isolation,
- dependency audit.

Do not expose Playwright/browser debugging endpoints publicly.

---

# 44. DATA OWNERSHIP

Traveller's historical dataset is valuable.

Make backup/restore straightforward.

Provide documented backup for:

- PostgreSQL,
- configuration,
- required persistent data.

Historical observations should survive application upgrades.

---

# 45. TESTING

Add automated tests for important logic.

Especially:

- Deal Score,
- currency conversion,
- rating normalization,
- hotel review confidence,
- date flexibility,
- positioning calculations,
- Trip Deal Score,
- deduplication,
- alert suppression,
- user isolation,
- provider fallback.

Add integration tests for adapters where practical.

Do NOT require live third-party websites for the normal automated test suite.

Use fixtures/mocks.

---

# 46. DOCUMENTATION

Maintain:

`README.md`

and create at minimum:

`docs/ARCHITECTURE.md`

`docs/UPSTREAM.md`

`docs/SOURCES.md`

`docs/SCORING.md`

`docs/SCHEDULER.md`

`docs/DEPLOYMENT-SYNOLOGY.md`

`docs/BACKUP-RESTORE.md`

`docs/SECURITY.md`

`docs/ROADMAP.md`

Document source limitations honestly.

---

# 47. DO NOT FAKE DATA

Critical rule:

Never display generated/example values as if they were live prices.

Clearly distinguish:

- live,
- cached,
- historical,
- estimated,
- unavailable.

Never invent:

- flight prices,
- hotel prices,
- ratings,
- availability,
- verification status.

---

# 48. GRACEFUL DEGRADATION

Traveller must remain useful when individual providers fail.

Example:

Google Flights: healthy
Airline direct: healthy
Google Hotels: healthy
Booking: degraded
Skyscanner: disabled

Traveller continues operating.

Expose this status to administrators.

---

# 49. DEVELOPMENT STRATEGY

Do NOT attempt to implement everything simultaneously.

First perform discovery/audit.

Then produce:

1. Current upstream assessment
2. Reuse decision
3. Gap analysis
4. Proposed architecture
5. Database changes
6. Provider architecture
7. Scheduler architecture
8. Security implications
9. Migration strategy
10. Implementation phases

Then begin implementation.

Do not stop merely because the plan is complete.

Once the plan is internally consistent, proceed with implementation unless there is a genuinely blocking ambiguity requiring human input.

---

# 50. IMPLEMENTATION PHASES

Use approximately this sequence, adapting where technically justified.

## Phase 0
Repository audit and architecture.

## Phase 1
Fork/rebase foundation, Traveller branding, clean production Docker deployment.

## Phase 2
Multi-user hardening, i18n, preferences and Watch Profiles.

## Phase 3
Source adapter abstraction and adaptive scheduler.

## Phase 4
Flight Discovery / Anywhere.

## Phase 5
Flight price history and Flight Deal Engine.

## Phase 6
Multi-source flight verification.

## Phase 7
Hotel discovery, quality normalization and Hotel Deal Engine.

## Phase 8
Trip Engine and Trip Deal Score.

## Phase 9
Surprise Me.

## Phase 10
Notifications and polished deal emails.

## Phase 11
Admin observability and source health.

## Phase 12
PWA/mobile UX, performance, security review and production hardening.

Commit meaningful milestones separately.

---

# 51. IMPORTANT ENGINEERING PRINCIPLES

Prefer:

simple > clever

reliable > aggressive scraping

measured data > AI guesses

direct provider > unknown OTA

verified deal > more deals

maintainable adapter > hard-coded scraper

upstream compatibility > unnecessary rewrite

historical evidence > arbitrary thresholds

quality-adjusted hotel value > cheapest hotel

total trip value > flight price alone

---

# 52. SUCCESS CRITERIA

Traveller succeeds when a user can create:

Origins:

LJU
VIE
VCE
ZAG

Destination:

ANYWHERE

Travel:

next 12 months

Duration:

5–12 nights

Cabin:

Business

Hotel:

4–5 stars
good rating
strong review confidence

and then do NOTHING.

Traveller runs continuously.

Eventually the user receives an email such as:

🔥 EXTREME TRIP DEAL — 96/100

Vienna → Tokyo

Business return:
€1,087

5-star hotel:
€145/night
Booking rating 9.2

8-night trip:
€2,397 total

~48% below estimated normal trip cost

HIGH confidence

Verified from multiple sources recently.

The user opens Traveller, sees:

- exact flights,
- exact hotel,
- dates,
- price history,
- Deal Score explanation,
- verification sources,
- timestamps,
- booking links,

and can make the booking manually.

That is the product.

---

# 53. BEGIN NOW

Start by inspecting the CURRENT repository and current upstream Flight Finder.

Do not rely on assumptions about its implementation.

Inspect the code.

Then inspect relevant open-source alternatives.

Create the audit/gap analysis and architecture documents.

Determine what should be retained, extended, replaced, or newly implemented.

Then proceed into Phase 1 and subsequent implementation phases.

When you encounter an existing high-quality implementation, reuse it where licensing allows rather than rebuilding it.

When you encounter an architectural decision that does not require product-owner input, make the best engineering decision, document it, and continue.

Only stop and ask me when:

- credentials/secrets are required,
- an irreversible destructive action requires approval,
- licensing creates a genuine blocker,
- or a product decision has multiple materially different consequences that cannot reasonably be inferred from this specification.

Otherwise continue autonomously.

The objective is not a prototype.

Build **Traveller** as a maintainable, production-quality, self-hosted travel intelligence platform.