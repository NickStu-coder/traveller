#!/bin/sh
# Run from DSM Task Scheduler or a trusted NAS shell; no secret values in this file.
set -eu
umask 077

project=${TRAVELLER_BACKUP_PROJECT:-traveller-prod}
destination=${TRAVELLER_BACKUP_DIR:-/volume1/docker/traveller/backups}
case "$project" in ''|*[!a-zA-Z0-9_-]*) echo 'Invalid Compose project' >&2; exit 1;; esac
case "$destination" in /*) ;; *) echo 'Backup directory must be absolute' >&2; exit 1;; esac
[ "$destination" != / ] || { echo 'Refusing filesystem root' >&2; exit 1; }

container() {
  found=$(docker ps --filter "label=com.docker.compose.project=$project" --filter "label=com.docker.compose.service=$1" --format '{{.ID}}')
  [ "$(printf '%s\n' "$found" | awk 'NF {n++} END {print n+0}')" = 1 ] || {
    echo "Expected exactly one running $1 container for $project" >&2; return 1;
  }
  printf '%s\n' "$found"
}
database=$(container db)
web=$(container web)
mkdir -p "$destination"
destination=$(cd "$destination" && pwd -P)
[ "$destination" != / ] || { echo 'Refusing resolved filesystem root' >&2; exit 1; }
if [ ! -f "$destination/.traveller-backups" ]; then
  [ -z "$(ls -A "$destination")" ] || { echo 'Refusing a nonempty unrecognized backup directory' >&2; exit 1; }
  printf 'Traveller backup directory\n' > "$destination/.traveller-backups"
fi
chmod 700 "$destination"
# mkdir is an atomic host-wide lock, including concurrent DSM/manual invocations.
lock="$destination/.backup-lock"
mkdir "$lock" || { echo 'Another backup is running; do not remove its lock blindly' >&2; exit 1; }
scratch=
cleanup() {
  if [ -n "$scratch" ]; then docker exec "$web" rm -f "$scratch" >/dev/null 2>&1 || true; fi
  rmdir "$lock"
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM
pending=$(mktemp -d "$destination/.incomplete.XXXXXX")
stamp=$(date -u +%Y%m%dT%H%M%SZ)
name="traveller-$stamp-$(basename "$pending" | cut -d. -f3)"

docker exec "$database" sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$pending/database.dump"
[ -s "$pending/database.dump" ]
docker exec -i "$database" pg_restore --list < "$pending/database.dump" > "$pending/database.contents"
# Decode every archive data block without connecting to or modifying a database.
docker exec -i "$database" pg_restore --file=/dev/null < "$pending/database.dump"
docker inspect "$web" --format '{{.Config.Image}}' > "$pending/image.txt"
docker exec "$web" curl -fsS http://127.0.0.1:3003/api/version > "$pending/version.json"

# The native SQLite online backup preserves WAL data without stopping writers.
candidate="/app/data/.traveller-backup-$name.db"
sqlite=$(docker exec "$web" node -e '
const fs=require("node:fs"), Database=require("better-sqlite3");
const source=process.env.ANALYTICS_DB_PATH || "/app/data/analytics.db", target=process.argv[1];
if (!fs.existsSync(source)) { console.log("absent"); process.exit(0); }
if (fs.existsSync(target)) throw new Error("Backup scratch already exists");
const db=new Database(source,{readonly:true,fileMustExist:true});
db.backup(target).then(()=>{
  db.close(); const copy=new Database(target,{readonly:true,fileMustExist:true});
  const valid=copy.pragma("quick_check",{simple:true});copy.close();
  if(valid!=="ok") throw new Error("SQLite backup validation failed");
  console.log("saved");
}).catch(()=>{db.close();console.error("SQLite backup failed");process.exitCode=1;});
' "$candidate")
case "$sqlite" in
  saved) scratch=$candidate; docker cp "$web:$scratch" "$pending/analytics.db";;
  absent) ;; # No analytics database has been created yet.
  *) echo 'Unexpected SQLite backup result' >&2; exit 1;;
esac
printf 'format=1\nproject=%s\ncreated_utc=%s\nanalytics=%s\n' "$project" "$stamp" "$sqlite" > "$pending/manifest.txt"
(cd "$pending" && sha256sum database.dump database.contents image.txt version.json manifest.txt > checksums.sha256)
if [ "$sqlite" = saved ]; then (cd "$pending" && sha256sum analytics.db >> checksums.sha256); fi
[ ! -e "$destination/$name" ] || { echo 'Snapshot destination already exists' >&2; exit 1; }
mv "$pending" "$destination/$name"
printf 'Verified backup: %s\n' "$destination/$name"
# Keep prior snapshots. Retention is an explicit operator policy, never an implicit deletion.
