# Glow by Launthia — website

Single-file, mobile-first website for Glow by Launthia (Launthia Watson, luxury destination bridal makeup artist, Jamaica), in her soft neutral palette: ivory, cream, sand, nude, taupe, mocha, espresso and a muted champagne-gold.

- `index.html` — the finished site. One file: HTML, CSS, JS, every photo it uses, the fonts (Bodoni Moda, Hanken Grotesk) and three.js (r128), all inlined. The owner dashboard opens at `#owner`. Only Supabase (once connected), PayPal.Me and the client's own bank are on other sites.
- `src/page.html` — the editable source (no media inlined).
- `assets/` — the optimised photos (WebP) and reel clips (short, 360×640, muted H.264) that get inlined.
- `build.py` — rebuilds `index.html` from `src/` + `assets/`: `python3 build.py`
- `dist/` — the optimised site for hosting (`python3 build.py --dist`): a 176 KB page plus a deferred `app.js`, the owner dashboard in `owner/` (`/owner`), `robots.txt` and `.htaccess`; photos as WebP / JPEG at 480–1200 px and full width in `<picture>` with `srcset`/`sizes` (crisp at 1x, 2x and 3x), lazy below the first screen; the hero portrait preloaded with `fetchpriority="high"`; clips as H.264 MP4 + VP9 WebM with JPEG posters (`preload="metadata"`). Upload the whole `dist/` folder.

## The live website (read this first – it replaces anything further down that says otherwise)

- **No demo anywhere.** There is no preview mode, no demo sign-in, no sample data and no test-mode wording in the
  website or the dashboard. Until Supabase is connected, the booking section shows a calm message – "Online booking
  is having a moment. Please message Launthia on WhatsApp or text 876-277-8913 and she'll book you in." – with
  WhatsApp and Text buttons, and the dashboard sign-in says it isn't connected yet (there is no other way in). The
  same message shows if the booking server doesn't answer. When the site works but no way to pay the deposit is set up
  yet (no PayPal.Me name and rate, no bank account), it says instead "Online deposit payment isn't set up yet. Please
  message Launthia on WhatsApp or text 876-277-8913 and she'll book you in." – with the same two buttons. A client is
  never left on a payment step with nothing to tap.
- **No booking without the deposit.** Every Soft Glam and Full Glam booking holds the time, then the client pays the
  JMD 3,000 deposit by bank transfer or PayPal.Me – only the ways Launthia has set up show. The balance (with the
  optional JMD 3,000 photos) is paid in person at the appointment. There is no pay-in-person booking: the website,
  the `checkout` server and the database have no such path (`book_pay_in_person` and "Cash received" are gone), and
  the public key can't write a booking into the table directly.
- **How clients pay** (dashboard: Settings › Hours, prices & more › How clients pay): her PayPal.Me name, how many JMD
  make 1 US dollar, and up to four bank accounts (bank, account name, account number, branch, account type), saved
  together by `admin_save_payment_setup`. Nothing is filled in for her; a way to pay with nothing saved is never shown
  to clients, and the dashboard reminds her (on Bookings, and in the card itself). Her bank details are given only to
  a client who is paying; none of her payment details are in the website files.
- **PayPal.Me**: the PayPal button is a normal link with the exact address on it before the tap –
  `https://www.paypal.me/<her name>/<deposit in USD>USD` (the JMD 3,000 deposit at her rate, rounded up to the cent:
  at 154 it is USD 19.49). The US-dollar amount shows next to the deposit before PayPal is tapped. On a phone the link
  usually opens the PayPal app if it is installed, otherwise PayPal's website (that can't be guaranteed; the same link
  works on the website). PayPal.Me lets the client change the amount and keeps no booking reference, so "I've paid on
  PayPal" only marks the booking as waiting: Launthia checks the amount and the client's name in PayPal, then taps
  **Mark deposit paid** (the card says "Check the amount and the client's name in PayPal before marking the deposit
  paid."). Only then is the booking confirmed and the client emailed. (Later option, not used now: PayPal's own
  checkout buttons with a server-made, server-captured order – the code is still in `supabase/functions`.)
- **Visual fixes**: the photos card is a heading inside a card (no fieldset legend, so iPhone Safari can't park it on
  the border), with Yes/No the same size (side by side when both fit, else stacked full width); amounts like
  "JMD $9,500" never break across lines; dates wrap instead of being cut off; a field typed in on a phone is scrolled
  above the keyboard (with the photos card after it and room for the button); the round Book button stays away for the
  whole booking on phones and only shows where nothing is under it; section jumps leave room for the top bar; "Bridal
  glam" heading; WhatsApp mentioned with text and email for bridal; "Sunday closed" kept together; the dashboard writes
  "JMD $…", keeps room above the phone tab bar, has a wider search box, one birthday wording ("28 November") and
  "Add to Home Screen".
- **Final round**: the top bar is solid (nothing scrolling behind it shows through), and the payment step and the
  result open fully below it (checked again once the page and any phone keyboard have settled). The round Book button
  is measured where it really sits (with the iPhone home-bar inset), fades the moment content comes near it while
  scrolling, and shows again only when the page is still and nothing is under it or just above it. Phone numbers never
  split (no-wrap); on the policy pages the email wraps only before the @, a web address only before ".com", and
  handles stay whole. The Legal entity row stays hidden until `LEGAL_ENTITY` is a real name. In the dashboard, an
  opened "More" scrolls so its last control (Save note, or the last button) sits above the tab bar and the iPhone safe
  area, and the tab bar is solid. A bank transfer is always the deposit in JMD (the `checkout` server and
  `glow_charge_amount`), whatever the bank row's currency says; PayPal stays the US-dollar PayPal.Me link.
- **Tests** (all on the live files, against a real database and the real `checkout` code; scratch test files, not in
  this repository): website states and PayPal.Me, the dashboard with "How clients pay", the Hostinger build, bank
  checkout, keyboard use, the Full Glam looks, the clean dashboard, her schedule, the deposit, the header, and the
  visual fixes at 375, 390, 430 and 1280 px (Chromium with iPhone sizes; real iPhone Safari wasn't available).

## Performance

- On phones only the header's 3D runs at load; the About, Glow Club and footer 3D scenes are built as they come near the screen and pause when off it.
- Every animation and transition moves only `transform` and `opacity` (no animated filters, clip-paths, heights, colours or shadows); the reviews heading's handwriting stroke is the one exception, since drawing a line can't be done with transform. `will-change` is applied only while a section is on screen.
- Scroll reveals use IntersectionObserver only; all scroll/touch listeners are passive; no scroll-jacking (in-page links glide, the wheel and touch scrolling stay native).
- The 3D hero is one WebGL canvas; every WebGL canvas and clip pauses off screen and when the tab is hidden, shaders are compiled before they're first seen (no hitch when the header or a section appears), and `prefers-reduced-motion` shows still versions.
- No backdrop blurs on phones (more opaque fills keep the look); none on the large static panels anywhere.
- Fonts: preloaded, `display=swap`, only the weights used (Bodoni Moda 400 roman/italic, Hanken Grotesk 300–800). CSS and JS are minified in both builds; three.js and the app script are deferred in `dist/`.


## Adding Amazon products

At the top of the main `<script>` in `src/page.html`:

```js
var STOREFRONT_URL = '';            // her Amazon storefront link
var PRODUCTS = [
  { category: 'Face', name: '', note: '', url: '', image: '' },
  ...
];
```

Categories: `Face`, `Eyes`, `Lips`, `Brushes & Tools`, `Skin Prep`. Fill in `name`, `note` ("Why I love it"), `url` (product or affiliate link) and optionally `image`. Empty fields show a labelled placeholder; empty links show a "coming soon" note instead of navigating. Then run `python3 build.py`.

## Polish (forms, offline, 404, favicon)

- Buttons show "Saving…" / "Signing in…" / "Sending…" the moment they're tapped and can't be tapped twice. The "Almost done" cards appear only after saving has finished, and say plainly whether it saved.
- Offline: a small "You're offline" notice; anything typed stays; nothing is sent, and the Whop checkout never opens, until the connection is back ("You're back online").
- Photos show a soft shimmer until they load; the owner dashboard shows placeholder cards the first time, then the last lists straight away (this tab only, cleared on sign-out) while it refreshes quietly.
- Glow Club cards in the dashboard: "Text / WhatsApp / Email an offer" (only for people who agreed) start a message that already ends with "Reply STOP to stop these messages" (email: "To stop these emails, reply STOP or email …"); "Mark as STOP (unsubscribed)" stops offers and records when.
- `dist/` also has the favicons (`icon-32.png`, `icon-192.png`, `apple-touch-icon.png`, made from `assets-icons/`), a friendly `404.html` and an `.htaccess` that shows it for any missing address, and `og-image.jpg` for link previews (used once `SITE_URL` is set).
- Every phone number written on the page is a tap-to-call link. Launthia's email address, wherever it is written, opens a new Gmail message to her in a new tab (`https://mail.google.com/mail/?view=cm&fs=1&to=…`); the "Send by email" / "Get a quote by email" buttons open a Gmail message to her too, with the message already written (except inside the offers checkbox label, where a link would get in the way of ticking it). Esc closes the menu, the legal pages and the owner page's dialog.

## Owner dashboard and database (Supabase)

- Bookings (on "Pay & Book") and Glow Club joins are saved to Supabase, in the `bookings` and `glow_club` tables. The booking form now asks for the client's email (required), so Launthia can send a confirmation. If saving fails, the visitor carries on as normal.
- Set-up: run `supabase/setup.sql` in the Supabase SQL Editor, then put the Project URL and the **anon public** key in `SUPABASE_URL` / `SUPABASE_ANON_KEY` in the SETTINGS block at the top of the main script. Never paste the service_role key or any secret key: the site refuses to use one. `supabase/check-public-cannot-read.sql` proves the public key can't read, change or delete anything (every line should start with "OK").
- Where it lives: in the single file, open the address with `#owner` on the end (the site is hidden while it's open). On Hostinger it is its own page, `/owner/` (`dist/owner/index.html`, `owner.css`, `owner.js`, with `noindex` and no caching); `#owner` and `/owner.html` go there. There is no link to it on the site.
- Sign-in: email + password (with show/hide), "Forgot password?" (always the same neutral message), "Set your password" for the invite and reset links, and "Access denied" for any other account. There is no sign-up anywhere. The database rules allow only Launthiawatson@yahoo.com to read or change anything.
- Four tabs (pill tabs on a laptop, a bottom bar on a phone): **Bookings**, **Glow Club**, **Stats**, **Settings**. See "Dashboard: clean and tidy" below for how each one looks now.
- Emails (Supabase Edge Functions + Resend, see `supabase/functions/`): `notify-owner` emails Launthia one alert per new booking (a Database Webhook calls it); `send-confirmation` emails the client once when Launthia taps Confirm. Both retry at most twice, stop at 30 emails an hour, and log to `alert_log`. The Resend key lives only in Supabase's secrets, never in the site. The website itself never sends any message.
- Spam protection: a hidden honeypot field on both forms; one booking or join per phone number (or email) every 2 minutes, checked on the device and again by the database; lengths and formats checked before saving and again by the database.
- Settings > **Your prices**: Launthia changes the Soft Glam and Full Glam prices (a range like `10,500 – $12,000` is fine); the website shows them everywhere (service cards, booking choices, summary, Pay button, Terms). Whop still charges what is set in Whop. **Days I'm not working**: tap a day to block it off; clients can't book it on the website ("Not available"). Both live in the `site_prices` and `blocked_days` tables (anyone can read them, only Launthia can change them); the website reads them when a page opens. Re-running `supabase/setup.sql` adds them safely.
- Bookings > **Pick a date** opens the dashboard's own calendar (days with bookings have a dot). Glow Club > **Email** (members who agreed to offers) opens a message writer with ready-written Birthday, Thinking of you and New openings emails to edit, then "Open in my email" or "Copy message"; nothing is sent by the website and every message says how to stop them. Members who didn't agree get a plain email.
- Sign-in only with her real Supabase account. Before Supabase is connected, nobody can sign in (the page says the sign-in isn't connected yet).
- Motion: see `OWNER-MOTION.md` (the brief, from the "20 Principles of UX & Animation" video). The eye blinks and draws its line, cards land in turn, numbers count up, tabs slide, big wins sparkle, mistakes shake. Layout, words and colours are unchanged; "reduce motion" turns it all into simple fades.
- New bookings arrive by themselves (Supabase Realtime, with a quiet check every 60 seconds as a back-up); otherwise every request starts with a tap (or opening a tab), a failed request is tried at most twice, and the dashboard's last lists are kept for this tab only (sessionStorage), cleared on sign-out. supabase-js 2.49.4 loads from jsDelivr (with an integrity check) only when it's needed.

## Booking & payment platform (in progress)

The plan, architecture and stages are in `PLATFORM-PLAN.md`. **Stages 1 (database), 2 (payment server), 3 (emails)
and 4 (the website's booking and payment step) are done.** Launthia's dashboard screens for them are Stage 5.

- Set-up: after `supabase/setup.sql`, run `supabase/platform.sql` in the SQL Editor (safe to run again; if you re-run
  `setup.sql` later, run `platform.sql` after it). It adds services (price in JMD, duration, photo, online or quote
  only), working hours, breaks, blocked times, booking rules, payment methods (card / bank transfer / PayPal / Zelle /
  Cash App, all **off**),
  customers, payments, refunds, gateway notifications, an email log, request limits, and the functions that list
  free times, hold a time while the client pays, and confirm or fail a payment. Two active bookings can never
  overlap: the database itself refuses it.
- Starting rows come from the site today: Soft Glam JMD 9,500 (bookable online); Full Glam and Bridal not bookable
  online until Launthia sets one exact price; every service 60 minutes; Monday–Saturday 9am–5pm. All editable.
- **Prices**: the Soft Glam and Full Glam prices she types in her dashboard (Settings > Your prices) are the prices
  the booking form charges. One price (like `9,500`) can be booked and paid online at exactly that price; a range
  (like `10,500 – $12,000`) is shown as it is and clients ask for a quote. A time already held keeps its price.
- **Her payment details are private.** Her bank accounts and payment instructions are kept only in her database and
  are never in the website's code or in this repository. The public can read only which ways to pay are switched on;
  the details are given only to a client who is holding a time and has chosen that way to pay. They go in with a
  private SQL file (kept outside this repository) run once in the SQL Editor after `platform.sql`.
- Who can do what: the public can only read active services, opening hours, the names of the switched-on payment
  methods (never their details), free times and a booking's status (by its private id). Holding a time, paying, bank
  transfer, Zelle and Cash App go only through the `checkout` Edge Function. Confirming a payment is server-only.
  Confirming a bank transfer / Zelle / Cash App payment, rescheduling, cancelling and recording refunds need a
  signed-in admin (`admin_users`, Launthia to start).
- **Payment server (Edge Functions)**: `checkout` is the one address the website will use (options, free days and
  times, hold, release, status, pay, PayPal return / cancel, bank transfer, Zelle and Cash App). `paypal-webhook` takes PayPal's notifications
  as a back-up (for example when a client approves and closes the tab). Shared code is in `supabase/functions/_shared/`:
  `paypal.ts` (PayPal Orders v2; every address and field checked against PayPal's official API specification),
  `payments.ts` (the steps after approval), `fac.ts` (NCB / First Atlantic Commerce card adapter: **awaiting
  merchant integration**, cannot charge anything), `db.ts`.
  - Deploy: `supabase functions deploy checkout --no-verify-jwt` and `supabase functions deploy paypal-webhook --no-verify-jwt`
    (both are public addresses and do their own checks).
  - Secrets (Supabase > Edge Functions > Secrets, never in the website): `SITE_URL` (the website's https address,
    for PayPal's return links), `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, and `PAYPAL_ENV`:
    leave it unset for PayPal's sandbox (**TEST MODE**, no real money, every test payment is flagged as a test);
    set it to `live` only at go-live, with the live keys.
  - PayPal's checkout window on the site uses the app's **client id**, which the `checkout` function gives the website
    (PayPal designs the client id to be public; the secret stays a Supabase secret and never reaches the site).
  - PayPal set-up (sandbox first): in PayPal's developer dashboard, make an app and copy its sandbox client id and
    secret into the secrets; add the webhook address `https://[project].supabase.co/functions/v1/paypal-webhook`
    with the events listed at the top of `paypal-webhook/index.ts`, and copy its webhook id into `PAYPAL_WEBHOOK_ID`.
    Then switch PayPal on with her JMD-per-USD rate (`payment_methods`: `enabled`, `jmd_per_usd`; the dashboard
    gets a screen for this in Stage 5).
  - How a PayPal payment works: the amount always comes from the database (JMD price ÷ her rate, rounded up to the
    cent); PayPal is only asked to take the money for an order the buyer approved, while the time is still theirs
    (or still free), one request at a time, with the same PayPal-Request-Id so it can never be taken twice; the
    booking is confirmed only from PayPal's own record of the capture, read server to server. Pending captures wait
    as "Pending payment"; declines free the time; a wrong amount goes to "Needs attention"; PayPal refunds are
    recorded automatically (once each).
  - **Bank transfer (JMD)**: switched on with her bank accounts (bank, account name, number, branch, type; up to 4).
    The client taps the account to pay into (for example NCB or Scotiabank) and that account's details slide up: bank,
    account name, number (with Copy), branch, type and the exact JMD amount (with Copy). A button opens that bank's own
    app – its official page in the phone's app store (NCB Mobile: Google Play `com.jncb.mobile`, App Store
    `id1435405040`; Scotia Caribbean: Google Play `com.scotiabank.cca.mobile`, App Store `id1461469582`), which shows
    Open when the app is on the phone and Install when it isn't – with a "No app?" link to the bank's online banking
    (www.jncb.com, jm.scotiabank.com; on a computer, online banking is the button). Opening it copies the account
    number to paste in. No bank lets a website fill in or send a transfer for a client, and the site never asks for
    banking logins, passwords or PINs. The links are fixed and open in a new tab with no referrer, so nothing about
    the client goes to the bank or the app store. Then the client comes back, checks the name on their bank account,
    gives their own bank, account number, branch and account type (so Launthia can refund them if she ever has to
    cancel – kept only in the payment's notes, which only she can read; her emails show the last 4 digits), adds the
    transfer reference if they have it, and taps "I've sent the payment". The page then shows "Waiting for Launthia to
    confirm your payment" and asks the booking server every 15 seconds (and whenever the client comes back to it);
    when she taps "Money received" it turns to "You're booked." with a check mark and the booking reference, and if she
    taps "Not received" it says the time was released. The booking stays "Pending
    payment" (time kept) and Launthia is emailed at once to check for the deposit; she confirms in her dashboard
    ("Money received") only when the money is in her account – never from a screenshot or the reference alone. Then
    the client gets the confirmation and receipt. "Not received" frees the time. A reference can be used only once.
  - **PayPal with her PayPal email saved** (`payment_methods.instructions` for `paypal`, set in her private setup
    file): tapping PayPal opens PayPal's own page straight away in a new tab (PayPal Payments Standard, `cmd=_xclick`)
    with her PayPal already filled in as the person being paid and the booking named with the US-dollar amount; the
    client types the amount and pays. Back on the site they tap "I've paid on PayPal" (it comes up by itself when they
    return), with the name on their PayPal and, optionally, the transaction ID. She is emailed to check her PayPal and
    confirms it in her dashboard ("Money received"); the client's page then shows "You're booked". The email is given
    only to a client holding a time. Without her PayPal email saved, PayPal uses the checkout window below (API keys).
  - **Zelle is not offered on the website** (it has no link a website can open; the site shows only Bank transfer,
    PayPal and Pay in person). The database still supports it, switched off.
  - **Zelle and Cash App** (both off on the website) work the same way: Launthia switches each on with her own payment details (instructions)
    and her JMD-per-USD rate; the client sees the exact USD amount, sends it themselves and types the reference;
    the booking stays "Pending payment" (time kept) until she confirms in her dashboard that the money arrived –
    never from a screenshot or the reference alone. Both need US accounts (Cash App currently appears to be US-only).
  - Each visitor can try a limited number of times every 10 minutes (counted under a one-way code, never their address).
- **Booking emails (Stage 3)**, sent by Resend from the server, never from the website:
  - To the client, automatically, only once a payment is verified (never before): a **booking confirmation**
    (reference, service, date, time, length, amount paid, studio, how to change or cancel, policy link) and a
    **payment receipt** (reference, date paid, method, amount in the charged currency and the JMD price, transaction
    id, paid to Glow by Launthia). Replies go to Launthia's email.
  - To Launthia: **new paid booking**, **bank transfer sent to you – please check** (JMD amount, which account – bank
    and last 4 digits only –, transfer reference, sender, client, service, time), **Zelle / Cash App payment to
    check** (amount, reference, sender – she confirms only when the money is in her bank) and **booking needs your attention** (paid twice, paid after the
    time was taken, wrong amount). They follow her "email alerts" switch in Settings and stop at 30 an hour. Like
    the existing alerts, they never include the client's email address.
  - Cancellation and new-time emails to a client go **only when Launthia chooses to send them** (dashboard, Stage 5).
  - TEST MODE payments are marked "[TEST]" in every email. Business details come from the website (Station Road,
    Little London; 1-876-277-8913; Launthiawatson@yahoo.com); receipts show `BUSINESS_LEGAL_NAME` only if it is set.
  - How it works: the database puts each email in a queue (`email_log`) in the same step that confirms the payment,
    once per email; `booking-emails` (and `checkout` / `paypal-webhook` right after a payment) sends them, each once,
    using Resend's Idempotency-Key so a retry can never deliver a second copy. A failed send is retried (3 tries in
    all); an address Resend refuses is marked failed and not retried. Everything is in `email_log` for the dashboard.
  - Set-up: a verified sending domain in Resend (the `CONFIRM_FROM` and `ALERT_FROM` addresses must use it);
    `supabase functions deploy booking-emails --no-verify-jwt`; a Database Webhook on INSERT into
    `public.email_log` calling `booking-emails` with the header `x-webhook-secret` = `ALERT_WEBHOOK_SECRET` (the same
    secret as the booking-alert webhook). Secrets: `RESEND_API_KEY`, `CONFIRM_FROM`, `ALERT_FROM`, `SITE_URL`,
    optional `BUSINESS_LEGAL_NAME`. Without the Resend secrets, emails simply wait in the queue until they are set.
- **On the website (Stage 4)**, the booking section works in one of three ways, chosen by itself:
  - *Online booking* – when `SUPABASE_URL` / `SUPABASE_ANON_KEY` are filled in and the `checkout` function answers:
    services, prices and opening hours come from the database; only free days and times are shown; "Continue to
    payment" holds the time (15 minutes, with a countdown); then **5. Choose how to pay**: **Bank transfer** (the exact JMD amount and her accounts, each number with a Copy
    button; the client taps NCB or Scotiabank, its details slide up with a button that opens that bank's app or online
    banking, then they finish with the name on their account and an optional transfer reference; "Your payment is
    being checked" until Launthia confirms), **PayPal** ("Test mode" until it goes live; PayPal's own secure
    window opens in front of the site – PayPal's JavaScript SDK – with the exact amount, the client pays with their
    PayPal account or a debit or credit card without leaving the site, and gets a "You're booked" card with the
    booking reference; if PayPal's window can't load, PayPal's page opens instead and comes straight back) and **Zelle** (her details and the exact USD amount, then the
    client types the confirmation number; "Your payment is being checked" until Launthia confirms). PayPal and Zelle
    show their own logos (shapes from Simple Icons, inline). Each way to pay opens in a checkout sheet in front of the
    page (from the bottom on phones), with the amount and details ready and Copy buttons for the amount, account
    numbers and the Zelle email; it closes with its X, Escape or a tap outside it. Only the ways to pay that Launthia has switched on
    appear. **Cash App is not offered on the website** (the server's Cash App switch stays off and is never shown). A service without one exact online price (Full Glam's range,
    Bridal) is booked by message, as before. "Change the time" frees the held time at once.
  - *Booking requests* (as before) – when Supabase isn't filled in yet, or the `checkout` function isn't deployed:
    the request is sent by text / email, exactly as the site worked until now.
- **Full Glam looks**: Full Glam is offered as two looks, each with one fixed price, so it can be booked and paid
  online: **Natural Full Glam** (polished full glam that still looks like you; starts at JMD 10,500, the low end of her
  range) and **Statement Full Glam** (every feature defined for big moments and the camera; JMD 12,000, the high end).
  Choosing Full Glam opens "Choose your Full Glam look"; the Full Glam card shows the range between the two. She sets
  both prices in her dashboard (Settings > Your prices); they are services `full-glam-natural` / `full-glam-statement`
  under `full-glam` (`parent_slug`). Before Supabase is connected, `FULL_GLAM_NATURAL_PRICE` /
  `FULL_GLAM_STATEMENT_PRICE` at the top of `app.js` are used.
- **Deposit only, no pay in person**: clients pay a JMD 3,000 deposit online (bank transfer or PayPal) to book;
  the balance is paid in person at the appointment. "Pay in person" is no longer offered on the website and the
  server refuses it too (see "Deposit and professional photos" below).
- **US-dollar rate**: she sets 1 US dollar = N JMD in How clients pay; PayPal shows the exact US amount of the deposit
  (rounded up to the cent), with the rate.
- **"Book" / "Book now"** links go straight to the booking form.
- **Formspree (Launthia's payment emails)**: paste the form's link into `FORMSPREE_FORM` at the top of `app.js`
  (for example `https://formspree.io/f/abcdwxyz`; in Formspree, set the form to send to Launthiawatson@yahoo.com).
  Each time a client says they have sent a bank transfer or Zelle payment – and the booking server has accepted it –
  the website sends Launthia an email with the amount to look for, which account (bank and last 4 digits only), the
  reference, who sent it, the client's name and phone, the service and the time. Never the full account number or
  the client's email. If Formspree is not set or does not answer, the booking still goes through. The card option
  is no longer shown on the website.
- **Her dashboard**: a booking paid by bank transfer shows as "Pending payment" with what to look for (the
  deposit amount, which account, reference, who sent it) and **Confirm booking** (confirms it; the client gets the
  confirmation and receipt by email); **Deposit not received** (under More; asks first; the time is freed).
  Times someone is still holding while they pay, and holds that ended unpaid, are not shown as bookings.
- Tests (for developers, on a copy of the database):
  `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/booking-platform.test.sql` (267 checks, all rolled back);
  `GLOW_TEST_DB_IS_DISPOSABLE=yes DATABASE_URL=… node supabase/tests/checkout.integration.mjs main` (131 checks; also
  `unconfigured` and `live`; it deletes bookings, so only on a throwaway copy); `supabase/check-public-cannot-read.sql`
  covers the new tables.

## What's in it

- Opening: no intro. The page opens straight on the finished header: the silk swirl, the gold GLOW with "by Launthia", the lipstick with its text ring, pearls and gold rings, and her portrait. On laptops and tablets the portrait sits on the right with her face clear of the letters. On phones it is placed where the GLOW letters, "by Launthia" and the lipstick don't cover her face, fading into the silk at its edges, with a soft patch of silk behind "by Launthia" and the tagline so they stay readable.
- WebGL hero: a brushed champagne-pearl "GLOW" wordmark with a soft light sweep, an interactive pearl, nude and champagne-gold 3D lipstick (drag or arrow keys) circled by "FULL GLAM • SOFT GLAM • BRIDAL GLAM", and drifting gold dust.
- Scroll-zoom story (soft glam to full glam) with her Soft Glam and Full Glam photos and the two bridal photos, layered parallax, reveals, hover-lift cards.
- About portrait with floating pearls, nude spheres and thin champagne rings.
- Services: Soft Glam $9,500 and Full Glam JMD $10,500 – $12,000 (`FULL_GLAM_PRICE`); "Book this look" opens the booking section with that service chosen. Bridal Glam: "Pricing on request" with "Get a quote by text" / "Get a quote by email". Each card shows only the photos the owner chose for it (Soft 1, Full 1, Bridal 2).
- Destination bridal section: pinned arch with her two bridal photos.
- Shop Launthia's Favourites: filter tabs, 3D-tilt product cards. The whole Shop (and its menu and footer links) stays hidden until at least one product has a name and a link, or `STOREFRONT_URL` is set. Set `AMAZON_ASSOCIATE = true` only once she is an approved Amazon Associate: that shows the disclosure and "(paid link)" labels.
- Booking in four taps: service (Soft Glam JMD $9,500; Full Glam JMD $10,500 – $12,000, shown as "from JMD $10,500" in the summary and on the Pay button; or Bridal Glam, which goes to "Get a quote by text" / "Get a quote by email"), a day on the calendar (up to 3 months ahead), a start time, then name, phone number and email. Step 4 shows a summary (service, day, time, name, phone, email, price in JMD) and "Your booking details will be sent to Launthia by text and email so she knows your time." "Pay & Book" (one tap only) shows "Almost done. Send your request to Launthia." with a "Pay JMD $9,500 & Book" button (Full Glam shows its own price) that opens the service's Whop checkout link in a new tab and works once (`WHOP_SOFT_GLAM_LINK` / `WHOP_FULL_GLAM_LINK`; until a link is pasted in, it shows the coming-soon message), then "Send by text" (SMS) and "Send by email" (subject "New booking - [service] - [day] [time]"), both filled in with name, phone, service, day, time and price. Card numbers are never collected on the site. Glow Club joins are sent the same two ways. Under the card: "To change or cancel, message us on WhatsApp or text" with a link to the Cancellation & Refund Policy. Notices under Pay & Book and Join: "By continuing you agree to our Privacy Policy and Terms".
- Mobile menu: full-screen espresso satin overlay that grows as a circle from the menu button; numbered links (Home, Services, Glow Club, Book, plus Shop once it has products) with the current section underlined; "Book now" pill, Instagram and YouTube, location line; scroll locked while open; closes on X, Escape or a vertical swipe; focus stays inside while open.
- Motion: every in-page link scrolls with an eased glide (offset for the nav); headings rise and unblur, cards stagger in and photos unmask as they enter the screen; buttons, cards and photos press in with a champagne ripple; services cards expand on tap on phones; the photo viewer's backdrop takes its colour from each photo, follows your finger on swipes, and flies the photo home on a swipe down; a short logo loader covers font loading.
- Performance: DPR capped at 2, lighter shaders and fewer particles below 768px, WebGL paused off-screen, automatic resolution drop on slow devices, and a static, motion-free version for `prefers-reduced-motion`.

## Booking only on the site

- The header, menu, footer and floating buttons say "Book now" and go to the booking section; bookings are made on the site with the deposit (see "The live website" at the top). For questions: text or call 1-876-277-8913 or email Launthiawatson@yahoo.com. When online booking can't be used, the calm message offers WhatsApp and text instead.
- Full Glam is a range (`FULL_GLAM_PRICE = '10,500 – $12,000'` in the SETTINGS block). The summary, the "Almost done" card, the Pay button and the messages to Launthia say "from JMD $10,500"; the booking saves 10500 as `price_jmd`. Bridal has no price on the site: the Bridal section and the bridal booking step have "For bridal prices, message Launthia on WhatsApp." with a button to wa.me/18762778913 (new tab). Bookings still go through the form.

## Booking settings

- Everything lives in the SETTINGS block at the top of the main script in `src/page.html` (it is also the first thing in `dist/app.js`):
  - `hours`: each day's opening hours, like `'9am-5pm'`, or `'closed'`. Now: Monday to Saturday 9am to 5pm, Sunday closed. The hours line beside the form is written from this.
  - `booked`: start times already taken, by day, e.g. `'2026-12-19': ['10am', '2pm']`. Each shows pale and can't be picked.
  - `fullDays`: whole days that are full or off, e.g. `'2026-12-24'`.
  - `WHOP_SOFT_GLAM_LINK` / `WHOP_FULL_GLAM_LINK`: the Whop checkout links (`https://whop.com/...`). The "Pay JMD … & Book" button on the last booking card opens it in a new tab.
- Each booking is a 1-hour slot on the hour (9:00 am to 4:00 pm with these hours), so bookings are always 1 hour apart. Past days, Sundays, full days, days with every time taken, days more than 3 months ahead and times already passed today show pale and can't be picked; today after the last start time reads "Closed for today". A time booked on this phone stays pale on it, even after a refresh.
- The site can't see other customers' bookings by itself: across phones, a time only turns pale once it is added to `booked`. Doing it automatically needs a booking database.

## Legal pages

- Privacy Policy, Terms & Conditions and Cancellation & Refund Policy open over the site from the footer links (`#privacy`, `#terms`, `#cancellation`), with "Back to the site" (Esc and the browser's back button also close them). Each shows the business details. The text is the owner's draft; points still waiting for Launthia's answer (GCT, what each service includes, travel terms) are left out rather than shown as placeholders. All three "Last updated" dates are `{{BUILD_DATE}}` in `src/page.html`; `build.py` fills in the day of each build.
- Booking: a required box "I agree to the Terms and Cancellation & Refund Policy"; the moment it's ticked is saved with the booking (`terms_agreed_at`).
- Glow Club: the offers box is optional, unticked by default (the moment it's ticked is saved as `consent_at`), and reads "Yes, Glow by Launthia may message me about openings and offers by [email / text / WhatsApp]. I can opt out at any time by messaging STOP or emailing Launthiawatson@yahoo.com.", with the Privacy Policy linked next to it. Joining is optional and not needed to book. After Join, the button for the way they chose comes first (email, text or WhatsApp).
- Prices show as JMD. Reviews are left out until real reviews (used with permission) exist. The Instagram follower count was removed.
- Text can be selected and copied (email, phone and policy text); the "Copy number" button copies her number. Fonts and three.js are served from this site (`vendor/`), so opening the page contacts no other site. No cookies are set. `localStorage` keeps only the day and hour of bookings made on that phone, short codes (never the numbers) for the 2-minute limit, and, for the owner only, her Supabase sign-in.
- Photo permissions to confirm with Launthia (each photo is hers or used with the client's permission): hero-portrait, soft-glam, full-glam, bridal-pearl, bridal-sleek, launthia-portrait, avatar (all from her Instagram).

## Placeholders to fill before launch

All in the SETTINGS block at the top of the main script (`src/page.html`, and the first lines of `dist/app.js`): `LEGAL_ENTITY` (its row on the policy pages stays hidden until this is a real name), `SUPABASE_URL`, `SUPABASE_ANON_KEY` (and `FORMSPREE_FORM`, optional). On Hostinger, `dist/owner/owner.js` starts with its own copy of `SUPABASE_URL` / `SUPABASE_ANON_KEY` (filled from the page when you build). Supabase secrets (never in the site): `RESEND_API_KEY`, `ALERT_FROM`, `CONFIRM_FROM` (bookings@[verified domain]), `ALERT_WEBHOOK_SECRET`, `SITE_URL`. Optional: `STOREFRONT_URL`, `PRODUCTS` and `AMAZON_ASSOCIATE` (the Shop appears once filled), and `SITE_URL` in `build.py` (canonical link and link-preview photo).

## Media

Photos and reels come from @glow_by_launthia's public Instagram reels and her YouTube Short. Use only with the owner's permission.

## Showcase film

> The films, their voiceover and the recorded videos were made before the galleries were removed, the hero became her portrait and the name went back to "Glow by Launthia". They still show the old hero background, Gallery and Looks scenes and say "Launthin" until the film scripts are updated and rebuilt (`python3 showcase/build_showcase.py`).

`showcase/glow-showcase.html` is a 60-second promo film of the site in one self-contained file: the real website plays inside a floating phone over a satin shader, with captions, scripted taps and swipes, and an end card. 9:16 (default) or 16:9, progress bar, on-screen timer, Play/Pause, Restart, Record mode (hides every control for clean screen recording) and Full screen. Keys: Space play/pause, R restart, M record mode (Esc to leave), T timer, 1 / 2 for 9:16 / 16:9. No audio, so music and voiceover can be added in editing.

`showcase/glow-showcase-laptop.html` is the laptop edition (16:9): the desktop site on a floating laptop, with a mouse cursor that hovers (card lifts, the photo ripple, 3D shop tilt, the site's own cursor ring) and clicks through the same nine scenes. Same controls, minus the ratio switch.

Rebuild both after changing the site: `python3 build.py && python3 showcase/build_showcase.py`. Each film's script lives in `showcase/src/` (scene timings are in `SCRIPT` and `SCENES`).

### Voiceover

Both films are narrated by the viewer's browser voice (speech synthesis), one line per scene, timed to the captions. Browsers only allow speech after a click, so the film opens on a "Play with voice" / "Play without voice" card. The film picks the most natural English voice installed (for example Microsoft's "Natural" voices in Edge, Google UK English Female in Chrome, Samantha or Serena on a Mac); the voice can be changed or muted from the controls (V toggles it). To capture the voice in a screen recording, record system audio (OBS, the Windows Game Bar, or a loopback tool on a Mac).

Narration (also usable as a script for a recorded voice):

| Time | Line |
|---|---|
| 0:01 | Welcome to Glow by Launthin. |
| 0:06 | Luxury destination bridal makeup by Launthin Watson, in Westmoreland, Jamaica. |
| 0:12 | Exploring is effortless. One tap opens the menu, and every link glides you there. (Laptop: Every link glides smoothly to its section, and photos ripple as you hover.) |
| 0:19 | Choose Soft Glam, Full Glam or Bridal Glam. Every bride is unique, so bridal pricing comes on request. |
| 0:28 | Every look is in the gallery. Open a photo, and the screen takes on its colours. |
| 0:36 | Shop the products Launthin loves, from face and eyes to lips. |
| 0:42 | The Glow Club brings clients back, with friendly reminders and a dashboard for Launthin. |
| 0:49 | And booking takes one tap. Your message is ready to send on WhatsApp. (Laptop: one click.) |
| 0:57 | Glow by Launthin. Book your glam, by appointment only. |

### Recording the films to video

`node showcase/record.js <film.html> <out.mp4> <width> <height> [slow]` records a film to an MP4 frame by frame, even on a machine without a GPU: every clock in the page runs `slow` times slower (scripts, timers, CSS/WAAPI animations and the video clips), the browser's frames are mapped back to film time and written as a steady 30 fps H.264 stream. `python3 showcase/narration.py <film src> <out.wav> [voice]` renders that film's voiceover with the offline RHVoice engine, timed to the scenes; mux the two with ffmpeg.

## Launch settings (Hostinger)

- `.htaccess` (website): always HTTPS, no folder listings, and browser security headers (HSTS, nosniff,
  strict referrer, no camera/microphone/location, same-origin framing only, opener isolation that still allows
  PayPal's window). The dashboard (`/owner/`) also gets `X-Frame-Options: DENY`, `noindex` and `no-store`.
- The words on the website can't be highlighted or copied; what is meant to be copied (her bank details and
  account numbers, the booking reference) and every box people type in still can. The dashboard is not affected.
- The 3D lipstick is drawn with smooth edges on every screen (phones too), more detail in its shape and text ring,
  and it only lowers its sharpness on a device that is really struggling (never below 1.5×).
- The Privacy Policy, Terms and Cancellation & Refund Policy describe the real way to pay: a JMD 3,000 deposit by
  bank transfer or PayPal to book, and the balance in person at the appointment (the old card checkout is gone).

## On-site bank transfer checkout (NCB) and the dashboard

- **Booking reference from the start:** every booking gets a unique reference (`GBL-XXXXXX`, no 0/O/1/I) the moment
  its time is held (`create_booking_hold`); unique index `bookings_reference_once`. It is shown on the payment step,
  in the bank details (to put in the transfer description), on every screen after, in Launthia's emails and on
  the booking in her dashboard, where the search box finds a booking by its reference (on any date).
- **Everything on the page:** tapping NCB (or Scotiabank) shows bank, account name (Copy), account number (Copy),
  branch, type, the exact amount (Copy), the booking reference (Copy) and **Copy all details**, with four short
  steps. No bank app or bank website is opened; the client pays in their own banking app or online banking with
  the page left open. The site never asks for banking passwords, PINs or one-time codes.
- **"I've Made My Payment"** opens the short form: transaction reference (required), receipt or screenshot
  (optional; JPG, PNG, WebP or PDF up to 5 MB, checked by type and size on the phone and again on the server by
  the file's own first bytes), the name on their account (already filled in) and their account for a refund. The
  booking becomes **Awaiting verification** (database: booking `Pending payment`, payment `awaiting review`); it is
  never marked paid by this.
- **Receipts** go to the PRIVATE Supabase Storage bucket `payment-receipts` (created by `platform.sql`; only
  Launthia, as admin, can read it), named `<booking id>/<payment id>.<ext>` – never the client's file name. Her
  dashboard opens a receipt with a 5-minute signed link. If storing the receipt fails, the payment details still
  count and the client is told.
- **Statuses**: Awaiting verification, Pending payment (deposit not paid yet), Confirmed (deposit paid), Cancelled.
  **Confirm booking** confirms (client gets confirmation + receipt by email); **Deposit not received** cancels the
  booking (never paid; the time is free again; the client is told).
- **Dashboard ↔ database:** **Cancel** and the new **Move** button use `admin_cancel_booking` /
  `admin_reschedule_booking` (the database checks the new time is free) and queue the client's email (cancelled /
  new time, once each). The dashboard refreshes itself every minute while open, on reconnect and when brought back.
- The checkout server accepts large requests only for the payment details (a receipt), everything else stays small.

## Dashboard: Schedule (online booking on/off, working hours, time off, services, booking settings)

The schedule lives in **Settings → Hours, prices & more** (it used to be its own tab). It is kept simple: one switch at the top, then short sections that open on tap, each showing a
one-line summary while closed. Everything is saved in the database through owner-only functions in
`supabase/platform.sql` (each checks `is_admin()` and checks the values; all or nothing). The website's free days
and times come from the same database function (`glow_free_slots`), and holding a time checks again on the server,
so a change shows on the website straight away and a client can never book a time she has closed.

- **Online booking** switch (`admin_save_rules`, saves the moment it is tapped): off = the booking form shows
  "Online booking is paused right now. Please text or call Launthia to book." and no day can be picked. Under it,
  **+ Add a note for clients** (up to 300 letters, shown above the booking form), Change note / Remove note.
- **Working hours** (`admin_save_week`): an Open/Closed switch for each day, its times (**+ Add time** for a split
  day) and **+ Add a break**. Times that overlap, or end before they start, are refused.
- **Time off & special days**: choose **Day off** (`admin_save_day` closed; the same list as Settings → Days off),
  **A few hours** or **Holiday** (`admin_block_time`, up to 120 days, with a private note), or **Special hours** for
  one date (`admin_save_day` special; replaces that day's usual hours and breaks, and can open a usual day off).
  Everything coming up is listed with a **Remove** button (`admin_save_day` usual / `admin_unblock_time`).
- **Your services** (`admin_save_service`): how long each takes (15 minutes to 10 hours), Book online on/off (only
  with a fixed price; prices stay in Settings → Your prices), and a description.
- **Booking settings** (`admin_save_rules`): start times every 15/30/45/60/90/120 minutes, free time after each
  client, how far ahead clients must book, how many days ahead they can book, and the most clients in one day.
- **Day planner**: pick a day to see working times, breaks, time off, bookings and the times clients can still book
  (from `get_available_slots`, the same answer the website gets), with that week at a glance.
- Bookings already made are never changed by any of this; the dashboard says so when time off covers bookings.
- **Time wheels:** every time box in the dashboard (working hours, breaks, time off, special hours, and Move on a
  booking) opens an iPhone-style wheel – hour, minutes, AM/PM – that slides up from the bottom on a phone and pops in
  on a laptop, in the site's colours and fonts, with Cancel and Done. Each step of a wheel gives a light tap on
  phones that support it (iPhone: iOS 18 or newer; Android: vibration); laptops have none. Arrow keys, Enter and Esc
  work too. The time box itself stays in the page (hidden) and holds the value.
- **To switch it on:** run `supabase/platform.sql` again in the Supabase SQL editor (safe to run again; it adds
  `availability_dates` and the new booking-setting columns and keeps all existing data). Until then the Schedule
  tab says the database needs the update instead of failing silently.
- Tests: `supabase/tests/booking-platform.test.sql` section 19, and the browser test that changes her schedule in
  the dashboard, checks the website's times and books one.

## Deposit and professional photos

- **Deposit**: a client pays a **JMD 3,000 deposit** online to book; the rest (the balance) is paid in person at the
  appointment. Ways to pay the deposit: **bank transfer** (NCB, Scotiabank) or **PayPal** (in US dollars at her
  rate, rounded up to the cent: at 154 it is USD 19.49), paid with her PayPal.Me link. There is no pay-in-person
  booking (`book_pay_in_person` no longer exists).
- **Professional photos** (optional add-on, **JMD 3,000**): a Yes/No choice after the client's details (No is
  chosen to start), shown in the summary ("Professional photos – JMD $3,000"), saved on the booking
  (`photos_addon`, `photos_jmd`), and shown in her dashboard, her alert emails and the client's confirmation.
- **The sums** are done by the database when the time is held (`create_booking_hold`, never by the browser):
  `total_jmd` = service price + photos, `deposit_jmd` = the deposit (never more than the total),
  `balance_jmd` = total − deposit, and the amount to pay now (`amount_jmd`) = the deposit. Example: Soft Glam
  9,500 + photos 3,000 = total 12,500; deposit 3,000 now; balance 9,500 at the appointment.
- **The booking form** shows Service price, Professional photos, Total, **Deposit due now** and **Balance to pay
  at your appointment**; the button reads **Pay JMD $3,000 deposit & Book**. The bank and PayPal sheets say
  "Deposit – send exactly JMD $3,000" with the balance under it.
- **Settings**: `booking_settings.deposit_jmd` (default 3000; empty = clients pay in full, as before) and
  `booking_settings.photos_addon_jmd` (default 3000). Before Supabase is connected, `DEPOSIT_JMD` and
  `PHOTOS_ADDON_PRICE` at the top of `app.js` are used.
- **Emails**: the client's confirmation says the deposit is paid and the balance is due at the appointment; the
  receipt lists Deposit, Photos, Booking total and Balance. Her alerts ("New booking – deposit paid", "check your
  bank") show the deposit to look for, photos, total and the balance to collect.
- **Legal pages**: Terms, Cancellation & Refund Policy and Privacy Policy describe the deposit and the balance;
  the notice periods are unchanged.

## Dashboard: clean and tidy

- **Four tabs**: Bookings, Glow Club, Stats, Settings. Big text (16px or more) and big buttons (48px or more), made
  for her phone first.
- **Bookings**: "Good morning, Launthia" (by the time in Jamaica) and "You have N new bookings to confirm." Then
  three groups that open and close: **New – needs confirming**, **Upcoming** and **Past**, each with a friendly line
  when empty. Each card shows the name, service, day and time, status, photos (Yes/No), the deposit (paid ✓ / sent –
  check your account / not paid yet) and the balance due at the appointment, with **Call** and **Email** buttons.
  The one big button is **Confirm booking**; after it the card says "Confirmed ✓ – email sent" and moves to
  Upcoming. **More** holds the rest: Mark deposit paid, Mark done, Move, Cancel, the booking details and her private
  note. One search box (name or phone).
- **New bookings arrive by themselves**: while the dashboard is open, a new booking appears straight away
  (Supabase Realtime on the `bookings` table; `platform.sql` adds the table to `supabase_realtime`), with a quiet
  check every 60 seconds as a back-up. She hears a soft chime, sees a banner "New booking from [name] – tap to view",
  a red number on the Bookings tab and "(2) Glow Dashboard" in the browser tab. The chime can be turned off in
  Settings.
- **App on her phone**: the dashboard has its own name ("Glow Dashboard"), icon and `manifest.webmanifest`, so she
  can add it to her Home Screen; a one-time tip explains how. She stays signed in on her own phone; Sign out is in
  Settings.
- **Glow Club**: birthdays this month, search, and simple member cards (name, birthday month, how they like to be
  contacted, offers yes/no, joined, message buttons, STOP). Filters and the two downloads are under **More**.
- **Stats**: four numbers – Bookings this month, Confirmed upcoming, Deposits received this month, Glow Club members.
- **Settings**: Email me when someone books (switch), Sound for new bookings (switch), Send test email, last alert,
  her account and Sign out. Then **Hours, prices & more** opens: the schedule, Your prices, How clients pay (PayPal.Me name, US dollar rate, bank accounts),
  Days off, the alert email address and Change password.
