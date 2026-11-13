# Glow by Launthia — demo site

Single-file, mobile-first demo site for Glow by Launthia (Launthia Watson, luxury destination bridal makeup artist, Jamaica), in her soft neutral palette: ivory, cream, sand, nude, taupe, mocha, espresso and a muted champagne-gold.

- `index.html` — the finished site. One file: HTML, CSS, JS and every photo it uses inlined. Only three.js (r128) loads from cdnjs.
- `src/page.html` — the editable source (no media inlined).
- `assets/` — the optimised photos (WebP) and reel clips (short, 360×640, muted H.264) that get inlined.
- `build.py` — rebuilds `index.html` from `src/` + `assets/`: `python3 build.py`
- `dist/` — the optimised site for hosting (`python3 build.py --dist`): a 156 KB page plus a deferred `app.js`; photos as AVIF / WebP / JPEG at 480–1200 px and full width in `<picture>` with `srcset`/`sizes` (crisp at 1x, 2x and 3x), lazy below the first screen; the hero portrait preloaded with `fetchpriority="high"`; clips as H.264 MP4 + VP9 WebM with JPEG posters (`preload="metadata"`). Upload the whole `dist/` folder.

## Performance

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

## Glow Club (client reactivation)

- Privacy: the website never saves customer details. A booking or Glow Club sign-up goes to Launthia only as a WhatsApp message (end-to-end encrypted) with name, WhatsApp, service, date, event type, birthday and reminder consent; details an older version saved on a device are cleared on the next visit. The dashboard works with sample clients and anything the owner adds herself.
- Owner dashboard: open `#owner` (or "Owner login" in the footer). Demo passcode: `glow` — replace with real sign-in before launch.
- Rules (editable): fresh-glam reminder after 4 weeks, win-back after 8+ weeks, birthday 7 days before, bridal anniversary at 1 year, seasonal campaigns to chosen clients. Messages use editable templates.
- "Send on WhatsApp" opens wa.me with the message ready; the reminder is then marked Sent and logged. Fully automatic sending would need the WhatsApp Business API and a small backend.
- Dashboard settings and sample clients live in the owner's own browser (`glowclub.v1`); export/import JSON from the Data tab.
- Data → "Load sample clients" adds six clearly labelled sample clients for demos; "Clear sample data" removes them.

## What's in it

- Opening screen: her portrait fills the whole hero (cropped so her whole face stays in view on every screen) under a subtle dark veil, with light type and buttons. Intro (about 5.5 s, with Skip intro): black lifts to her portrait, the chrome GLOW forms, then the lipstick, line and buttons arrive. Where a GLOW letter crosses her eyes or lips it turns half see-through. After the intro, a one-second fade leads into the header: the silk swirl, the gold GLOW with "by Launthia", the lipstick with its text ring, pearls and gold rings, and her portrait blended in on the right with her face clear of the letters, dark type, a dark and a light button. The intro plays once per visit (sessionStorage `glow.introSeen`); after that the page opens on the header.
- WebGL hero: a brushed champagne-pearl "GLOW" wordmark with a soft light sweep, an interactive pearl, nude and champagne-gold 3D lipstick (drag or arrow keys) circled by "FULL GLAM • SOFT GLAM • BRIDAL GLAM", and drifting gold dust.
- Scroll-zoom story (soft glam to full glam) with her Soft Glam and Full Glam photos and the two bridal photos, layered parallax, reveals, hover-lift cards.
- About portrait with floating pearls, nude spheres and thin champagne rings.
- Services: Soft Glam $9,500 and Full Glam $10,500 – $12,000 (shown exactly as the owner gave them); Bridal Glam with "Pricing on request" and a "WhatsApp for bridal prices" button. Each card shows only the photos the owner chose for it (Soft 1, Full 1, Bridal 2).
- Destination bridal section: pinned arch with her two bridal photos.
- Shop Launthia's Favourites: filter tabs, 3D-tilt product cards, storefront button, Amazon Associate disclosure.
- Booking in four taps: service (Soft Glam $9,500, Full Glam $10,500 – $12,000, or Bridal Glam with "Get a quote on WhatsApp"), a day on the calendar, a start time, then name and WhatsApp number and Confirm, which shows "You're booked" with the service, day and time and sends the booking to Launthia on WhatsApp.
- Mobile menu: full-screen espresso satin overlay that grows as a circle from the menu button; numbered links (Home, Services, Shop, Glow Club, Book) with the current section underlined; WhatsApp pill, Instagram and YouTube, location line; scroll locked while open; closes on X, Escape or a vertical swipe; focus stays inside while open.
- Motion: every in-page link scrolls with an eased glide (offset for the nav); headings rise and unblur, cards stagger in and photos unmask as they enter the screen; buttons, cards and photos press in with a champagne ripple; services cards expand on tap on phones; the photo viewer's backdrop takes its colour from each photo, follows your finger on swipes, and flies the photo home on a swipe down; a short logo loader covers font loading.
- Performance: DPR capped at 2, lighter shaders and fewer particles below 768px, WebGL paused off-screen, automatic resolution drop on slow devices, and a static, motion-free version for `prefers-reduced-motion`.

## Booking settings

- Everything lives in the `BOOKING` block at the top of the main script in `src/page.html` (it is also the first thing in `dist/app.js`):
  - `hours`: each day's opening hours, like `'9am-5pm'`, or `'closed'`. Now: Monday to Saturday 9am to 5pm, Sunday closed. The hours line beside the form is written from this.
  - `booked`: start times already taken, by day, e.g. `'2026-12-19': ['10am', '2pm']`. Each shows pale and can't be picked.
  - `fullDays`: whole days that are full or off, e.g. `'2026-12-24'`.
- Each booking is a 1-hour slot on the hour (9:00 am to 4:00 pm with these hours), so bookings are always 1 hour apart. Past days, closed days, full days, days with every time taken and times already passed today show pale and can't be picked.
- The site can't see other customers' bookings by itself: a time only turns pale once it is added to `booked`. Doing it automatically needs a booking database.
- Deposits: if a service in `DEPOSITS` has a Whop checkout link, a "Pay deposit securely" button appears on the "You're booked" card. With no links it stays hidden.

## Placeholders to fill before launch

Search the source for `[Owner to`: what's included, her story, destination / travel details, reviews, Amazon storefront and product details.

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

