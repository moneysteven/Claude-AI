# Deploying Conroy on a Hostinger VPS

What you end up with, all on one VPS:

```
Internet ──443/80──> Caddy (HTTPS, Let's Encrypt) ──> app (Next.js: dashboard, widget, webhooks)
                                                   └─> worker (reminders, WhatsApp replies, follow-ups, retention)
                                     db (PostgreSQL 16, private)  <── backup (pg_dump daily, 14 days kept)
```

Every piece is in `docker-compose.yml`. The same stack was built and run end to end while developing this guide (HTTPS, migrations, worker, backups and a restore).

Commands below are run on the VPS unless they say otherwise. Replace `app.stevenscalesolutions.com` with your real subdomain.

---

## 1. Buy the VPS

1. In Hostinger, buy a **KVM 2** VPS (2 vCPU, 8 GB RAM, 100 GB NVMe). KVM 1 (4 GB) works for the first few clients; KVM 2 leaves room for Docker builds and growth. Plans and prices change; check hostinger.com/vps-hosting.
2. Pick the data-centre location closest to Jamaica that Hostinger offers (a US East location if available).
3. During setup choose the operating system **Ubuntu 24.04 with Docker** (Docker and Docker Compose come preinstalled). If the VPS already exists: hPanel → **VPS → Manage → OS & Panel → Operating System**, search "Docker". Changing the OS wipes the server.
4. Set a strong root password and add your SSH public key when asked.
5. Note the VPS **IPv4 address** (hPanel → VPS → Overview).

## 2. Firewall (hPanel)

hPanel → **VPS → Security → Firewall** → create a configuration with these inbound rules, then activate it:

| Protocol | Port | Source | Why |
|---|---|---|---|
| TCP | 22 | your home/office IP if it's fixed, otherwise any | SSH |
| TCP | 80 | any | Let's Encrypt + redirect to HTTPS |
| TCP | 443 | any | HTTPS |
| UDP | 443 | any | HTTP/3 (optional) |

Everything else stays closed. The database is never published: only the other containers can reach it.

## 3. Point your domain at the VPS

In hPanel → **Domains → (your domain) → DNS / Nameservers**, add:

| Type | Name | Points to | TTL |
|---|---|---|---|
| A | `app` | the VPS IPv4 address | 3600 |

Check from your computer (it can take a few minutes to a few hours):

```bash
dig +short app.stevenscalesolutions.com
```

It must print the VPS IP before you start Caddy, or the certificate request fails (Caddy retries automatically, so a late DNS change just delays HTTPS).

## 4. Log in and prepare the server

```bash
ssh root@YOUR_VPS_IP
```

Create a normal user for day-to-day work and let it use Docker:

```bash
adduser deploy
```

```bash
usermod -aG docker deploy
```

```bash
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy
```

Log out and back in as `deploy`:

```bash
ssh deploy@YOUR_VPS_IP
```

Confirm Docker works:

```bash
docker compose version
```

Optional hardening once SSH keys work: set `PasswordAuthentication no` in `/etc/ssh/sshd_config`, then `sudo systemctl restart ssh`.

## 5. Get the code

The repository is private, so create a read-only **deploy key**: on the VPS run `ssh-keygen -t ed25519 -C conroy-vps` (no passphrase), copy `~/.ssh/id_ed25519.pub`, and add it in GitHub → repository → Settings → Deploy keys (read access only). Then:

```bash
sudo mkdir -p /opt/conroy && sudo chown deploy:deploy /opt/conroy
```

```bash
git clone git@github.com:moneysteven/Claude-AI.git /opt/conroy
```

```bash
cd /opt/conroy/conroy
```

(Use the branch you deploy from, e.g. `git checkout main` after the Conroy branch is merged.)

## 6. Configure `.env`

```bash
cp .env.example .env && chmod 600 .env
```

Generate secrets (run each, paste the output into `.env`):

```bash
openssl rand -hex 24
```

```bash
openssl rand -base64 36
```

```bash
openssl rand -base64 32
```

Edit with `nano .env` and set at least:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `APP_URL` | `https://app.stevenscalesolutions.com` |
| `APP_DOMAIN` | `app.stevenscalesolutions.com` |
| `ACME_EMAIL` | your email (Let's Encrypt notices) |
| `POSTGRES_PASSWORD` | output of `openssl rand -hex 24` (letters and digits only) |
| `SESSION_SECRET` | output of `openssl rand -base64 36` |
| `DATA_ENCRYPTION_KEY` | output of `openssl rand -base64 32` |
| `ALERT_EMAIL` + `SMTP_*` | where error and usage alerts go; also enables "Forgot your password?" emails |
| `JOBS_ENABLED` | `true` |
| `LLM_PROVIDER`, `ANTHROPIC_API_KEY` | `anthropic` + your key (or leave `rules` to start without an LLM) |
| Provider keys | Retell, WhatsApp, telephony, Google: see SETUP_PROVIDERS.md (can be added later; restart afterwards) |

`DATABASE_URL` in `.env` is ignored in Docker: compose builds it from `POSTGRES_PASSWORD`.

**Store a copy of `DATA_ENCRYPTION_KEY` somewhere safe outside the server** (a password manager). Transcripts, messages and provider credentials are encrypted with it; a backup restored without the same key is unreadable.

## 7. Start everything

```bash
docker compose up -d --build
```

The first build takes 5–10 minutes. Then:

```bash
docker compose ps
```

You want `db`, `app` and `worker` **healthy**, `caddy` and `backup` running, and `migrate` exited (it applies database migrations, then stops). Check the public health endpoint from your own computer:

```bash
curl -s https://app.stevenscalesolutions.com/api/health
```

Expect `"status":"ok"` with `"database":"ok"`, `"worker":"ok"` and `"backup":"ok"` (the backup service takes its first backup a minute after start).

## 8. Create your admin login

```bash
docker compose run --rm app node_modules/.bin/tsx scripts/create-admin.ts --email you@stevenscalesolutions.com --name "Steven"
```

It prints a one-time password. Sign in at `https://app.stevenscalesolutions.com/login`; you'll be asked to choose your own password, then land on `/admin`. From there, onboard your first client (ONBOARDING_A_CLIENT.md).

Optional, for demos only: load the fictional Tasha's Beauty Salon (uses 555-01xx numbers):

```bash
docker compose run --rm -e SEED_OWNER_PASSWORD='choose-a-long-password' app node_modules/.bin/tsx prisma/seed.ts
```

## 9. Monitoring

- **Uptime:** create a free UptimeRobot (or Better Stack) HTTP monitor on `https://app.stevenscalesolutions.com/api/health`, every 5 minutes, alerting your email/phone. It returns 503 when the database is down, the worker has stopped for 5+ minutes, or the newest backup is older than 26 hours.
- **Errors:** with `ALERT_EMAIL` and SMTP set, any unhandled server error, failing job, calendar/LLM outage and usage threshold emails you (throttled to one email per kind every 15 minutes).
- **Logs** (JSON, secrets and message text redacted):

```bash
docker compose logs -f --tail 100 app worker
```

```bash
docker compose logs -f caddy
```

## 10. Backups

What happens automatically:

- The `backup` service runs `pg_dump` every day at `BACKUP_AT` (default 03:45 Jamaica time) into `/opt/conroy/conroy/backups/`, keeping `BACKUP_KEEP_DAYS` (default 14) days. It also takes one straight away if the newest backup is more than a day old.
- Hostinger takes a free **weekly** backup of the whole VPS (hPanel → VPS → Backups); daily VPS backups are a paid add-on.

What you should add: an off-server copy. The simplest is a weekly copy to your own computer (run on your computer):

```bash
scp deploy@YOUR_VPS_IP:/opt/conroy/conroy/backups/$(ssh deploy@YOUR_VPS_IP 'ls -1t /opt/conroy/conroy/backups | head -1') .
```

or `rclone copy /opt/conroy/conroy/backups remote:conroy-backups` on the VPS with rclone configured for Google Drive or Backblaze B2 (run it from cron).

Take a manual backup any time:

```bash
docker compose run --rm --entrypoint /bin/sh backup /usr/local/bin/backup.sh
```

**Restore** (stops the app, takes a safety backup first, asks you to type RESTORE):

```bash
sh deploy/restore.sh backups/conroy_2026-11-10_0345.dump
```

Practise a restore every few months, ideally on a spare VPS.

## 11. Updating

```bash
cd /opt/conroy/conroy && sh deploy/update.sh
```

It backs up, pulls the latest code, rebuilds, runs migrations, restarts and prints the health check. Migrations only move forward: to undo an update that changed the database, check out the previous commit, run `sh deploy/update.sh`, and restore the backup the update took.

## 12. Troubleshooting

| Symptom | Check |
|---|---|
| Browser says the certificate is invalid / Caddy logs "challenge failed" | `dig +short` shows the VPS IP? Ports 80 and 443 open in the hPanel firewall? Then `docker compose restart caddy`. |
| `app` keeps restarting | `docker compose logs app`: "Invalid environment configuration" lists exactly which variable is missing or wrong. |
| Health shows `"worker":"stale"` | `docker compose logs worker`; `docker compose restart worker`. |
| Health shows `"backup":"stale"` | `docker compose logs backup`; disk space: `df -h` and `docker system df`. |
| Disk filling up | `docker image prune -f`, `docker builder prune -f`; keep fewer backups (`BACKUP_KEEP_DAYS`). |
| WhatsApp or Retell webhooks rejected (401) | The secret in `.env` doesn't match the provider dashboard. Logs say which check failed (never the secret). |

## 13. Security checklist

- [ ] `.env` is `chmod 600`, never committed, and `DATA_ENCRYPTION_KEY` is backed up in a password manager.
- [ ] hPanel firewall: only 22, 80, 443 open; SSH by key.
- [ ] `RETELL_VERIFY_SIGNATURES=true` (default) and every webhook secret set (SETUP_PROVIDERS.md).
- [ ] Uptime monitor and `ALERT_EMAIL` working (send yourself a test: stop the worker for 6 minutes and watch the monitor).
- [ ] Off-server backup copy scheduled; a restore has been practised.
- [ ] Your admin account uses a unique, long password; staff accounts are per person (Team page), never shared.
