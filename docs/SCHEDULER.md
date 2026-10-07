# Adaptive scheduling

PostgreSQL retains profile due times, immutable request payloads, profile revisions, priority, attempts, start/duration/result counts and lease tokens. Scheduling uses serializable transactions and unique deduplication keys. Traveller job claims run under upstream's exclusive browser admission lock; they do not currently use a second `SKIP LOCKED` worker pool. Browser lifetime, heartbeat, cleanup, quarantine and lease generation are reused from upstream.

Defaults are DISCOVERY every three hours (180 minutes), WATCH hourly, HOT every ten minutes and COLD daily, with deterministic ±10% jitter and bounded exponential backoff. The connected runtime schedules broad DISCOVERY and recurring selected-flight and hotel checks; current measured scores determine candidate intervals. Changing the discovery interval makes active profiles due for reconsideration immediately, without modifying their constraints or revisions. Queued/running deduplication, source cooldowns and budgets still apply. Reaching the configured maximum consecutive failures disables the source until an administrator re-enables it. Invalid or ambiguous profile destinations fail that job without degrading the provider. CAPTCHA/access challenges stop requests; no alternate proxy retries.

Budgets count logical provider searches, not static images, assets or every internal XHR. Before opening the provider, an adapter atomically reserves its bounded workflow: Anywhere Explore one, named region Explore two, selected round-trip Google Flights three. Hotel adapters reserve their bounded search/detail workflow before navigation. Reserved units are not refunded on failure. Inter-job spacing applies to the workflow; units, UTC budget day and next slot are persisted across replicas and restarts. Enabling does not reset usage or waiting slots.

Explore rotates one origin, destination constraint and date/duration sample through the profile window at the configured discovery interval. Coverage is deliberately sampled; providers may return no inventory beyond their booking horizon. Native autocomplete resolves geographic names, and the resulting entity is checked against the provider URL. The individual-mode pump checks due work every minute after a ten-second start delay, unless `CRON_ENABLED=false`. Process-global start/pump promises prevent duplicate timers; database fencing handles multiple replicas. Redis failure cannot lose scheduled work or historical observations.

Dashboard and Watch Profiles display the next planned discovery time. Sources and workers shows recorded job counts, observations, scheduled and actual start times, source health, cooldowns and errors, refreshing every 30 seconds while visible. Times use the browser's time zone; daily provider budgets use UTC. The automatic-checks indicator reports configuration readiness, not a worker heartbeat. A future due time is a plan, not proof of execution; use actual job starts and outcomes to verify operation. A completed search with zero results is still a recorded check.

Logs include job ID, profile ID, source, start/duration, result count and classified outcome. Cancelled results are labelled cancelled, not provider failure. Never include credential values, raw session cookies, private notification URLs or page content containing personal information. Failed browser cleanup quarantines admission and requires verified recovery.

Access challenges disable the source immediately and require deliberate administrator re-enabling. Other transient failures retain bounded exponential backoff and the configured failure circuit.

Profile discovery cadence does not apply provider failure backoff a second time.
Provider cooldowns delay job execution through the persisted source request slot;
only one queued/running discovery is retained for each active profile. This keeps
recovered sources from inheriting an additional profile-level delay.

Discovery deduplication identifies the persisted profile due time, not a fixed
wall-clock sampling bucket. A fresh due time can therefore record another check
within the same bucket after jitter or an explicit cadence change. Concurrent
schedulers still use serializable compare-and-set updates and the pending-job
guard to create only one job.

Google can reject dates near the far end of a 365-day profile before it opens booking availability. The observed `Requested flight date is too far in the future` response is a profile search limitation, not evidence of a broken provider. It records a failed search with an explicit reason, retains the original travel window, consumes the reserved request budget and ordinary spacing, and does not increase provider failure backoff or disable the source. Later scheduled searches continue rotating dates. Access challenges and rate limits take precedence over this classification.

Consecutive discovery samples use a stride coprime to the number of available departure dates. This spreads checks across the travel window while retaining a complete cycle, instead of spending consecutive days on adjacent dates near the provider's unopened booking horizon. The sampler does not guess or impose a provider-specific maximum booking date and keeps the profile's duration, months and destination constraints.
