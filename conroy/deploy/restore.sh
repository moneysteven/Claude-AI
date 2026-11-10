#!/bin/sh
# Restore the Conroy database from a backup file. Run on the VPS from the conroy/ folder:
#   sh deploy/restore.sh backups/conroy_2026-11-10_0345.dump
# The app and worker are stopped during the restore and started again afterwards.
set -eu

FILE="${1:-}"
if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "Usage: sh deploy/restore.sh backups/conroy_YYYY-MM-DD_HHMM.dump"
  echo "Available backups:"
  ls -1t backups/conroy_*.dump 2>/dev/null | head -n 20 || true
  exit 1
fi

printf "This REPLACES the current database with %s. Type RESTORE to continue: " "$FILE"
read -r answer
[ "$answer" = "RESTORE" ] || { echo "Cancelled."; exit 1; }

echo "Taking a safety backup of the current database first..."
docker compose run --rm --entrypoint /bin/sh backup /usr/local/bin/backup.sh

echo "Stopping app and worker..."
docker compose stop app worker caddy

echo "Restoring..."
docker compose exec -T db pg_restore --clean --if-exists --no-owner --no-privileges -U conroy -d conroy < "$FILE"

echo "Applying any newer migrations and starting again..."
docker compose up -d
echo "Done. Check: docker compose ps   and   curl -s https://\$APP_DOMAIN/api/health"
