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
