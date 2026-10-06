# Traveller upstream audit

Audited 2026-10-06. The workspace was empty; no existing application or production database was modified. Repository metadata came from GitHub's API and implementation findings from checked-out source, not feature marketing. See `UPSTREAM.md` for the exact foundation commit.

## Decision

Use Flight Finder as the foundation. Its MIT license permits modification and redistribution while retaining the copyright and license notice. Keep the existing workspace names, CLI, Prisma models and reusable travel infrastructure. Traveller is a downstream product, not a rewrite. A public fork exists at https://github.com/NickStu-coder/traveller.

## Projects considered

| Repository | License / last push | Inspected implementation and useful functionality | Reuse decision |
| --- | --- | --- | --- |
| https://github.com/affromero/flight-finder | MIT; 2026-10-04; latest release v0.15.0, 2026-09-11 | Next.js 16, React 19, TypeScript, PostgreSQL, Prisma 7, Redis, Playwright; shared access and AI credential vault; durable travel jobs with fenced leases; flights, Google Hotels and Booking; PWA; notifications; REST API | Reuse foundation and retain upstream notice. Change household authentication and unsafe schema deployment. |
| https://github.com/affromero/sidedoor | MIT; installed core/react packages 0.3.4 | Already integrated: individual credentials, passkeys, recovery codes, invitations, persisted sessions, principal management, provider credentials | Reuse installed library; enable individual access instead of building another authentication system. |
| https://github.com/wallouo/flight-radar | MIT; 2026-10-01 | TypeScript, PostgreSQL migrations, RSS deal extraction, fingerprinted alerts, persistent jobs; `src/logic/fare-ranking.ts`, `src/jobs/scheduler.ts` inspected | Adapt concepts only. Its normal-fare pipeline requires SerpAPI and key pools; incompatible with mandatory-zero-paid-data requirement. No code imported. |
| https://github.com/isdscuba/Flight-Price-Tracker | MIT; 2026-04-24 | Firebase scheduled functions, Telegram, Python `fast_flights` and `fli` service; `functions/index.js`, `functions-python/main.py` inspected | Adapt failure isolation concept. Do not import Firebase architecture. Two Google implementations are not independent fare verification. |
| https://github.com/ckm1268-cell/FlightsPricingTracker | No license detected; 2026-10-05 | Travelpayouts cached-price API, route alternatives, historical comparison, email/Telegram; source tree and `track_prices.py` inspected | No code reuse without a license. Concepts only. Cached affiliate fares cannot establish live premium-cabin availability. |
| https://github.com/jongan69/hotels | MIT; 2026-08-14 | `fast-hotels`: Python protobuf filters, HTML extraction, blocking detection; `fast_hotels/core.py` inspected | Keep upstream TypeScript hotel parsers. Python implementation disables TLS verification (`verify=False`); do not adopt that behavior or add a second runtime solely for it. |
| https://github.com/factden/google-hotels-scraper | MIT repository; 2026-09-07 | Repository contains field documentation, examples and Apify invocation snippets; scraper implementation is not included | Adapt schema ideas only. An MIT wrapper does not make the hosted actor a free self-hosted source. |
| https://github.com/ethanasm/vacation-price-tracker | No license detected; 2026-10-01 | README and source tree describe combined flights/hotels, Temporal and Skiplagged MCP | No code reuse. Avoid relying on an unaudited third-party MCP endpoint as the core data source. |

Push dates show activity, not correctness or sustainable provider access. Repository licenses do not grant permission to scrape external websites. Provider access must respect restrictions and stop when challenged.

## Current upstream assessment and gaps

| Area | Actual foundation | Traveller requirement / action |
| --- | --- | --- |
| Authentication | Self-hosted household admission; everyone admitted can select the first owner profile. Individual mode exists in Sidedoor but the self-hosted UI forces household mode. | Enforce individual mode with native credentials, existing passkeys and recovery. Prevent switching back to household in Traveller. |
| Ownership | Nullable owners, public/delete-token legacy routes, admin exceptions; durable jobs validate ownership and leases | Traveller routes always require a principal and filter by owner. Audit legacy endpoints before publishing. |
| Data deployment | No committed Prisma migrations; startup runs `db push --accept-data-loss`; SQL travel constraints applied separately | Commit baseline and additive migrations. Run `migrate deploy`; explicit baseline procedure for existing installations, never silently reset. |
| Flights | Exact routes, multi-route expansion, near-date grids, premium cabin validation, airline direct/Google fallback | Add persistent Watch Profiles and broad discovery; never exhaustively expand 365 dates against every airport. |
| Hotels | First-class Google/Booking search and tracking, deterministic page context/rate extraction, occupancy, taxes, room/rate identity | Reuse; add review counts, original rating scale, quality-adjusted scoring, price comparison groups and trip matching. |
| History | Snapshot tables and query-linked history; deleting queries cascades snapshots; unvisited-query cleanup deletes after 24 hours | Disable automatic destructive cleanup for Traveller and preserve observations separately from profile lifecycle. |
| Scheduler | In-process three-hour timer and jitter; per-tracker intervals; durable jobs/leases and outbox already exist | Persist per-source budgets, next run, priority, backoff and fencing. Reuse existing resource admission for browser work. |
| Notifications | Email, Telegram, ntfy, webhook; encrypted configuration, SSRF checks, delivery outbox and dedupe | Retain transports. Add score/confidence/cooldown rules and complete trip content; avoid unverified alerts. |
| Community | Opt-in hub synchronization and route APIs; cached observations | Use as historical/cached candidate evidence, not live availability or an independent verification source. Sharing remains opt-in. |
| AI | Codex, OpenAI, Anthropic, Google and local providers; credential registry, usage ledger; flights rely on AI extraction | Keep optional registry; deterministic discovery/parser paths and cached history must work without AI. Report unsupported extraction explicitly. |
| i18n | next-intl, cookie language, five locale dictionaries and key-parity tests | Extend with Slovenian. English fallback must not be claimed as a completed Slovenian translation. |
| PWA | Manifest, mobile styles, static-asset service worker | Retain; replace product branding and never cache user API responses or private HTML. |
| Deployment | Non-root multistage image, health check; production Compose has author-specific credential mounts, default password, `latest`; image publication uses artifacts for digest exchange | Separate Synology Compose with mandatory secrets and image digest, persistent storage and no CLI credential mounts. Registry publication must not depend on artifact quota. |
| Security | Existing CSRF, secret encryption, safe imports, rate limits and job fencing; stealth browser code | Preserve defenses; no CAPTCHA bypass, no paid proxies. Review identity, SSRF and source blocking boundaries. |

## Initial security evidence

`npm audit` reported high-severity transitive advisories for `fast-uri` and `source-map-js` on the initial lockfile. Apply compatible patch updates and rerun the audit; do not use a major-upgrade blanket fix. Production readiness also requires running Docker/database/browser checks, not merely compiling TypeScript.

## Implementation order

1. Establish safe downstream identity, migrations, individual access and portable deployment.
2. Add owner-scoped Watch Profiles, preferences and Slovenian/English Traveller screens.
3. Add normalized observations, adapters and persistent adaptive scheduling.
4. Connect broad discovery, exact verification, historical scoring, hotels and complete trips.
5. Add alerts, operational views and end-to-end production verification.

Phase completion is recorded in `ROADMAP.md`; planned behavior is not a claim that it is already implemented.
