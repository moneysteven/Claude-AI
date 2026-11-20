# Glow by Launthia – booking & payment platform: architecture and plan

Goal: **visit the site → pick a service → pick a date and time → enter details → pay in full → get a
confirmation and a receipt**, with no messages needed for an ordinary booking. Launthia runs everything
(appointments, services, prices, availability, payments) from her private dashboard.

---

## 1. What exists today (kept)

| Part | Today | In the platform |
|---|---|---|
| Website design (hero, services, booking section, Glow Club, policies, footer) | Done, tested | Kept as is. Service cards and the booking steps get their data from the database. |
| Booking form (service → day → time → name, phone, email → review) | Saves a *request* to Supabase, then Whop link + text/email | Same steps, plus **live availability**, a **slot hold**, and **payment-method choice** |
| Owner dashboard (`#owner` in the single file, `/owner` on Hostinger) | Bookings, Glow Club, Stats, Settings (alerts, prices, days off), animations, preview sign-in | Grows into the full admin: Overview, Appointments, Services, Availability, Payments, Glow Club, Settings |
| Supabase (database, Row Level Security, sign-in) | `bookings`, `glow_club`, `owner_settings`, `alert_log`, `site_prices`, `blocked_days` | Kept. New tables added beside them; nothing deleted. |
| Edge Functions (`notify-owner`, `send-confirmation`, Resend email) | Owner alerts + confirmation email | Kept, joined by checkout, payment-verification and receipt functions |
| Hosting | Hostinger (`dist/`) + single HTML preview | Same |

## 2. Architecture

```
 Customer's browser                     Supabase (server side)                         Outside services
 ───────────────────                    ──────────────────────                         ────────────────
 Website (Hostinger)  ── read ───────▶  Postgres + Row Level Security
   services, slots                       • services, availability, bookings, payments
   hold a slot      ── RPC ──────────▶   • slot engine + hold (no double booking)
   pay              ── Edge Function ─▶  checkout ──────────────────────────────────▶  NCB / FAC hosted payment page
                                                   ──────────────────────────────────▶  PayPal Checkout (Orders v2)
   return page      ◀── status ───────   verify (server to server) ◀── notifications ─  gateway
                                         confirm booking (once) → reference
                                         email confirmation + receipt + owner alert ──▶  Resend
 Owner dashboard  ── signed in ───────▶  admin-only tables and functions (RLS + admin list)
```

Rules that hold everywhere:
- **Secrets only on the server**: gateway credentials and the Resend key live in Supabase Edge Function
  secrets. The website only ever has the public "anon" key.
- **No card data touches the site or the database**: cards are typed on the bank's / PayPal's own page.
  We store only references, amounts and statuses.
- **A booking is confirmed only by the server**, after it has checked the payment with the gateway itself
  (or, for Zelle, after Launthia confirms the money arrived). The return page never confirms anything by itself.
- **Once only**: a gateway reference can be processed once; a booking confirms once; each email sends once.

## 3. Data model (Supabase / Postgres)

| Table | Holds | Who can see it |
|---|---|---|
| `admin_users` | who may use the dashboard (Launthia now; staff later) | admins |
| `services` | name, description, price (JMD), duration, photo, extra info, online/quote, active, order | public sees active ones; admins edit |
| `availability_hours` | working hours per weekday (several blocks per day allowed) | public read (opening hours); admins edit |
| `availability_breaks` | breaks per weekday (e.g. lunch) | admins |
| `blocked_periods` | blocked dates or times (whole days, part days) | admins (public only sees free slots) |
| `booking_settings` | slot step, buffer between clients, minimum notice, how far ahead, hold length | admins |
| `customers` | name, email, phone (one record per email) | admins |
| `bookings` (existing, extended) | service, customer, start/end, status, payment status, amount, hold expiry, reference | admins (customers see their own booking only through its private checkout id) |
| `payments` | one row per payment attempt: method, amount, currency, gateway reference, status, refunds | admins |
| `payment_events` | every gateway notification once (stops double processing) | admins |
| `payment_methods` | card / PayPal / Zelle: on or off, label, instructions, currency, exchange rate | public sees enabled ones; admins edit |
| `email_log` | every customer/owner email: kind, to, status (one "sent" per booking per kind) | admins |
| `glow_club`, `owner_settings`, `alert_log`, `site_prices`, `blocked_days` (existing) | unchanged | as today |

**Booking statuses**: `Held` (slot reserved during checkout, expires) → `Confirmed` (paid and verified) →
`Done`; or `Pending payment` (Zelle, awaiting Launthia's check), `Expired` (hold lapsed / payment failed:
slot released), `Cancelled`, `Needs attention` (a payment arrived after the slot was lost: refund or rebook).
**Payment status**: `unpaid`, `pending`, `paid`, `failed`, `refunded`, `partly refunded`.

**No double booking** is enforced by the database itself (an exclusion constraint: two active bookings can
never overlap in time), not only by the website, so two people paying at the same second cannot both win.

## 4. Booking and payment flow

1. Site loads active services (`services`) and, for a chosen day, **free slots** from a server function that
   applies working hours, breaks, blocked dates/times, existing bookings, buffer, minimum notice and the
   booking horizon. Past times are never offered.
2. Customer picks a slot, enters name, email, phone, agrees to the terms → **hold** (`Held`, 15 minutes by
   default). The slot disappears for everyone else at once.
3. Review screen: service, date, time, duration, total (JMD) → choose a payment method (only the ones
   Launthia has switched on).
4. **Card (NCB / FAC hosted page)**: an Edge Function creates the payment with FAC using server-side
   credentials and sends the customer to the bank's page. FAC tells our server the result; the server checks
   it with FAC, then confirms the booking. Declined / cancelled / timed out → payment marked failed, slot
   released (cancel keeps the hold until it expires so another method can be tried).
5. **PayPal (Orders v2)**: Edge Function creates an order for the exact amount → customer approves on
   PayPal → our server **captures** the order and checks the result (and webhooks as a back-up) → confirm.
   The server re-checks the hold *before* capturing, so nobody is charged for a slot they no longer hold.
6. **Zelle (manual)**: customer sees Launthia's approved Zelle instructions and the exact amount, sends the
   money, then types the Zelle confirmation/reference → booking becomes `Pending payment`, slot kept.
   Launthia confirms in the dashboard only when the money is in her account (never from a screenshot).
7. On confirmation (once): booking reference (e.g. `GBL-7K3QX9`), **confirmation email** and **payment
   receipt** to the customer, **new-booking alert** to Launthia. Each email includes service, date, time,
   amount paid, reference and business contact details.
8. Holds that expire are released automatically.

## 5. Payment gateways – what is known and what is waiting

- **NCB / First Atlantic Commerce (card)**: built as an *adapter* with three jobs – start a hosted-page
  payment, verify a result, read a notification. **No FAC endpoints, field names or signatures are invented.**
  Until the official merchant credentials and integration documentation arrive, the card option shows
  "Card payments are being set up" and cannot be selected; nothing is charged. The adapter is filled in from
  NCB/FAC's documentation, tested in their test environment, then switched on.
- **PayPal**: official PayPal Checkout (Orders v2 REST API: create order, capture order, webhook
  verification), sandbox first, live when Launthia's PayPal business credentials are added as secrets.
  Every PayPal address, field and value used was checked against PayPal's official OpenAPI specification
  (github.com/paypal/paypal-rest-api-specifications); nothing depends on error names the specification doesn't
  list – after any failure the server reads the order's real state from PayPal instead.
  **Currency**: PayPal's standard currency list for ordinary merchant accounts does not appear to include
  JMD (it is listed only for a limited-release presentment feature), so the plan charges PayPal in **USD at a
  rate Launthia sets in the dashboard**, showing both amounts – unless PayPal confirms JMD for her account.
- **Cash App** (added at the owner's request): handled exactly like Zelle – the client sends it and types the reference; Launthia confirms when it arrives. Cash App currently appears to be US-only, so she needs a US Cash App account.
- **Zelle**: a US bank-to-bank service: **both the customer and Launthia need US bank accounts enrolled with
  Zelle**, and it is USD only. It is off by default and only makes sense if she has a US account.
- Whop ("Pay & Book" links) cannot be server-verified as built, so it is retired from checkout when the new
  methods go live (kept switchable until then).

## 6. Admin dashboard (additions)

- **Overview**: total bookings, upcoming, completed, cancelled, payments received, recent transactions.
- **Appointments**: list, filters, customer details, status and payment status, reschedule (free times only),
  cancel, notes; Zelle bookings waiting for verification at the top.
- **Services**: add, edit, reorder, price, duration, photo upload (Supabase Storage), active/inactive,
  online booking or quote only.
- **Availability**: working hours per day, breaks, slot step, buffer, minimum notice, booking horizon,
  hold length, blocked dates and times (today's "Days I'm not working" moves here).
- **Payments**: successful / failed / pending transactions, references, amounts, refunds and cancellations
  tracking; payment methods on/off, Zelle instructions, PayPal USD rate; gateway status ("awaiting merchant
  integration", "test mode", "live").
- Phones: the bottom bar keeps 4 main tabs + "More".

## 7. Security and quality

Row Level Security on every table; admin access through an `admin_users` list (`is_admin()`), not the
browser; public writes only through server functions that validate everything; rate limits on holds;
secrets only in Edge Function environment variables; webhook/notification authenticity checked; amounts
always taken from the database, never from the browser; idempotent payment processing; no fake or
simulated success anywhere outside the clearly-labelled preview; accessibility and mobile-first as today.

## 8. Stages

| Stage | Delivers | Needs from you |
|---|---|---|
| **1. Database foundation** ✅ done | All tables above, slot engine, holds with expiry, no-overlap guarantee, payment ledger, idempotent confirm/fail, Zelle submit, admin verify/reschedule/cancel/refund, security rules, automated tests (`supabase/platform.sql`, `supabase/tests/booking-platform.test.sql`: 92 checks; 12-way race test: exactly one hold wins) | – |
| **2. Checkout & payments backend** ✅ done | Edge Functions `checkout` + `paypal-webhook` (PayPal Orders v2, sandbox = TEST MODE), FAC adapter shell (awaiting docs, cannot charge), Zelle, capture safety check, pending payments, automatic PayPal refunds, per-visitor limits; holds only through the server. Tests: 129 SQL checks, 62 + 3 + 4 integration checks against the real database | PayPal sandbox credentials for a real sandbox test |
| **3. Confirmations & receipts** ✅ done | Email queue in the database (queued with the payment confirmation, once each), confirmation + receipt to the client after a verified payment, Launthia's alerts (new paid booking, Zelle to check, needs attention), cancellation/new-time emails only when she chooses, `booking-emails` function, Resend Idempotency-Key, TEST marks. Tests: 156 SQL, 90 + 4 + 5 integration | Verified sending domain for Resend |
| **4. Customer website** ✅ done | Services from the database, free days and times, held time with countdown, choose how to pay (card via NCB: being set up · PayPal: test mode · Zelle · Cash App), PayPal return page with the booking reference, "being checked" card for Zelle / Cash App; old request flow kept when the server isn't connected; preview on claude.ai only | Exact prices and durations per service |
| 5. Admin dashboard | Overview, Appointments (reschedule/cancel), Services (photos), Availability, Payments | – |
| 6. Go-live | End-to-end tests, legal page updates (payment providers, refunds), Hostinger upload, gateway switch-on | NCB/FAC credentials + documentation; live PayPal keys |

Future-ready: promo codes (a `promotions` table + discount on the hold), customer accounts (Supabase Auth
for customers, bookings linked by `customer_id`), automated reminders (scheduled function reading
upcoming bookings), analytics (views over bookings/payments).

## 9. Decisions needed from you / Launthia

1. **Full Glam price**: online payment needs one exact amount (today it is JMD 10,500 – 12,000). Set one
   price, or split it into two services (e.g. Full Glam / Full Glam with lashes).
2. **Durations**: how long each service takes (the site uses 1-hour slots today; that is the starting value).
3. **Bridal**: stays "quote only" (no online payment), or gets a bookable deposit/package?
4. **PayPal currency**: USD at a rate she sets (default plan), unless PayPal confirms JMD for her account.
5. **Zelle**: only if she has a US bank account enrolled with Zelle.
6. **Whop**: retire it when card/PayPal go live (recommended).
7. **Policies**: the Terms and Cancellation & Refund Policy mention Whop and request-style booking; they need
   her wording for paying in full online and refunds before launch.
