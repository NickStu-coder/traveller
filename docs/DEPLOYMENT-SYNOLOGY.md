# Synology and Portainer deployment

Use `docker-compose.traveller.yml` for a private instance. It retains PostgreSQL, Redis and application data in named volumes scoped by the Compose project. It publishes only the app on loopback; database, Redis and browser debugging have no published ports. Use different project names, ports and secrets for DEV and PROD.

## Prerequisites

Requested target: Portainer `http://10.24.52.208:9000/`; public origin `https://traveller.flynimbus.synology.me`. Authenticated inspection confirmed endpoint 3, host Flynimbus, Linux x86_64, Synology kernel 4.4.302+, Docker 24.0.2/API 1.43, four CPU cores and 33.6 GB RAM. No existing Traveller stack was found. A separate validation stack has no published ports or host volumes. Production has not been deployed.

This host rejects Compose `cpus`/NanoCPUs because CPU CFS scheduling is unavailable. Do not put a hard CPU quota in its stack. Limit worker concurrency in the application and use memory limits verified on this host. The production Compose does not use NanoCPUs.

A compatible Synology CPU, Container Manager/Docker, Portainer, enough memory for Chromium, and a DSM HTTPS reverse proxy. Build and verify an image from the Traveller fork; an upstream Flight Finder image does not contain Traveller changes. Enter configuration directly into Portainer's stack environment or a secret manager. `.env.traveller.example` documents names and safe placeholders; it is not usable credentials.

Set `TRAVELLER_IMAGE` to `ghcr.io/nickstu-coder/traveller@sha256:<verified-manifest-digest>`. Confirm its OCI revision label and `/api/version` match the tested commit. Set persistent random `ADMIN_SESSION_SECRET` and `CRON_SECRET` (32 random bytes each), a strong URL-safe database password, and `APP_URL` to the public HTTPS origin. Pin PostgreSQL/Redis digests after target architecture testing. Never use `latest` as the only production identity.

## Fresh installation

1. Create a stack from `docker-compose.traveller.yml`, enter environment values and deploy. Startup applies committed Prisma migrations and stops on failure; no data-loss acceptance is used.
2. Configure DSM reverse proxy: public `https://traveller.example.com:443` to `http://127.0.0.1:3003`. Forward Host and `X-Forwarded-Proto: https`; use a valid certificate. If Portainer is on a different host, it must not attempt to reach that loopback address.
3. Generate a short-lived first-administrator claim locally, in a trusted NAS terminal: `docker compose -f docker-compose.traveller.yml exec web flight-finder-tui access setup`. Open `/access` on the configured HTTPS origin and enter the claim. The administrator enters and submits their own password in that browser. Individual mode is enforced; admission cannot select another user's profile.
4. Open the HTTPS origin and sign in. Invite members through administrator access; each chooses their own password. Save passkeys and recovery codes. The first-run AI configuration may require optional provider credentials for upstream AI-only extraction; unavailable AI must not be mistaken for valid zero-price results.
5. Configure email/Telegram/ntfy/webhook through existing encrypted notification configuration. Do not paste secrets into tracked files or chat.

## Existing Flight Finder data

Do not point this image at an existing database without a verified backup and a staging rehearsal. The committed baseline represents upstream commit `608eb42d7775f238ae1a7cf0b437a814091460c3`. Prisma will refuse a nonempty unbaselined database. Stop writers. If legacy credential columns remain, run `access prepare` with the reviewed image and original encryption secret before changing those columns. This preserves credentials in the shared vault. Review and apply a schema difference against the audited baseline on a restored staging copy first; account for custom indexes and constraints. Verify row preservation and exact schema equivalence before explicitly marking the baseline applied with `prisma migrate resolve --applied 20261006000000_upstream_baseline` using the runtime config. Only then deploy later migrations and finalize the cutover. `scripts/travel-migration-test.mjs` rehearses this sequence on a dedicated disposable database; it is not a production migration command. Never mark a migration applied merely to suppress an error.

For fresh databases, committed schema migrations run before access initialization. Repeated startup verifies the existing access state and applies only pending migrations. Startup never creates an untracked state table ahead of the initial baseline.

Household credentials do not become isolated member credentials automatically. Use local administrator recovery and set individual credentials for every member before enabling Traveller. Existing household sessions must be revoked. Back up encrypted credential state and retain the same encryption secret. An unconverted access state fails closed.

## Updates and rollback

Back up, review migration compatibility, stop writers, deploy the tested digest and inspect logs/health/version. Preserve the previous image digest. Re-deploying it rolls back the app only; it does not undo database changes. Additive migrations are preferred. If the prior schema is incompatible, follow the rehearsed database restore procedure instead of deleting volumes.

Docker health checks report unhealthy status; restart policies alone do not automatically restart every unhealthy container. Monitor health in Portainer and alert on meaningful failures. Keep DSM/app access private until ownership and HTTPS checks pass. No production deployment has been performed by creating these files.

## Gmail alerts

Preferences: private notification channels defaults to email with `smtp.gmail.com:587` and required STARTTLS (implicit TLS unchecked). Enter your full Gmail address and a Google app password privately in Traveller. Leaving sender and recipient blank uses that same address for both. The password is encrypted at rest and never returned by the channels API. Use Send test notification on your enabled private channel, then check your Gmail inbox and spam folder. A successful response confirms service acceptance; only inbox receipt confirms delivery. Test sending is limited to once per owner every 30 seconds and requires the stack's Redis limiter. Google app passwords require 2-Step Verification and may be unavailable under some account policies: https://support.google.com/mail/answer/185833. SMTP settings: https://support.google.com/mail/answer/7104828. No SMTP credentials have been configured or messages sent during development.
