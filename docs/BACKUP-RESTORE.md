# Backup and restore

Back up PostgreSQL, encrypted provider/access configuration, application persistent data and deployment environment/secret values. Named volumes survive container replacement; they are not a backup. Keep encrypted off-NAS copies and periodically restore them into an isolated test stack.

## PostgreSQL backup

From a trusted shell with the stack environment available:

```sh
mkdir -p backups
chmod 700 backups
docker compose -f docker-compose.traveller.yml exec -T db \
  pg_dump -U traveller -d traveller -Fc > backups/traveller.dump
test -s backups/traveller.dump
docker compose -f docker-compose.traveller.yml exec -T db \
  pg_restore --list < backups/traveller.dump > backups/traveller.contents
```

Check command exit codes before uploading a backup. The database dump contains sensitive user data and encrypted credentials. Back up encryption secrets separately with restricted access; a dump without the corresponding secret may be unusable.

The application `appdata` volume holds analytics SQLite. Stop application writers before a filesystem copy, or use SQLite's online backup mechanism. Record volume names with `docker compose volumes`/Portainer and back up configuration through the secret manager. Redis contains disposable caches; durable history and work must remain in PostgreSQL.

## Restore rehearsal

Create a separate stack/project/database and different port. Disable cron and outbound notifications before starting the restored app so the rehearsal does not alert real users. Restore to an empty test database using the same PostgreSQL major version:

```sh
docker compose -p traveller-restore-test -f docker-compose.traveller.yml exec -T db \
  pg_restore -U traveller -d traveller --no-owner --exit-on-error < backups/traveller.dump
```

Do not use `--clean` against a production database. Restore appdata and encryption secrets to the test stack; deploy the backup's recorded image digest first. Verify user isolation, representative observation counts/history, migrations, credential decryption, health and a login. Record restore duration and date. Only a successful rehearsal confirms restore capability.

## Production incident

Stop writers, preserve the current database and logs, identify the backup/image pair, and rehearse restore on separate storage. Replacing production data is destructive and requires explicit operator approval. Never run `docker compose down -v`, delete a persistent volume, or reset Prisma in an attempt to fix deployment.

Production backup existence and restore capability are not yet confirmed. NAS access has been supplied; validation runs only in separate disposable databases and cannot establish the backup status of future production volumes.

## Recorded isolated rehearsal

On 2026-10-06, the dedicated PostgreSQL 16 validation container successfully created a custom-format `pg_dump`, validated its archive contents and used `pg_restore --no-owner --exit-on-error` into a newly created `traveller_restore_rehearsal` database. Restored counts were one individual owner, one private Watch Profile, one encrypted notification channel and five completed migrations. The application then verified original password login, session logout/revocation, profile ownership and decryption with the original test encryption key. No mail was sent. This rehearsal contained disposable test fixtures, not production user data or off-NAS production backups.

## Dedicated Synology backup directory

The requested NAS-local destination is `/volume1/docker/traveller/backups`, outside the application volume. Paste the complete reviewed `scripts/traveller/backup-synology.sh` into a DSM Task Scheduler user-defined script and schedule it once daily. Its defaults select the production stack and this folder. Alternatively, save the script as a root-owned file, mode 0700, inside a directory writable only by root, and run it from a trusted NAS shell with:

```sh
TRAVELLER_BACKUP_PROJECT=traveller-prod \
TRAVELLER_BACKUP_DIR=/volume1/docker/traveller/backups \
sh /root/traveller-backup-synology.sh
```

The DSM task needs access to Docker; use the NAS administrator's reviewed Task Scheduler configuration. A root task must not execute a script writable by other NAS users. Task code stored directly in the administrator-only DSM scheduler avoids that shared-folder dependency. The script selects exactly one running database and web container by their Compose project and service labels. It uses the existing database credentials inside the database container, never a secret written into the task. It creates a PostgreSQL custom-format dump, checks its archive contents and decodes every data block to `/dev/null` without connecting to a database, records the actual image and version, and uses the existing SQLite online backup API to retain committed analytics WAL data without stopping writers. If no analytics database exists, the manifest explicitly records that absence. The backup directory is private (mode 700), and checksums cover the exported files.

An atomic lock prevents concurrent backups. Only a fully checked snapshot is renamed from `.incomplete.*` to `traveller-*`. Failed exports and existing snapshots are preserved. No old backup is deleted automatically: define retention explicitly after choosing disk capacity and an independent backup destination. Monitor DSM task failures, free space and the age of the latest completed snapshot. A stale lock after power loss needs operator investigation before removing it.

Keep `ADMIN_SESSION_SECRET` and the deployment environment separately in private storage. The locally generated `C:\Users\Nejc\.codex\secrets\traveller-production.env` must be preserved; a database backup cannot decrypt its credentials without the original encryption secret. The backup job intentionally does not copy secrets from container inspection into logs or archives. Current application persistent data is the analytics SQLite database; add explicit backup coverage when introducing additional upload or document storage.

A folder on the same NAS protects against application mistakes and replacement of its Docker volumes. It does not establish recovery from NAS loss. An off-NAS copy, retention policy and a production restore rehearsal are still operator configuration. The host script's boundary tests verify private snapshots, checksum validation, failed-export preservation, exact container selection, concurrent-job refusal and explicit absent-analytics handling. Actual production scheduling remains pending DSM access.
