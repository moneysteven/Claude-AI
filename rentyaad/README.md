# RentYaad (demo)

A mobile-first demo of a vehicle rental marketplace for Jamaica, built as one self-contained HTML file with no backend.
Every host, vehicle, price, booking and review is **SAMPLE data**. Payments are simulated: card numbers are never stored or sent.

- `rentyaad.html` is the artifact source. It has no doctype because the artifact host wraps it at publish time.
- `index.html` is a standalone copy with a doctype that you can open directly in a browser.
- `src/` holds the sources (`head.html`, `styles.css`, `body.html`, `js/*.js`). Run `./build.sh` to rebuild both files.

## Rename the app

Change `CONFIG.APP_NAME` in `src/js/00-config.js`. Update the `<title>` in `src/head.html` too, because it's the fallback name in galleries. Then run `./build.sh`.

## Demo sign-in

The welcome screen offers **Continue as Renter** and **Continue as Host**. One account can be both and switch later.

- Demo account: `demo@rentyaad.demo` / `Demo1234!` (renter, and host of the sample businesses).
- The password reset code is shown on screen because no email or SMS is sent.

**This is demo authentication.** Accounts live in this browser's storage only. Passwords are salted and hashed with SHA-256 (SubtleCrypto) and never stored in plain text, but a production app needs a real server, a slow password hash (Argon2 or bcrypt) and server-side sessions.

### Face ID, Touch ID and fingerprint

After the first sign-in the app offers biometric unlock through WebAuthn: `navigator.credentials.create/get` with `authenticatorAttachment: "platform"` and `userVerification: "required"`.

- On the live HTTPS site this shows the device's real Face ID, Touch ID or fingerprint prompt.
- Inside the artifact preview iframe WebAuthn is blocked, so a clearly labelled simulated prompt is shown instead.
- Biometric data never leaves the device. The demo only stores the credential ID.

## What's inside

- **Design:** neutral palette (`#FAFAFA`, `#F2F2F7`, `#111`) with one deep-green accent (`#0B5D3B`), 1px hairlines, Inter / SF Pro, thin line icons, edge-to-edge photo cards, frosted bars, iOS-style motion and full dark mode. Tokens live at the top of `src/styles.css`.
- **Accounts:** sign up with full name, phone (`+1 876` format), email, password with a strength meter, parish and terms. Log in with email or phone. Forgot password with a mock reset code. Remember me. Hosts add a business or individual name, a licence photo (ID placeholder) and an optional payout preference. The Profile page has a photo, verification badges, parish, biometrics, sign out and delete account.
- **Renter:** search by parish, then town, or **Near me** (geolocation, sorted by distance, with an approximate-town fallback when location is blocked). Cards and detail pages show "Located in Little London, Westmoreland". Vehicle detail, availability, insurance, extras, pick-up options, booking with licence checks, trips, receipts, reviews, favourites, chat, and the AI rental assistant (English and Patois).
- **Host:** a 6-step **List a vehicle** flow with a progress bar:
  1. Basics: make, model, year, type, seats, gearbox, fuel, colour. The plate is never shown publicly.
  2. Photos: take or choose several, compressed in the browser. Drag to reorder, set the cover, or delete.
  3. Description: title, description with a character counter, a features checklist, and rules.
  4. Location: all 14 parishes and their towns, an "Other" free-text town, an optional landmark, and pick-up options (at your location, airport delivery or hotel delivery, each with a fee).
  5. Pricing: daily, weekly and monthly rates, seasonal pricing, deposit, mileage limit and minimum age.
  6. Review and publish.

  Hosts can edit, pause or delete listings later. Also included: a bookings inbox, check-out and check-in, a dashboard, payments to collect, and the business profile.
- **Payments:** each host chooses which methods they accept: **Pay in app** (card), **Cash on pick-up** or **Bank transfer**, in any mix. Renters see them on the listing and choose at checkout, paying the deposit or the full amount now. The summary shows what's due now and what's due at pick-up. The in-app option is a demo Apple-Pay-style card sheet that checks the card with Luhn, shows a success animation and a receipt, and keeps only the brand and last 4 digits. WiPay or Fygaro would be connected for live payments.
- **Admin:** approve, reject, verify and suspend businesses and listings, set the commission (default 10%), view totals and handle disputes.
- **Tech:** persistence (`window.storage` if present, otherwise `localStorage`), JSON export and import, reset demo, and reduced-motion support. Data saved by the first version is migrated automatically.

The assistant uses the artifact AI (`claude.use("sample")`) and falls back to the legacy `window.claude.complete` if that's the only API present. When neither is available, it says so and answers from instant local search only.

Sample listings use studio-style renders because the artifact sandbox can't load external images. Photos that hosts upload are shown as real photos.
