# RentYaad (demo)

A mobile-first demo of a vehicle rental marketplace for Jamaica, built as one self-contained HTML file with no backend.
Every host, vehicle, price, booking and review is **SAMPLE data**. Payments are simulated and no card details are collected.

- `rentyaad.html` is the artifact source. It has no doctype because the artifact host wraps it at publish time.
- `index.html` is a standalone copy with a doctype that you can open directly in a browser.
- `src/` holds the sources (`head.html`, `styles.css`, `body.html`, `js/*.js`). Run `./build.sh` to rebuild both files.

## Rename the app

Change `CONFIG.APP_NAME` in `src/js/00-config.js`. Update the `<title>` in `src/head.html` too, because it's the fallback name in galleries. Then run `./build.sh`.

## What's inside

- **Customer:** search by town or airport, Jamaica-time dates, type, seats, gearbox, price and features. Vehicle detail with gallery, policies, insurance, availability calendar and reviews. A multi-step booking sheet with licence checks, clash blocking and a mock "Pay deposit" step. Trips (change dates, cancel by policy, receipt, review), favourites, WhatsApp-style chat, and an AI rental assistant that understands English and Patois.
- **Business:** sign-up and profile, fleet manager with photos, seasonal pricing and maintenance mode, a per-vehicle availability calendar, bookings inbox with accept/decline and instant book, check-out and check-in with fuel, odometer, damage photos and fee handling, a dashboard with charts, and AI-suggested replies.
- **Admin:** approve, reject, verify and suspend businesses and listings, edit commission (default 10%), totals, and a disputes queue.
- **Tech:** role switcher, persistence (`window.storage` if present, otherwise `localStorage`), JSON export and import, reset demo, dark mode, and reduced-motion support.

The assistant uses the artifact AI (`claude.use("sample")`) and falls back to the legacy `window.claude.complete` if that's the only API present. When neither is available, it says so and answers from instant local search only.
