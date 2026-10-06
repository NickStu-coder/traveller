# Validation evidence

Evidence recorded on 2026-10-06. Production has not been deployed; none of these checks establishes production SMTP, passkeys behind DSM or off-NAS backup retention.

## Tested source and runtime

Commit `a4c4d6dcf26be3f353b9f2a1063c661b2fd20a78`, tree `230314ec8f731704ec42199750fb306da1d698d4`, passed the complete `npm run ci` gate in the isolated Linux validation container on the intended Synology host. This includes zero-warning lint, strict TypeScript, web/CLI unit tests and production builds. Additional conditional checks passed: five PostgreSQL suites with eight tests; seven real guarded-browser tests; seven individual-account browser steps; and five access-preparation Python tests. The original upstream-to-platform credential cutover test also passed separately with PostgreSQL.

The individual browser workflow exercises local first-owner enrollment, Watch Profile creation, Gmail defaults and encrypted secret storage, owner/member isolation, administrator and Origin boundaries, persistent Slovenian selection, nine private surfaces at 390px and 1280px, individual password login and logout revocation. No email is sent by this workflow. The operations screenshots from this revision captured the initial client loading state; a subsequent test change explicitly awaits loaded source controls and worker recovery before taking those screenshots.

All 2,032 English and Slovenian message keys match. ICU parsing, parameter names and formatting tags were checked. Six actual next-intl translators also passed the literal command-placeholder regression test. `npm audit --omit=dev` reported zero known production dependency vulnerabilities across 445 production dependencies.

GitHub confirmed the same commit's individual surfaces, account lifecycle, shared access, PostgreSQL, installer smoke, complete hotel integration and desktop checks. The disposable Docker integration additionally passed exact-image staging, browser smoke and fresh local/LAN/HTTPS installer workflows. Its historical installer upgrade remains in progress at this record's creation. The principal CI job exposed an old-brand HTML fixture in the Python deployment safety tests; the fixture is corrected to match the real Traveller response without removing safety assertions. This correction still needs its complete publication gate. No GHCR production digest is claimed yet.

## Actual source evidence

Ordinary-browser checks from the target network returned actual Google Explore destinations and a selected Google round-trip itinerary. Google remains one underlying source and cannot establish independent high confidence by itself. A Google Hotels workflow returned seven whole-stay seller offers for OKKO Hotels Paris Porte De Versailles, with property-scoped quality and review count. Earlier Hôtel Monte Cristo evidence also passed its whole-stay context checks. These are observations at their capture time, not promises of continuing inventory.

Lufthansa's captured cart fixture verifies both legs, segment cabins, party and fare details. On the target network, direct airline navigation encountered an access challenge and stopped. Booking also encountered an access challenge and remains disabled; no verified Booking price was obtained. A transient Booking challenge redirect is now detected immediately, with browser cleanup and failure classification covered by regression tests. No CAPTCHA or technical access restriction was bypassed.

## Data durability and isolation

Five additive Prisma migrations applied successfully and a repeated deployment reported no pending migrations. PostgreSQL integration checks cover ownership, stale revision rejection, cancellation, source budgets, immutable observation preservation, complete-party trip pairing, measured alert deduplication and selected private delivery channels. Tests use dedicated disposable databases with no production data.

A PostgreSQL 16 custom-format dump and restore retained one individual owner, one Watch Profile, one encrypted private notification channel and all five migration records. Restored original password login, logout and channel decryption passed with the original test encryption key. See [backup and restore](BACKUP-RESTORE.md). Production storage and off-NAS backup scheduling still require deployment configuration.
