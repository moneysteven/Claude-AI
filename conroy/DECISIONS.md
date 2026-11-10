# Decisions and defaults

Choices made where the brief left room. Each can be revisited; the reason is noted so you can judge.

## Project and stack

1. **Lives in `conroy/` inside this repo.** The repo already holds the hardware-store site; Conroy is a separate app with its own `package.json`, so neither affects the other.
2. **Next.js 16 (App Router), React 19, Prisma 6, zod 4, pg-boss 10, Vitest 5.** Next 16 / zod 4 / Vitest 5 because the older majors had open security advisories at build time. **Prisma stays on 6.19**: the only advisory is in the Prisma CLI's config loader (not shipped at runtime), and Prisma 7 changes the client setup substantially; upgrade in Phase 3.
3. **No CSS framework.** One small stylesheet keeps the dashboard fast on modest phones and the build simple. Light and dark mode follow the device.
4. **Separate worker process** (`src/worker.ts`) runs jobs and cron; the web app only enqueues. With `JOBS_ENABLED=false` (tests) jobs run inline.

## Multi-tenancy and security

5. **Multi-tenant schema from day one**, even in Phase 1: every business-owned table has `businessId`, and all app code goes through `tenantDb(businessId)`, a Prisma extension that ANDs the business scope onto every query and refuses cross-tenant creates. Integration tests prove one business can't read or change another's rows.
6. **Encrypted at rest (AES-256-GCM):** call transcripts, summaries, recording links, chat/WhatsApp message text, per-business provider credentials. Phone numbers stay in plain text because bookings, opt-outs and WhatsApp routing need exact lookups; they are masked in logs.
7. **Dashboard login:** email + password (scrypt), 12-hour sessions, only the token's SHA-256 stored, login rate limited (5 per account / 20 per IP per 15 minutes). Magic-link login can be added in Phase 3.
8. **Roles:** OWNER and MANAGER can change settings; STAFF handle bookings, inbox, calls, leads, payments; SUPER_ADMIN (Steven) sees every business.
9. **Rate limiting is in-memory per process.** Fine for one app container on a VPS; switch to a shared store if you run several app replicas.
10. **360dialog doesn't sign webhooks**, so its webhook URL carries a secret token (`DIALOG360_WEBHOOK_TOKEN`) that is checked in constant time.
11. **Retell custom functions** are checked twice: Retell's `x-retell-signature` and our own `X-Conroy-Function-Secret` header set in the agent template.
12. **Caller identity:** on calls and WhatsApp the customer's number comes from caller ID / the WhatsApp sender, never from what the model says. Changing or cancelling a booking requires that number to match the booking (website chat: booking reference + phone).

## Voice

13. **One Retell agent per business**, built from a template by `npm run retell:sync`. The prompt is injected per call by the inbound webhook (`{{assistant_instructions}}`), so edits in the dashboard (FAQs, prices, hours, holidays) take effect on the next call without re-syncing. A snapshot is saved as the agent's default variables in case the webhook is unreachable.
14. **The opening line always includes the AI disclosure and recording notice.** If a business writes its own greeting without them, they are appended automatically.
15. **Retell voice model defaults to `claude-5.5-haiku`** (`RETELL_LLM_MODEL`), the same model family as chat, so behaviour matches across channels. Any model in Retell's list works.
16. **Transfers are cold transfers to `handoffNumber`** with a 25-second ring; if nobody answers, the agent takes a message. Warm transfer can be switched on per agent later.
17. **STT language `en-US` with boosted keywords** (business name, services, staff, common Patois). Retell has no Jamaican English locale; the prompt carries a Patois guide.

## WhatsApp

18. **Reminders, confirmations outside the 24-hour window, payment links and owner summaries use approved UTILITY templates** (defined in `src/lib/whatsapp/templates.ts`; create them in WhatsApp Manager with the same names). Inside the 24-hour window, free text is used because it reads more naturally. (Since Meta's 1 October 2026 pricing change, utility templates are charged even inside the window and free-form replies are charged after a monthly free allowance, so the cost difference is now small; see COST_TRACKING.md.)
19. **STOP** opts the customer out of all business-initiated messages (reminders, payment follow-ups). If they message the business again, the assistant still answers them (they started the conversation). **START** opts back in.
20. **"Talk to a person"** (or a complaint / emergency) pauses the bot for that conversation and WhatsApps the owner + handoff number via the `staff_alert` template. Staff reply from the dashboard inbox; replying keeps the bot paused until someone clicks "Resume assistant".
21. **Voice notes and photos** get a polite "please type your message" reply for now (transcribing voice notes is a candidate Phase 3 feature; Jamaicans send a lot of them).
22. **First message in a new WhatsApp conversation** includes the AI notice, privacy link and opt-out hint.
23. **Default provider is `console`** (logs metadata only) so the whole system runs before Meta approval.

## Chat brain

24. **Default chat model: Claude Haiku 5.5 (`claude-haiku-5-5`)** via the official Anthropic SDK, effort `low` (short replies, low latency and cost), static prompt cached. Swap with `LLM_PROVIDER`/`LLM_MODEL` (any OpenAI-compatible API works).
25. **Hard rules run before the model:** emergencies (110 ambulance/fire, 119 police) and "talk to a person" never depend on the LLM.
26. **`rules` engine** answers from the knowledge base without any LLM (hours, prices, location, policies, FAQs, availability, messages, handoff). It is the fallback if the LLM errors, and the default for local demos and tests.
27. **History:** the last 20 messages of the conversation are sent as plain text; tool calls and thinking are only kept within a single reply.

## Booking and calendar

28. **Conroy's database is the source of truth for bookings.** Google Calendar / Cal.com mirror Conroy bookings (so staff see them) and contribute busy time (owner blocks a morning). If the calendar is unreachable during a call, Conroy still offers times from its own data and emails an alert, rather than failing the call.
29. **Google Calendar uses one platform service account**; each business shares its calendar with that email ("Make changes to events"). No per-business OAuth consent screen or Google verification needed. Cal.com uses a per-business API key (encrypted).
30. **No double booking:** a Postgres advisory lock per staff member (or per business when there are no staff) wraps the conflict check and insert. Tested with concurrent requests.
31. **Defaults:** 30-minute slot grid, 60-minute minimum notice, bookings up to 60 days ahead, 90-day retention. All per business in Settings.
32. **Staff choice:** "anyone available" assigns the least-booked free stylist that day. A staff member with no schedule rows follows the business hours.
33. **Website bookings are confirmed immediately** and the confirmation (with reference) is sent by WhatsApp; the customer must tick a consent box. A honeypot field and per-IP limits (5 bookings / 10 min) block bots. If abuse appears, Phase 3 can add a WhatsApp "reply YES to confirm" step.
34. **Booking references** look like `TB-7K4P`: business initials + 4 characters without look-alikes (0/O, 1/I/L).

## Jamaica specifics

35. **Time:** stored in UTC, shown and spoken in America/Jamaica. Callers abroad are told "Jamaica time"; the widget sends the browser's time zone so the assistant can add "(3:30 PM your time)".
36. **Holidays:** rules stored in the database (`HolidayDefinition`), editable by the super admin, with per-year overrides for gazetted changes. Observed-day defaults: Sunday -> Monday for New Year's, Emancipation, Independence, Christmas, Boxing Day; Labour Day weekend -> Monday; a collision pushes the later holiday forward (Christmas on Sunday: Mon 26 and Tue 27). Please confirm these with each year's official list.
37. **Phones:** 7-digit numbers get the default area code (876, configurable to 658). Both 876 and 658 are recognised as Jamaican. International numbers are accepted as E.164.
38. **Money:** J$ in whole dollars ("J$4,500"); optional US$ display using an admin-set rate (J$ per US$1), for tourist-facing businesses.
39. **Patois:** understood (intent rules + LLM guide); replies in clear Jamaican English. "Light Patois" tone only adds touches like "Wah gwaan!" / "Bless up" in greetings and sign-offs.

## Payments

40. **Links only.** Each business stores Fygaro/WiPay link templates with placeholders (`{amount}`, `{reference}`...). Links must be https. Follow-ups go on day 0, 3 and 7 and stop as soon as staff mark the request paid. Automatic payment confirmation (provider webhooks) is not in scope because each merchant's Fygaro/WiPay account setup differs; staff mark payments as paid.
41. **Deposits:** when a service has a deposit and the business has a DEPOSIT link, the deposit link is sent automatically after booking.

## Privacy

42. **Retention:** transcripts, recordings links, summaries and message text are deleted nightly (03:15 Jamaica) after the business's retention period (default 90 days); call metadata (time, length, outcome) is kept for billing and reports. The Retell agent's own data retention is set to the same number of days.
43. **Subject requests:** the dashboard exports everything held for a phone number as JSON and can erase it (bookings are kept but anonymised for the business's records).
44. **Clinics:** the assistant only books and routes; it never suggests diagnoses or treatment and sends urgent symptoms to staff with the emergency numbers.
45. **The generated privacy notice is a template** to adapt with a lawyer; businesses can point `privacyNoticeUrl` at their own.

## Phase 2: multi-tenant operations

46. **Onboarding is a browser wizard with one server submit.** The whole form is validated on the server in one pass and every problem is returned with its field path, so the wizard can mark each field and jump to its step. Drafts live in the browser (localStorage) until submitted; nothing half-finished reaches the database. A server-side draft table can be added if you onboard from several devices.
47. **Tenant creation is one transaction.** Business, hours, holidays, staff, schedules, services, FAQs, policies, payment links, calendar settings and the owner login are created together or not at all. The Retell agent is created *after* the transaction: a Retell outage must not block onboarding, and it can be retried from the business page.
48. **Business types have presets** (typical hours, service names and durations, common questions). Prices are never pre-filled; a service without a price is described as "price on consultation".
49. **Web address (slug)** comes from the business name ("Marcus' Barber Shop" -> `marcus-barber-shop`); a duplicate name gets `-2`, `-3`.
50. **New businesses start Active** by default; untick "Go live now" to create them in Onboarding status (widget and assistant work for testing, but no reminders are sent and they don't count as live in totals).
51. **One-time passwords instead of invite emails.** SMTP is optional, and owners here live on WhatsApp, so the system shows a temporary password once (`Conroy-XXXX-XXXX`) for Steven or the owner to send by WhatsApp. It never goes in a URL or a log, and the user must choose their own password at first sign-in. Other sessions are signed out on every password change or reset.
52. **Roles:** owners manage anyone in their business, managers can add and reset staff only, and nobody but the super admin can create a super admin. A business always keeps at least one active owner.
53. **Disabling a business** pauses everything that faces customers (calls get a short "not available" message, the widget disappears, WhatsApp and reminders stop) and signs its users out. Data is kept, and re-activating restores everything.
54. **Plans and prices live in the database** (`PlanDefinition`), editable in /admin/plans. The defaults (Lite J$7,500 / 60 min / 500 messages, Starter J$15,000 / 200 / 1,500, Growth J$30,000 / 600 / 4,000, overage J$30-40 per minute and J$3-4 per message) are placeholders for you to tune against your real costs. Nothing charges anyone automatically; /admin/usage (with CSV export) is the basis for your invoices.
55. **Billing month = calendar month in Jamaica time.** Call minutes are each call rounded up to the next minute (how carriers bill). "WhatsApp messages" counts what you send (replies + templates), because that's what Meta charges for.
56. **Usage alerts:** an hourly job emails Steven and WhatsApps the owner when a business passes 80% and 100% of its included minutes or messages, once per month per threshold.
57. **Carrier webhooks are optional reconciliation.** Retell's minutes drive billing. If you point Twilio's status callback or Telnyx's call webhooks at `/api/telephony/*`, carrier minutes are recorded per business (signature-checked: Twilio HMAC-SHA1 including the port variants Twilio's own SDK accepts; Telnyx Ed25519 with a 5-minute window) and shown next to Retell's for comparison.
58. **WhatsApp and calendar connections are set by the super admin**, not the owner, because they involve platform tokens and Meta business verification. Secrets are encrypted and never shown again; leaving a secret field blank keeps the saved value. "Send test" buttons prove the connection end to end (a real template to the owner; a real calendar read).
59. **Voice agent re-sync** happens automatically when the business name, assistant name or handoff number changes (those shape the agent itself); prices, hours and FAQs need no re-sync because they're injected on every call.
60. **Holiday rules** are edited in /admin/holidays (name, observed-day rule, on/off, per-year gazetted dates). The web app picks changes up at once; the worker within 5 minutes.

## Phase 3: hardening, deployment, tests

61. **One Docker image** runs the web app, the worker and migrations (`docker-compose.yml`), behind **Caddy** for automatic Let's Encrypt HTTPS (simpler to run than Nginx + certbot). `prisma`, `tsx` and `retell-sdk` moved to runtime dependencies because the container runs migrations, the worker and voice provisioning. Compose runs every Node service with `init: true` for clean shutdowns.
62. **Backups:** a `backup` sidecar runs `pg_dump` daily at 03:45 Jamaica time (TZ `EST5` = UTC-5 all year, no tzdata needed), keeps 14 days, and starts only after migrations so it never backs up an empty database. The app mounts the folder read-only so `/api/health` can report backup age. Restore and update scripts take a safety backup first. Off-server copies are recommended in the deploy guide; the encryption key must be stored separately because backups are useless without it.
63. **Health has two scopes:** `/api/health?scope=app` (app + database) for Docker's healthcheck, and `/api/health` (also worker heartbeat < 5 minutes and newest backup < 26 hours) for uptime monitors, so a dead worker or failed backup pages you without making Docker restart a healthy web app.
64. **Content Security Policy with a per-request nonce** on every page (`src/proxy.ts`), `strict-dynamic`, `frame-ancestors 'none'`, `form-action 'self'`. Inline *styles* stay allowed (React style attributes); call recordings may stream from https storage. API routes and `widget.js` are excluded (they aren't pages; the widget runs under the client website's own policy).
65. **Cookies in production use the `__Host-` prefix** (Secure, host-only, path `/`), httpOnly and SameSite=Lax.
66. **Unhandled errors** anywhere (pages, server actions, API routes) are logged as JSON and emailed via Next's `onRequestError` hook; query strings are stripped from what's logged because webhook URLs can carry tokens.
67. **"Forgot your password?"** emails a one-time sign-in link (20 minutes) when SMTP is configured. Opening the link needs a button press (a POST), so email scanners that pre-open links can't use it up. The person must then set a new password (no old password needed for 30 minutes after a link sign-in). The answer is identical whether or not the email has an account. Without SMTP the page says so and points to owner/Steven resets.
68. **Telnyx is the recommended carrier** for the 876 number: Twilio's Jamaica page currently says it has no voice-enabled Jamaican numbers. With `TELEPHONY_PROVIDER=telnyx`, the transfer tool sends the `X-Telnyx-Username` header Retell's Telnyx guide requires.
69. **360dialog webhooks** are registered from the business page via 360dialog's `/v1/configs/webhook` API, with the shared secret in a custom header (360dialog doesn't sign client webhooks). A `?token=` URL is still accepted for manual setups.
70. **Meta Graph API default `v26.0`** (v27.0 was announced in November 2026; versions live about two years).
71. **Payment links follow each provider's documented options:** Fygaro links take `amount`, `client_reference` and `client_note`; WiPay "pay me" links have no documented pre-fill, so they're sent as-is with the amount and reference in the WhatsApp message.
72. **End-to-end tests** (Playwright) run against a production build with their own database (`conroy_e2e`, wiped by truncation each run; Prisma's `migrate reset` is deliberately not used). They cover widget chat and booking through to the dashboard, onboarding and the forced password change, security headers and access control, keyboard use, a phone-sized screen, and **axe WCAG 2.1 AA scans that fail on serious or critical issues** (one found a real bug: the booking form's labels weren't linked to their inputs; fixed).
73. **CI** (`.github/workflows/conroy-ci.yml`) runs typecheck, unit + integration tests against a Postgres service, the production build, the end-to-end suite, and a separate job that builds the real production Docker image and validates the compose file.
74. **Not added:** ESLint (strict TypeScript + 180+ tests carry the weight; add `eslint-config-next` later if you want style rules), Prisma 7 (the remaining audit warning is in Prisma's config loader, which only reads our own config file), and a shared rate-limit store (one app container per deployment; see decision 9).

## After Phase 3: offboarding, customer-data expiry, cost data

75. **Whole-business export** (`/admin/businesses/[id]/export`, super admin only, audited): one JSON file with every record for the business, decrypted, so a leaving client gets their data back as the Data Protection Act expects of a processor. Password hashes and provider credentials are never included. JSON rather than a zip of CSVs because chats and calls are nested and one file is easier to hand over.
76. **Deleting a business** requires it to be Disabled first, a tick that the client has their export (or declined one in writing), and the slug typed exactly. Everything goes in one transaction (rows that reference catalogue tables with `ON DELETE RESTRICT` are deleted first, the rest cascade), including the business's own audit history. One audit line without customer data remains: who, when, record counts, the last two months' usage and the manual follow-ups, which `/admin` lists for 30 days (release the number, cancel forwarding with `##002#`, WhatsApp, calendar, widget, backups).
77. **Retell clean-up runs as a background job** (`retell-cleanup`): delete the number import, agent, LLM and every call (recording + transcript), 404 counted as done, anything else retried by pg-boss. Used for business deletion and for single-person erasure, so "erase" now also removes Retell's copies of that person's calls. Queued jobs for a business that no longer exists are dropped instead of failing and alerting.
78. **Customer details expire** after `customerRetentionMonths` (default 24, 6-120, per business) without any contact from that person. "Contact" means any booking date (a future booking always counts), enquiry, call, chat, payment request or first contact. Expiry uses the same code path as an erasure request: contact, leads and chats deleted; bookings and payments kept but anonymised ("Past customer"); call logs keep duration and outcome only. Records with no phone number (anonymous web chats, phone-less leads, calls from hidden numbers) expire on their own dates. Up to 500 people per business per night.
79. **Opted-out numbers survive expiry** (name and email removed) so a STOP is still honoured if the person comes back; an explicit erasure request removes them too, because the person asked.
80. **Erasure keeps paid payment records as PAID** (anonymised) instead of marking them cancelled, so the business's accounts still add up; unpaid requests are cancelled. Payment links are blanked because a link template may contain the customer's name.
81. **Retell's per-call charge is stored** (`CallLog.costUsdCents`, US cents, from `call_cost.combined_cost`; `call_analyzed` overwrites `call_ended`). Shown per business and month on the admin pages and CSV, and per call to the super admin only (it's your cost, not the client's).
82. **Cached prompt tokens are metered separately** (`LLM_CACHE_READ_TOKENS`, `LLM_CACHE_WRITE_TOKENS`); `LLM_INPUT_TOKENS` now means full-price input only. Earlier months recorded cached tokens inside `LLM_INPUT_TOKENS`, so they read high. Web chat messages and token usage stay without dedupe keys: a resent message really runs the model again.
83. **Default plans are seeded with `createMany … skipDuplicates`** (ON CONFLICT DO NOTHING). The earlier per-plan upsert could fail when two pages loaded bills at the same moment on a fresh database (found by the new tests).
84. **Phones get their own navigation.** Under 800px wide the sidebar is replaced by a slim top bar (business name + Menu button, the full menu closes after choosing a page) and a bottom tab bar for the daily pages (owner: Home, Bookings, Inbox, Calls, Leads; admin: Businesses, Onboard, Usage, Plans). The current page is highlighted everywhere (`aria-current`). Every dashboard and admin page is checked for sideways scrolling at phone width.
85. **"Try your website chat"** is in every business's menu and opens the demo page with a full page load (a client-side page change would not run the widget script). Signed-in staff see a bar on the demo page with a link back; visitors you show it to see only the pretend website.
86. **Day questions get day answers.** "unnu open Sunday?" (also "sat", "satdeh"...) gets a direct yes/no for that date, using public holidays and special closures, plus when the business opens next, instead of the whole week's hours. The inbox explains whether a customer has never messaged on WhatsApp or last messaged more than 24 hours ago, with their number to call.

## Look and feel

87. **iOS-style design with console-grade motion.** System fonts (SF Pro on Apple devices), grouped backgrounds, frosted-glass sidebar, top bar and tab bar, large titles, 20px rounded cards, iOS Settings-style coloured icon tiles in the menus, iOS switches for on/off settings (still real checkboxes underneath), iMessage-style conversations. Motion uses spring curves: pages glide in block by block, stat tiles pop in and their numbers count up, cards lift with a glow under the pointer, buttons get a light sweep, and a slow ambient glow drifts behind everything. Dark mode is a deep-navy console look with coloured glows. Everything respects the device's "reduce motion" setting, and the browser tests run with it on so accessibility scans see settled pages.
88. **The customer widget** got the same treatment: spring open/close (a bottom sheet on phones), animated launcher, live "online" dot, segmented Chat/Book control, pop-in message bubbles with typing dots, swipe-style screen changes in booking, calendar-style date cards, skeleton loading, an iOS switch for WhatsApp consent, and an animated tick with a burst on "You're booked!". It stays dependency-free and every accessible name the tests rely on is unchanged.
89. **The demo salon site** is now a polished landing page (hero in the business's brand colour, services and prices, hours, location, a "Book an appointment" button that opens the widget on its Book tab) so demos to prospects look like a real client site.
90. **Status colours were darkened** (ok/warn/danger) after the accessibility scan flagged the "active" badge at 4.29:1 contrast; all 46 dashboard and admin page scans (light and dark) now pass WCAG AA.
