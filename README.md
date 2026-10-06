# Traveller

Traveller extends [Flight Finder](https://github.com/affromero/flight-finder) into a private, multi-user travel discovery and price-monitoring application for Synology and Portainer. The upstream MIT license and attribution are retained. The audited foundation is commit `608eb42d7775f238ae1a7cf0b437a814091460c3` (package 0.15.0).

## Current implementation

- Native individual accounts, passwords, secure sessions, optional passkeys, recovery codes and single-use administrator invitations.
- Private flight history and mutations, private notification recipients, and account revocation that preserves ownership rather than making trackers global.
- Watch Profiles with multiple airports, Anywhere/region/destination constraints, flexible dates, cabin and party allocation, hotel quality constraints, positioning estimates and alert preferences.
- Versioned edits, concurrency checks and archiving that retains observations and audit revisions.
- Deterministic currency conversion, robust daily price medians/percentiles, hotel rating/review confidence, verification freshness/independence and complete-party trip totals.
- English and Slovenian screens with matching message keys, responsive layout and a PWA that excludes private pages and API responses from its cache.
- Additive PostgreSQL migrations, persistent volumes, health checks, an immutable-image deployment template and backup/restore instructions.

Active Watch Profiles schedule bounded broad discovery and recurring checks through a persistent PostgreSQL queue. Observations feed flight and hotel history, complete-trip pairing, measured deal scores, Surprise Me and private alerts. Statistical alerts require sufficient measured history; newly installed instances show their warming state without example fares. Source blocking and unavailable independent evidence limit verification confidence. See [implementation status](docs/ROADMAP.md) and [validation evidence](docs/VALIDATION.md).

The retained upstream flight, hotel and car tracker interfaces remain available. Some upstream flight extraction paths require an optional AI provider. Traveller's statistics, scheduling design and scoring do not require AI or paid travel-data APIs.

## Development

Use Node 22 or newer and npm workspaces:

```sh
npm ci
npm run db:generate
npm run db:migrate
npm run dev
```

Supply `DATABASE_URL` and `REDIS_URL` through the process environment. Use a dedicated development PostgreSQL database. Never run development resets against production. Individual Traveller access requires `SELF_HOSTED=true` and `TRAVELLER_AUTH_MODE=individual`; local account initialization uses the retained `npm run cli -- access setup` command. See the deployment guide for the preparation/finalization sequence.

Run `npm run ci` before committing and pushing. It includes lint, strict TypeScript checks, unit tests and both builds. Some upstream fixtures require Linux; an isolated Linux validation container is used from this Windows workspace. Database tests additionally require a dedicated `traveller_test` database and `TRAVELLER_DATABASE_TESTS=1`.

## Synology deployment

Use [docker-compose.traveller.yml](docker-compose.traveller.yml) with values described in [.env.traveller.example](.env.traveller.example). Enter actual secrets directly in Portainer. Publish only the application through DSM HTTPS; keep PostgreSQL, Redis and browser endpoints private. Production requires a tested GHCR image digest, not an upstream Flight Finder image or an unverified `latest` tag.

Target: `https://traveller.flynimbus.synology.me`, Portainer at `http://10.24.52.208:9000/`. Production has not been deployed. Follow [deployment](docs/DEPLOYMENT-SYNOLOGY.md) and [backup/restore](docs/BACKUP-RESTORE.md) before using real data.

Existing installations need a verified backup, a schema-equivalence check, explicit migration baselining and individual credential migration. Startup uses `prisma migrate deploy` and stops on errors. It does not accept data loss.

## Documentation

- [Audit and licensing](docs/AUDIT.md)
- [Upstream merge strategy](docs/UPSTREAM.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Sources and limitations](docs/SOURCES.md)
- [Scoring](docs/SCORING.md)
- [Scheduler](docs/SCHEDULER.md)
- [Security](docs/SECURITY.md)
- [Implementation status](docs/ROADMAP.md)
- [Validation evidence](docs/VALIDATION.md)
- [Original upstream README](docs/README-UPSTREAM.md)

## License

MIT. Original Flight Finder copyright and license are preserved in [LICENSE](LICENSE).
