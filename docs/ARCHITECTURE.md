# Traveller architecture

Traveller extends the existing Next.js/TypeScript monorepo. PostgreSQL owns users, profiles, observations, verification, scheduled work and alert state. Redis supports caching and rate limiting; it must not be the only copy of history. Playwright provides isolated short-lived browser contexts. OpenAI is an optional extraction enhancement behind the existing provider registry.

## Domain flow

A user creates an owner-scoped Watch Profile with multiple origins, destination scope, travel window, duration range, passengers, cabin, hotel constraints, positioning and notification policy. A bounded discovery job asks broad-capability sources for candidates. Candidates are validated against the profile, normalized and saved with provenance. Comparable historical observations supply median/percentile evidence. Interesting candidates undergo an exact recheck. Independent sources can raise confidence only when they confirm the same itinerary/occupancy, currency and price basis. A trip pairs compatible flight arrival/departure dates with a hotel stay and includes positioning costs. Alerts use a persisted outbox and suppression state.

## Database changes

Keep upstream tables. Add WatchProfile with required owner and validated versioned constraints; normalized observation with original/base Decimal amounts, FX metadata, comparison identity, provider timestamp and provenance; source state with budgets/backoff; scheduled work with deduplication and fenced leases; verification evidence; deal/alert state. Enforce ownership in queries and foreign keys. Removing a profile deactivates work; it must not delete price history. Avoid Float for new money fields.

## Provider architecture

Flight and hotel adapters expose explicit discovery/exact/verification capabilities. Do not promise capability that the source cannot verify (passengers, premium cabin, return price, occupancy or cancellation). Reuse upstream hotel and airline URL/parser implementations. Skyscanner official API stays disabled until access exists. Provider failures update operational state and leave other providers running.

## Scheduler

Use PostgreSQL atomic claims and persisted next-run times. Browser work must share the upstream travel admission mechanism, not compete invisibly with its workers. DISCOVERY/WATCH/HOT/COLD are persisted intent with configurable intervals. Request budgets apply per actual source request, including retries/details. Blocking stops a source; no CAPTCHA solving. See `SCHEDULER.md`.

## Security and migration strategy

Native Sidedoor individual access is the authority; each user has their own password/passkeys/recovery codes. Traveller must reject household profile switching and cannot derive admin authority from a selected profile. Owner checks occur on every mutation and background commit. Existing installations require backups, a schema-equivalence check and explicit migration baselining. Fresh installations apply all migrations normally. See `SECURITY.md` and `BACKUP-RESTORE.md`.

## Truthful UI

Every amount carries live/cached/historical/estimated provenance and observation time. Absence of evidence displays unavailable. Empty dashboards must not contain seeded example fares. A booking URL identifies its provider; search links are not guaranteed ticket availability. UI strings use next-intl, with Slovenian and English for Traveller features.

## Deployment boundary

GitHub stores code, CI verifies it, GHCR stores immutable images, Portainer manages runtime, DSM terminates HTTPS, PostgreSQL and volumes retain data, and an independent backup process protects them. Production is separate from DEV. Exact deployed revision and image digest must remain identifiable.
