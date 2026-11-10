# Conroy: build plan

## Phases

| Phase | Scope | Status |
|---|---|---|
| **1. MVP for one business** | Tasha's Beauty Salon end to end: voice (Retell), WhatsApp, web chat + booking widget, calendar, payments links, reminders, dashboard, Jamaica specifics, privacy basics, tests | **Done** |
| **2. Multi-tenant operations** | Guided onboarding wizard (creates tenant, knowledge base, owner login, Retell agent from template; gives widget snippet + forwarding codes); super-admin console (all businesses, usage per business, plans Lite / Starter / Growth with included minutes + overage, enable/disable, internal notes); business switcher; team accounts with roles and one-time passwords; forced password change; per-business WhatsApp/360dialog and calendar connection screens with tests; usage alerts at 80% / 100%; Twilio/Telnyx signed webhooks for carrier minutes; holiday rule editor | **Done** |
| 3. Hardening, tests, docs | Docker Compose (app, worker, Postgres, Caddy + Let's Encrypt), daily DB backups, DEPLOY_HOSTINGER.md, SETUP_PROVIDERS.md, ONBOARDING_A_CLIENT.md, cost-tracking note, privacy notice + data-processing clause templates, Playwright end-to-end tests in CI, load/abuse testing, error-alert tuning, magic-link login option | Next |

## Project structure

```
conroy/
├── prisma/
│   ├── schema.prisma          # all tables (multi-tenant: businessId on every business-owned row)
│   ├── migrations/            # SQL migrations (prisma migrate)
│   └── seed.ts                # Jamaican holiday rules + Tasha's Beauty Salon demo
├── public/widget.js           # embeddable chat + booking widget (vanilla JS, Shadow DOM, ~6 KB gzipped)
├── scripts/retell-sync.ts     # create/update a business's Retell LLM + agent; import its 876 number
├── src/
│   ├── worker.ts              # pg-boss worker: queued jobs + cron (reminders, payment follow-ups, retention)
│   ├── app/
│   │   ├── api/
│   │   │   ├── health/                     # uptime check (app + DB)
│   │   │   ├── retell/inbound|webhook|functions/[name]   # voice
│   │   │   ├── whatsapp/meta|360dialog     # WhatsApp webhooks
│   │   │   └── public/[slug]/config|chat|services|availability|bookings   # widget API (CORS + rate limits)
│   │   ├── admin/             # super admin (Steven): businesses, onboarding wizard, usage & billing, plans, holidays
│   │   ├── account/           # change your own password (forced after a temporary password)
│   │   ├── api/telephony/twilio|telnyx   # signed carrier webhooks (minute reconciliation)
│   │   ├── dashboard/         # business admin UI (server components + server actions), incl. settings/team
│   │   ├── demo/[slug]/       # stand-in client website with the widget embedded
│   │   ├── p/[slug]/privacy/  # generated privacy notice for the assistant
│   │   └── login/
│   ├── components/Flash.tsx
│   └── lib/
│       ├── env.ts, db.ts, logger.ts, crypto.ts, http.ts, ratelimit.ts
│       ├── tenant.ts          # tenantDb(businessId): Prisma extension that scopes every query
│       ├── phone.ts           # 876/658 normalisation to E.164
│       ├── time.ts            # America/Jamaica helpers (UTC in DB, Jamaica on screen)
│       ├── holidays.ts        # Jamaican public holidays, Easter maths, observed-day rules
│       ├── hours.ts           # opening hours, lunch breaks, overrides, holidays, "open now"
│       ├── availability.ts    # pure slot engine (staff schedules, time off, buffers, lead time)
│       ├── money.ts           # J$ formatting, optional US$ display
│       ├── intents.ts         # Patois / Jamaican English intent detection + guide for the LLM
│       ├── safety.ts          # emergency numbers (110 / 119), clinic guardrails
│       ├── knowledge.ts       # knowledge base text built from dashboard data (shared by voice + chat)
│       ├── booking/service.ts # create / reschedule / cancel with advisory locks (no double booking)
│       ├── calendar/          # CalendarProvider: internal, Google (service account), Cal.com
│       ├── assistant/         # tools (shared by voice + chat), system prompt, chat engine, rules engine
│       ├── llm/               # LlmProvider: Anthropic SDK, OpenAI-compatible
│       ├── retell/            # signature check, voice variables, call lifecycle, agent template
│       ├── whatsapp/          # Meta / 360dialog / console adapters, templates, inbound, 24h window
│       ├── payments/          # Fygaro / WiPay link templates, follow-up schedule
│       ├── notify/            # booking messages, reminders, owner call summaries, staff alerts, email alerts
│       ├── privacy/           # retention purge, export / erase a person's data
│       └── jobs/              # pg-boss queue + handlers
└── tests/
    ├── unit/                  # pure logic (incl. 45 Patois phrases)
    └── integration/           # real Postgres: tenant isolation, booking, Retell, WhatsApp, LLM loop, widget API
```

## Database schema (summary)

All times UTC; all money integer cents; `*Enc` columns encrypted. Full definitions in `prisma/schema.prisma`.

| Area | Tables | Notes |
|---|---|---|
| Tenant | `Business` | Profile, assistant name/greeting/tone, booking rules, retention days, widget colours + allowed origins, Retell agent + 876 number, WhatsApp provider + phone_number_id, calendar provider (encrypted config), plan |
| People + access | `User`, `Session`, `AuditLog` | Roles SUPER_ADMIN / OWNER / MANAGER / STAFF; hashed session tokens; audit of every change |
| Hours | `BusinessHours`, `DateOverride`, `HolidayDefinition`, `HolidayOverride`, `BusinessHolidaySetting` | Weekly hours with lunch break; one-off closures / special hours; platform-wide holiday rules (fixed, Easter offset, nth weekday, observed rules) with per-year corrections; per-business open/closed per holiday |
| Catalogue | `Service`, `Staff`, `StaffService`, `StaffSchedule`, `StaffTimeOff`, `Faq`, `Policy` | J$ prices ("from" prices, deposits), durations + buffers; who does what; staff hours default to business hours |
| Customers | `Contact`, `Conversation`, `Message` | One contact per phone per business; WhatsApp opt-out + last inbound time (24h window); bot/human status per conversation |
| Activity | `CallLog`, `Booking`, `Lead` | Calls with outcome, after-hours flag, encrypted transcript/recording/summary; bookings with short reference (TB-7K4P) and reminder flags; leads with urgency |
| Payments | `PaymentLinkTemplate`, `PaymentRequest` | URL templates with placeholders; follow-up counter; paid/cancelled |
| Metering | `UsageEvent` | Voice seconds, carrier seconds, WhatsApp in/out (session vs template), web chats, LLM tokens; `dedupeKey` makes webhook retries safe |
| Plans | `PlanDefinition`, `UsageAlert` | Lite / Starter / Growth prices, included minutes and messages, overage rates (editable); one alert per business, month, metric and threshold |
| Idempotency | `WebhookReceipt` | Provider + delivery id; duplicates and replays are ignored |

## Demo business: Tasha's Beauty Salon (seeded)

- **Where:** Shop 7, Demo Plaza, Half Way Tree Road, Half Way Tree, Kingston & St. Andrew (fictional; phone numbers use the 555-01xx fiction range).
- **Hours:** Mon 10-6; Tue-Thu 9-6 and Fri 9-7 with lunch 1:00-1:30; Sat 8-2 (half day); Sun closed. Closed on public holidays except Ash Wednesday. Christmas Eve and Old Year's Day half days.
- **Team:** Tasha (owner, senior stylist, Tue-Sat), Keisha (braider/stylist, Mon-Sat), Shanice (nails & brows, Wed-Sat).
- **Services (J$):** Wash & Set 3,500; Silk Press 6,500; Trim 2,000; Relaxer Touch-up from 7,000; Box Braids from 15,000 (J$5,000 deposit, link sent automatically); Cornrows from 4,500; Gel Manicure 3,000; Spa Pedicure 4,000; Eyebrow Shaping 1,500.
- **FAQs / policies:** walk-ins, parking, braiding hair, children, payment methods, silk press care, products, lateness; 24-hour cancellation, deposits, 15-minute grace, children with an adult.
- **Payment links:** Fygaro deposit + full payment, WiPay invoice (demo URLs; replace with the salon's real links).
- **Assistant:** "Conroy", Jamaican English tone. Voice greeting: "Good morning, you've reached Tasha's Beauty Salon. I'm Conroy, the salon's AI assistant. This call may be recorded to help us serve you. How can I help?"

## How a request flows

- **Phone:** caller -> (Digicel/Flow forward) -> your +1 876 number (Twilio/Telnyx SIP) -> Retell -> `POST /api/retell/inbound` (agent + live knowledge base + greeting) -> conversation, Retell calls `/api/retell/functions/*` for real availability and bookings -> transfer to `handoffNumber` if asked -> `call_ended` / `call_analyzed` -> call log, minutes metered, owner gets a WhatsApp summary with a dashboard link.
- **WhatsApp:** Meta -> `POST /api/whatsapp/meta` (signature checked, duplicates dropped) -> job queue -> STOP/START, paused-for-staff check, safety rules -> LLM with the same tools -> reply (free text inside 24h).
- **Website:** `widget.js` -> `/api/public/{slug}/chat` (same engine) or the booking flow (`services` -> `availability` -> `bookings`) -> WhatsApp confirmation template.

## Phase 2: how onboarding works

1. Steven signs in (super admin) and opens **Onboard a business**. The wizard has 10 steps (business, contacts & owner, hours & holidays, staff, services & J$ prices, FAQs & policies, assistant, payment links, calendar & plan, review). Picking a business type offers typical hours and services (prices stay blank: the owner gives them). Answers are saved in the browser as you go.
2. On **Create**, the server validates everything at once (phone numbers, hours, prices, payment links must be https, staff named in services exist, owner email unused) and points back to the exact field if something is wrong.
3. In one database transaction it creates the business, hours, holiday choices, staff + schedules, services + who does them, FAQs, policies, payment links, calendar settings and the owner's login (one-time password, must be changed at first sign-in).
4. It then creates the Retell LLM + agent from the template (if `RETELL_API_KEY` is set). A voice failure never undoes the business; retry from the business page.
5. The launch screen shows the owner's temporary password once, the widget snippet with platform-specific instructions, the Digicel/Flow forwarding codes for their number, and what's left (WhatsApp number registration, calendar sharing, tests).

Afterwards, each business has an admin page: status (onboarding / active / disabled), plan, usage this month, voice agent re-sync and 876 number connection, WhatsApp and calendar connections with "send test" buttons, the people with access, internal notes and recent activity.
