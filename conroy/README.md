# Conroy: AI receptionist for Jamaican small businesses

Steven Scale Solutions' add-on for client websites: an AI receptionist (default name **Conroy**, renamable per business) that answers the phone 24/7, replies on WhatsApp and website chat, books / reschedules / cancels appointments against live availability, takes messages, hands off to staff, sends payment links, and sends reminders.

**Status: Phase 1 (working MVP for the demo business, Tasha's Beauty Salon, Half Way Tree).** The schema and code are multi-tenant from day one; onboarding and super-admin screens come in Phase 2. See [PLAN.md](PLAN.md) and [DECISIONS.md](DECISIONS.md).

## What works today

| Channel / feature | Status |
|---|---|
| Phone (Retell AI): inbound webhook with per-call greeting (AI + recording disclosure), live knowledge base, custom functions for availability / booking / reschedule / cancel / messages / handoff / payment links, call events -> call log + transcript + owner WhatsApp summary | Built and tested with signed mock requests. Needs your Retell key and 876 number to go live (`npm run retell:sync`). |
| WhatsApp (Meta Cloud API, 360dialog adapter) | Built and tested with signed mock webhooks: Patois-aware replies, booking, STOP/START, "talk to a person" pauses the bot, 24-hour window, templates. Uses a console adapter until you add Meta credentials. |
| Website chat + booking widget (`/widget.js`) | Working end to end (checked in a real browser). |
| Calendar | Conroy's own calendar is the source of truth; Google Calendar (service account) and Cal.com providers mirror bookings and import busy time. |
| Payments | Fygaro / WiPay link templates per business, WhatsApp delivery, day 0 / 3 / 7 follow-ups, stop when marked paid. No card data ever touches Conroy. |
| Dashboard | Overview, bookings, inbox (staff replies), calls (transcripts), leads, payments, monthly report, all settings, privacy requests. |
| Jobs | pg-boss worker: reminders (24 h + 2 h), payment follow-ups, nightly retention purge. |
| Chat brain | Provider-agnostic: Anthropic (default `claude-haiku-5-5`), any OpenAI-compatible API, or `rules` (no LLM; keyword answers from the knowledge base). |

## Run it locally

Requirements: Node 20.11+ (22 recommended) and PostgreSQL 14+ (or Docker).

```bash
cd conroy
```

```bash
npm install
```

```bash
cp .env.example .env
```

Fill in `.env`: at minimum `DATABASE_URL`, `SESSION_SECRET` (`openssl rand -base64 36`), `DATA_ENCRYPTION_KEY` (`openssl rand -base64 32`) and `SEED_OWNER_PASSWORD` (10+ characters). Everything else can stay blank for a local demo: WhatsApp messages are logged instead of sent and the chat uses the `rules` engine.

No local Postgres? Start one with Docker:

```bash
docker run -d --name conroy-pg -e POSTGRES_USER=conroy -e POSTGRES_PASSWORD=conroy_dev -e POSTGRES_DB=conroy -p 5432:5432 postgres:16
```

Create the tables and load the demo salon:

```bash
npx prisma migrate deploy
```

```bash
npm run db:seed
```

Start the web app and the background worker together:

```bash
npm run dev
```

- Dashboard: http://localhost:3000 (sign in as `tasha@example.com` with your `SEED_OWNER_PASSWORD`)
- Demo client website with the widget: http://localhost:3000/demo/tashas-beauty-salon
- Health check: http://localhost:3000/api/health

To use a real LLM for chat, set `LLM_PROVIDER=anthropic` and `ANTHROPIC_API_KEY` (or `LLM_PROVIDER=openai`, `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `LLM_MODEL`).

## Test it

Unit tests need nothing; integration tests need a **separate, throwaway** Postgres database (it is truncated on every run). Set `DATABASE_URL_TEST` (default `postgresql://conroy:conroy_dev@localhost:5432/conroy_test`) and create the database once:

```bash
createdb -U conroy conroy_test
```

(With the Docker database: `docker exec conroy-pg createdb -U conroy conroy_test`.)

```bash
npm test
```

147 tests: phone normalisation (876/658), Jamaica time zone, public holidays with observed days, opening hours and lunch breaks, the slot engine, 45 Patois/Jamaican English phrases with expected intents, money formatting, encryption, tenant isolation (one business cannot read or change another's data), booking concurrency (no double booking), Retell and WhatsApp webhooks with signature checks, the LLM tool loop with a scripted model, and the public widget API.

Other checks:

```bash
npm run typecheck
```

```bash
npm run build
```

## Try the assistant by hand

- Widget: open the demo page, ask "unnu open today?", "how much fi a silk press?", "a weh unnu deh?", then use the **Book** tab.
- Retell custom function, simulating what the phone agent sends. For local poking only, set `RETELL_VERIFY_SIGNATURES=false` and leave `RETELL_FUNCTION_SECRET` blank in `.env`, then restart (never do this in production):

```bash
curl -s -X POST http://localhost:3000/api/retell/functions/check_availability -H 'content-type: application/json' -d '{"name":"check_availability","args":{"service":"silk press"},"call":{"call_id":"demo1","to_number":"+18765550123","from_number":"+18765550142"}}'
```

- Retell agent config preview (no API calls):

```bash
npm run retell:sync -- --business tashas-beauty-salon --dry-run
```

## Project layout

See [PLAN.md](PLAN.md#project-structure) for the annotated tree. In short: `src/lib` holds the domain (time, holidays, availability, booking, assistant tools, providers), `src/app/api` the webhooks and public API, `src/app/dashboard` the admin UI, `src/worker.ts` the job runner, `public/widget.js` the embeddable widget, `prisma/` the schema, migrations and seed.

## Security notes

- Secrets only in environment variables (`.env.example` lists and explains every one). Provider credentials stored per business are AES-256-GCM encrypted, as are transcripts, recording links and message bodies.
- Webhooks are verified: Retell (`x-retell-signature` HMAC with timestamp), Meta (`X-Hub-Signature-256`), 360dialog (secret URL token), plus replay protection.
- Passwords are hashed with scrypt; session tokens are stored hashed; login is rate limited; every admin change is audit-logged.
- Logs are structured JSON with secrets, message bodies and transcripts redacted.
