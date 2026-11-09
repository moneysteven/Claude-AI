# Kenny's Italian Cafe · website

A fast, multi-page restaurant website for Kenny's Italian Cafe, Norman Manley Boulevard (the Hip Strip), Negril, Jamaica.
Plain HTML, CSS and JavaScript: no build step, no libraries. Open `index.html` or put the folder on any static host.

## Pages

| File | Page |
|---|---|
| `index.html` | Home: opening intro, video hero ("Where Italy Meets Negril"), food, pasta favourites, bar, garden & cabanas, Uptown Fridayz, Dolce Vita, guest reviews (empty until real reviews are added), visit |
| `menu.html` | Menu with tabs: Pasta (filled in), Pizza, Seafood, Steak, Appetizers & Sides, Salad, Ice Cream & Desserts (placeholders) |
| `about.html` | The story and the owner, Devon "Kenny" Johnson |
| `reservations.html` | Booking form that sends the details to WhatsApp 876-912-3719 (no payment) |
| `cabanas.html` | Private cabanas and special occasions, with WhatsApp enquiry buttons |
| `events.html` | Uptown Fridayz and an events list you can update |
| `gallery.html` | Photo and video grid with filters and a lightbox |
| `contact.html` | Phone, WhatsApp, email, address, hours, Google Map |

## What's where

```
index.html … contact.html   the 8 pages
css/styles.css              all styling. Colours and fonts are at the top (:root)
js/main.js                  all behaviour. THE EDITABLE DATA BLOCK IS AT THE TOP
partials/                   the shared <head> bits, header and footer (see "Header and footer")
assets/img/                 optimised photos (WebP 480/960/1600 + JPG fallback), logo, icons, video posters
assets/video/               hero.mp4/.webm, intro.mp4/.webm, intro-mobile.mp4/.webm, background loops
content/business.json       the facts used to build the site, plus the list of what's still missing
content/media.json          every supplied photo: its role, alt text, and the ones left out (with the reason)
tools/                      scripts to rebuild images, videos and the intro, and to test the site
_source/                    the original uploads (not linked by the site, not in the zip)
```

## Everyday edits (no tools needed): `js/main.js`, top block

Open `js/main.js`. Everything between the two `====` lines at the top is safe to edit:

- **Hours**: `hours: { mon: ["15:00", "24:00"], … fri: ["15:00", "02:00"], sat: null }`
  24-hour clock. `"24:00"` = midnight. A closing time earlier than the opening time runs past midnight.
  `null` shows "Call to confirm" (Saturday, until the hours are published). The open-now badge, every hours
  table and the booking time slots update automatically.
- **Menu**: add dishes to a category's `items`, e.g. `{ name: "Margherita", desc: "Tomato, mozzarella, basil", price: "$14" }`.
  Leave `price: ""` if it isn't confirmed: the site shows "Price to be confirmed" and never $0.
  The "Prices to be confirmed" note under each price comes from `priceNote`. Set it to `""` once the prices are confirmed.
  When a category has dishes, its "Coming soon" card is replaced by the list automatically.
- **Events**: add `{ title: "…", date: "2026-12-31", meta: "8 pm · DJ", desc: "…" }`. Dated events hide themselves after the date.
- **Reviews**: add real reviews only, word for word: `{ quote: "…", name: "First name", source: "Google review" }`.
  The reviews grid on the home page stays hidden while the list is empty.
- **Social links**: paste the real Instagram and Facebook page addresses into `socials`. Every icon on every page updates.

After an hours change, also update the `openingHoursSpecification` part of `partials/head.html` (for Google) and run
`python3 tools/sync_partials.py`.

## Page text

Edit the `.html` files directly. Each page's own content sits between `<main id="main">` and `</main>`.
The phone number appears in the HTML as `876-912-3719` (shown), `+18769123719` (tap to call) and `18769123719` (WhatsApp):
search and replace all three if it ever changes, in the HTML files, `partials/` and `js/main.js`.

## Header and footer

The header, footer and shared `<head>` lines are the same on every page. Change them once in `partials/header.html`,
`partials/footer.html` or `partials/head.html`, then run:

```bash
python3 tools/sync_partials.py
```

It only replaces the marked blocks (`<!-- @header -->` … `<!-- /@header -->` and so on) and keeps each page's own content.

## Colours and fonts

`css/styles.css`, top of the file: `--gold`, `--red` (logo red `#CF2B36`), `--green` (logo green `#009247`), `--ink` (background).
Headings use Cormorant Garamond, body text uses Manrope (both from Google Fonts).

## Photos

- To replace a photo, keep its name. Put the new JPG in `_source/renamed/<name>.jpg` and run
  `python3 tools/optimize_images.py _source/renamed/<name>.jpg assets/img`. It makes the WebP sizes and the JPG fallback,
  and keeps every file under 250 KB.
- To use a new photo somewhere, copy an existing `<picture>` block on the page and change the name and the `alt` text.
- Menu photos are listed by name in each category's `photos` in `js/main.js`.

## Hero video and background loops

- **Swap the hero video**: replace `assets/video/hero.mp4`, `assets/video/hero.webm` and `assets/img/hero-poster.jpg`,
  or change the source file in `tools/make_videos.sh` and run it. The script also rebuilds every background loop.
  Keep the hero under 6 MB, muted (no audio track).
- The section loops are cut from the supplied videos in `tools/make_videos.sh` (start time and length per loop).

## The opening intro (home page only)

About 4 seconds of quick cuts from the restaurant's own footage, then the logo, then the site forms in (about 6 seconds in all).
It plays once per visit, never with "reduce motion" or data saver turned on, and "Skip intro" or Esc skips it.

- **Rebuild it**: edit the shot lists in `tools/make_intro.py` (`WIDE` for computers, `PHONE` for phones) and run
  `python3 tools/make_intro.py` from this folder (needs ffmpeg).
- **Turn it off**: in `index.html`, delete the `<div class="opener" id="opener">` block and the small script after it
  (first thing in `<body>`), and in `<head>` delete the script that adds `opener-on`.

## Testing

```bash
node tools/qa.js . qa
```

```bash
node tools/test_interactions.js . qa
```

The first checks every page at 375, 768 and 1440 px for errors, missing files, broken images, missing alt text,
broken links, sideways scrolling and small tap targets, and saves screenshots. The second clicks through the drawer,
menu tabs, booking form, lightbox, open-now badge and the intro. Both need Node and Playwright.

## Going live

The canonical, Open Graph and Google (JSON-LD) links assume the domain is **https://kennysitaliancafe.com/**.
If the site goes on a different domain, search and replace that address in the HTML files and `partials/head.html`.

- **Netlify Drop**: drag this folder onto app.netlify.com/drop.
- **Vercel**: run `npx vercel` in this folder.
- **GitHub Pages**: push the folder to a repository, then Settings → Pages.

Website by Steven Scale Solutions · stevenscalesolutions.com
