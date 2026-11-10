#!/bin/sh
# Conroy database backups (runs in the "backup" container).
#   backup.sh          take one backup now
#   backup.sh --loop   take one now if none from the last day, then every day at $BACKUP_AT
# Backups: ./backups/conroy_YYYY-MM-DD_HHMM.dump (pg_dump custom format), kept $BACKUP_KEEP_DAYS days.
set -eu

KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
AT="${BACKUP_AT:-03:45}"

backup_once() {
  stamp=$(date +%Y-%m-%d_%H%M)
  file="/backups/conroy_${stamp}.dump"
  # Write to a temp name first so a half-written file is never mistaken for a backup.
  pg_dump --format=custom --no-owner --no-privileges --file="${file}.partial"
  mv "${file}.partial" "$file"
  chmod 600 "$file"
  find /backups -name 'conroy_*.dump' -type f -mtime +"$KEEP_DAYS" -delete
  find /backups -name '*.partial' -type f -mmin +120 -delete
  echo "$(date '+%Y-%m-%d %H:%M') backup ok: $file ($(du -h "$file" | cut -f1))"
}

if [ "${1:-}" != "--loop" ]; then
  backup_once
  exit 0
fi

echo "backup service: daily at $AT (Jamaica time), keeping $KEEP_DAYS days"
# Catch up straight away if the newest backup is more than a day old (new server, long outage).
last_day=""
if [ -z "$(find /backups -name 'conroy_*.dump' -type f -mmin -1440 2>/dev/null | head -n 1)" ]; then
  backup_once || echo "backup FAILED" >&2
  last_day=$(date +%F)
fi
while true; do
  today=$(date +%F)
  now=$(date +%H:%M)
  if [ "$now" = "$AT" ] && [ "$last_day" != "$today" ]; then
    backup_once || echo "backup FAILED" >&2
    last_day="$today"
  fi
  sleep 20
done
