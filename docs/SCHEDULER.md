# Adaptive scheduling

PostgreSQL stores due time, work kind, priority, attempts and claim generation. Atomic `FOR UPDATE SKIP LOCKED` claims prevent duplicate execution; a generation token prevents expired workers committing after reclamation. Profile changes invalidate old work. Deactivation stops new work and fences running commits.

Default intentions: DISCOVERY every 6 hours, WATCH hourly, HOT immediate verification followed by a 10-minute recheck, COLD daily. Administrators can configure intervals within enforced bounds. Add jitter without moving due times into the past. Source errors use bounded exponential backoff. CAPTCHA/access-denied responses stop requests and mark the source blocked; never retry through alternate proxies.

Budgets count actual outgoing requests, including retries and hotel detail pages. A shared atomic source budget applies across users/workers; cache identical searches to avoid consuming it repeatedly. Hot work has priority but cannot evade the budget. Persist source status and next eligible time so restarts do not reset limits.

Reuse upstream browser admission and fenced travel jobs where possible. Redis cache loss cannot lose scheduled work or historical observations. The upstream three-hour timer is not, by itself, completion of this adaptive scheduler.

Logs include job ID, profile ID, source, start/duration, result count and classified failure. Never include credential values, raw session cookies, private notification URLs or page content containing personal information.
