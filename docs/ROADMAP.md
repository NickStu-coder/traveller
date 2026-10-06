# Implementation status

The master specification is in `BUILD-SPEC.md`. This ledger distinguishes delivered code from remaining work. No phase is production-verified until its runtime checks pass.

| Phase | Scope | Status |
| --- | --- | --- |
| 0 | Audit, licensing, upstream decision, gaps, architecture | Completed source inspection and design |
| 1 | Fork, branding, safe deployment/migrations | In progress |
| 2 | Individual users, i18n, preferences, Watch Profiles | Profile form/API, revision fencing, archive/history preservation and private channel API/UI implemented. Native individual access hardened. Slovenian core screens translated; upstream screens still use English fallback. Runtime integration pending. |
| 3 | Adapters and adaptive scheduler | Planned |
| 4 | Broad Flight Discovery / Anywhere | Planned; source behavior requires verification |
| 5 | History, currency and Flight Deal Engine | Deterministic money/statistics/scoring core implemented and unit-tested; ingestion pipeline pending |
| 6 | Live independent verification | Grouping/freshness/identity core implemented and unit-tested; live recheck adapters pending |
| 7 | Hotel quality and Hotel Deal Engine | Native-scale/review-count quality core implemented and unit-tested; upstream hotel integration pending |
| 8 | Complete Trip Engine and scoring | Party total, positioning, local stay dates and total-cost scoring core implemented and unit-tested; pairing pipeline pending |
| 9 | Surprise Me | Planned |
| 10 | Deal alerts and email content | Planned; reuse transports/outbox |
| 11 | Operational visibility | Planned; extend upstream admin |
| 12 | Responsive/PWA, security, production checks | Planned; retain existing PWA |

External prerequisites: Docker/PostgreSQL/Redis runtime for integration and deployment, a DSM HTTPS origin for passkeys, SMTP credentials for email, and optional OpenAI credentials for extraction paths that need it. Source access must be tested from the target network. No production credentials are present in this workspace.

The UI explicitly reports that automatic profile discovery is not enabled. Empty screens contain no example fares. SQL migrations are generated and inspected but not yet production-applied. A private Linux validation stack runs the complete suite without removing Unix-specific upstream tests.
