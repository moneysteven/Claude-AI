# Glow by Launthia — demo site

Single-file, mobile-first demo site for Glow by Launthia (Launthia Watson, luxury destination bridal makeup artist, Jamaica), in her soft neutral palette: ivory, cream, sand, nude, taupe, mocha, espresso and a muted champagne-gold.

- `index.html` — the finished site. One file: HTML, CSS, JS, every photo it uses, the fonts (Bodoni Moda, Hanken Grotesk) and three.js (r128), all inlined. The owner dashboard opens at `#owner`. Only Supabase (once connected) and Whop's checkout are on other sites.
- `src/page.html` — the editable source (no media inlined).
- `assets/` — the optimised photos (WebP) and reel clips (short, 360×640, muted H.264) that get inlined.
- `build.py` — rebuilds `index.html` from `src/` + `assets/`: `python3 build.py`
- `dist/` — the optimised site for hosting (`python3 build.py --dist`): a 176 KB page plus a deferred `app.js`, the owner dashboard in `owner/` (`/owner`), `robots.txt` and `.htaccess`; photos as WebP / JPEG at 480–1200 px and full width in `<picture>` with `srcset`/`sizes` (crisp at 1x, 2x and 3x), lazy below the first screen; the hero portrait preloaded with `fetchpriority="high"`; clips as H.264 MP4 + VP9 WebM with JPEG posters (`preload="metadata"`). Upload the whole `dist/` folder.

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
- Every phone number written on the page is a tap-to-call link. Launthia's email address, wherever it is written, opens a new Gmail message to her in a new tab (`https://mail.google.com/mail/?view=cm&fs=1&to=…`); the "Send by email" / "Get a quote by email" buttons still open the visitor's own mail app with the message filled in (except inside the offers checkbox label, where a link would get in the way of ticking it). Esc closes the menu, the legal pages and the owner page's dialog.

## Owner dashboard and database (Supabase)

- Bookings (on "Pay & Book") and Glow Club joins are saved to Supabase, in the `bookings` and `glow_club` tables. The booking form now asks for the client's email (required), so Launthia can send a confirmation. If saving fails, the visitor carries on as normal.
- Set-up: run `supabase/setup.sql` in the Supabase SQL Editor, then put the Project URL and the **anon public** key in `SUPABASE_URL` / `SUPABASE_ANON_KEY` in the SETTINGS block at the top of the main script. Never paste the service_role key or any secret key: the site refuses to use one. `supabase/check-public-cannot-read.sql` proves the public key can't read, change or delete anything (every line should start with "OK").
- Where it lives: in the single file, open the address with `#owner` on the end (the site is hidden while it's open). On Hostinger it is its own page, `/owner/` (`dist/owner/index.html`, `owner.css`, `owner.js`, with `noindex` and no caching); `#owner` and `/owner.html` go there. There is no link to it on the site.
- Sign-in: email + password (with show/hide), "Forgot password?" (always the same neutral message), "Set your password" for the invite and reset links, and "Access denied" for any other account. There is no sign-up anywhere. The database rules allow only Launthiawatson@yahoo.com to read or change anything.
- Tabs (pill tabs on a laptop, a bottom bar on a phone): **Bookings** (Upcoming / This week / Paid this month, Upcoming/Past, search, day filter, cards with Confirm, Mark paid, Mark done, Cancel and a private note), **Glow Club** (birthdays this month, search, filter, Text / WhatsApp / Email, Mark as STOP, two CSV downloads), **Stats**, **Settings** (booking alert switch and email, Send test email, last alert, account).
- Emails (Supabase Edge Functions + Resend, see `supabase/functions/`): `notify-owner` emails Launthia one alert per new booking (a Database Webhook calls it); `send-confirmation` emails the client once when Launthia taps Confirm. Both retry at most twice, stop at 30 emails an hour, and log to `alert_log`. The Resend key lives only in Supabase's secrets, never in the site. The website itself never sends any message.
- Spam protection: a hidden honeypot field on both forms; one booking or join per phone number (or email) every 2 minutes, checked on the device and again by the database; lengths and formats checked before saving and again by the database.
- Settings > **Your prices**: Launthia changes the Soft Glam and Full Glam prices (a range like `10,500 – $12,000` is fine); the website shows them everywhere (service cards, booking choices, summary, Pay button, Terms). Whop still charges what is set in Whop. **Days I'm not working**: tap a day to block it off; clients can't book it on the website ("Not available"). Both live in the `site_prices` and `blocked_days` tables (anyone can read them, only Launthia can change them); the website reads them when a page opens. Re-running `supabase/setup.sql` adds them safely.
- Bookings > **Pick a date** opens the dashboard's own calendar (days with bookings have a dot). Glow Club > **Email** (members who agreed to offers) opens a message writer with ready-written Birthday, Thinking of you and New openings emails to edit, then "Open in my email" or "Copy message"; nothing is sent by the website and every message says how to stop them. Members who didn't agree get a plain email.
- Preview sign-in: while the Supabase details are still placeholders, Launthiawatson@yahoo.com with the password `secret123` (or `secret 123`) opens a clean, empty dashboard kept in memory only (nothing saved or sent). It switches itself off as soon as real Supabase details are in the settings; then only her real Supabase account can sign in.
- Motion: see `OWNER-MOTION.md` (the brief, from the "20 Principles of UX & Animation" video). The eye blinks and draws its line, cards land in turn, numbers count up, tabs slide, big wins sparkle, mistakes shake. Layout, words and colours are unchanged; "reduce motion" turns it all into simple fades.
- No timers send requests. Every request starts with a tap (or opening a tab), a failed request is tried at most twice, and the dashboard's last lists are kept for this tab only (sessionStorage), cleared on sign-out. supabase-js 2.49.4 loads from jsDelivr (with an integrity check) only when it's needed.

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

- WhatsApp is not a way to book: the header, menu, footer and floating buttons say "Book now" and go to the booking section; bookings are made with Pay & Book and the details go to Launthia by text (SMS) and email. For questions: text or call 1-876-277-8913 or email Launthiawatson@yahoo.com. WhatsApp stays only as a Glow Club contact choice.
- Whop: `WHOP_SOFT_GLAM_LINK` and `WHOP_FULL_GLAM_LINK` (SETTINGS block) hold `[PASTE WHOP SOFT GLAM LINK]` and `[PASTE WHOP FULL GLAM LINK]`. Until a real `https://whop.com/...` link is in, "Pay JMD … & Book" says "Online payment is coming soon. Please text or email Launthia to book."
- The text/email booking message says "Payment: not yet paid", or, after the Pay tap, "Payment: started on Whop's checkout, not confirmed yet". It never says paid (the site can't see whether a Whop payment went through).
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

All in the SETTINGS block at the top of the main script (`src/page.html`, and the first lines of `dist/app.js`): `WHOP_SOFT_GLAM_LINK`, `WHOP_FULL_GLAM_LINK`, `LEGAL_ENTITY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`. On Hostinger, `dist/owner/owner.js` starts with its own copy of `SUPABASE_URL` / `SUPABASE_ANON_KEY` (filled from the page when you build). Supabase secrets (never in the site): `RESEND_API_KEY`, `ALERT_FROM`, `CONFIRM_FROM` (bookings@[verified domain]), `ALERT_WEBHOOK_SECRET`, `SITE_URL`. Optional: `STOREFRONT_URL`, `PRODUCTS` and `AMAZON_ASSOCIATE` (the Shop appears once filled), and `SITE_URL` in `build.py` (canonical link and link-preview photo).

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

