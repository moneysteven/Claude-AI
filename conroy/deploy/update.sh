#!/bin/sh
# Deploy the latest code. Run on the VPS from the conroy/ folder:
#   sh deploy/update.sh
# Migrations run automatically (the "migrate" service) before the new app starts.
set -eu

echo "Backing up before the update..."
docker compose run --rm --entrypoint /bin/sh backup /usr/local/bin/backup.sh

echo "Fetching the latest code..."
git pull --ff-only

echo "Building and restarting..."
docker compose up -d --build

echo "Removing old images..."
docker image prune -f >/dev/null

sleep 10
docker compose ps
echo "Health:"
docker compose exec -T app node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>r.text()).then(t=>console.log(t))"
