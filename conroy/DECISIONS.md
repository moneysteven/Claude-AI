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

18. **Reminders, confirmations outside the 24-hour window, payment links and owner summaries use approved UTILITY templates** (defined in `src/lib/whatsapp/templates.ts`; create them in WhatsApp Manager with the same names). Inside the 24-hour window, free text is used (cheaper and friendlier).
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
