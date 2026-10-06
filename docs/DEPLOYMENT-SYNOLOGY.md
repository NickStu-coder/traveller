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
3. Create the first administrator locally, in a trusted NAS terminal: `docker compose -f docker-compose.traveller.yml exec web flight-finder-tui access setup`. The prompt does not echo the password. Individual mode is enforced; admission cannot select another user's profile.
4. Open the HTTPS origin and sign in. Invite members through administrator access; each chooses their own password. Save passkeys and recovery codes. The first-run AI configuration may require optional provider credentials for upstream AI-only extraction; unavailable AI must not be mistaken for valid zero-price results.
5. Configure email/Telegram/ntfy/webhook through existing encrypted notification configuration. Do not paste secrets into tracked files or chat.

## Existing Flight Finder data

Do not point this image at an existing database without a verified backup and a staging rehearsal. The committed baseline represents the audited upstream schema. Prisma will refuse a nonempty unbaselined database. Compare the actual schema to that baseline, account for custom indexes/constraints and legacy Sidedoor cutover fields, then explicitly mark the baseline applied with `prisma migrate resolve --applied 20261006000000_upstream_baseline` using the runtime config. Only after equivalence is confirmed should later migrations run. Never mark a migration applied merely to suppress an error.

Household credentials do not become isolated member credentials automatically. Use local administrator recovery and set individual credentials for every member before enabling Traveller. Existing household sessions must be revoked. Back up encrypted credential state and retain the same encryption secret. An unconverted access state fails closed.

## Updates and rollback

Back up, review migration compatibility, stop writers, deploy the tested digest and inspect logs/health/version. Preserve the previous image digest. Re-deploying it rolls back the app only; it does not undo database changes. Additive migrations are preferred. If the prior schema is incompatible, follow the rehearsed database restore procedure instead of deleting volumes.

Docker health checks report unhealthy status; restart policies alone do not automatically restart every unhealthy container. Monitor health in Portainer and alert on meaningful failures. Keep DSM/app access private until ownership and HTTPS checks pass. No production deployment has been performed by creating these files.
