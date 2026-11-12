# Possessions Book Store: demo preview site

A one-page, mobile-first **demo** of a website for Possessions Book Store,
Savanna-la-Mar, Jamaica. It is meant to be shown to the owner in person.
It is not the live site: a "Demo preview" tag stays in the corner of every
screen, and the page tells search engines not to index it (`noindex` plus
`robots.txt`).

## Show it

`dist/` is a finished static site. Nothing needs installing to show it.

- **Fastest public link:** drag the `dist` folder onto
  <https://app.netlify.com/drop>. You get a private HTTPS URL to open on a
  phone. The included `_headers` file sets caching and `noindex` there.
- **Locally:**

  ```bash
  cd demos/possessions-book-store
  npm run serve
  ```

  Then open <http://localhost:4173>.
- **Replay the intro:** the intro plays once per visit (per browser tab).
  To see it again, add `#intro` (or `?intro`) to the URL, for example
  `http://localhost:4173/#intro`, or open a new tab.

Phone tilt (the 3D objects follow the tilt of the phone) needs HTTPS, so it
works on a Netlify link but not on a plain `http://` LAN address. On
iPhone, tap an empty part of the header once to allow motion access. Without
tilt, the objects still drift and follow a finger or mouse.

## What's in it

| Part | How it's built |
| --- | --- |
| Intro (about 3 s, Skip button plus Esc) | A CSS 3D leather book with gilded edges: it opens, the pages flutter, gold letters float out and the light fills the screen. Only transform and opacity animate, so it runs on the compositor. |
| 3D header | Three.js. Every object is built in code: book stack, open book with a turning page, pencil, fountain pen, reading glasses, ruler, loose pages and dust motes, all in warm "library lamp" lighting. No model or photo downloads. |
| Wordmark | "POSSESSIONS" (Playfair Display) and "Book Store" (Pinyon Script) are outlined to SVG paths with a gold-foil gradient, an emboss filter, extrusion and a passing sheen. They stay crisp at any resolution and cause no font flash. |
| Sections | About, What We Sell (3D book spines), Back to School (booklist call to action), In Stock (searchable stock list), Visit (Google Map), Contact, Footer. Elements reveal as you scroll using IntersectionObserver. |
| In Stock | A card-catalogue cabinet: school-level index tabs on a mahogany drawer, category chips with live counts, search ("maths", "CSEC", "exercise books"), sorting and "in stock only". Results sit on labelled shelves per level, each item on a catalogue card with a book cover coloured by subject and an In stock / Few left / Out of stock status. Code: `src/stock.js`. |
| My Booklist | Parents tap "Add to list" on any item. A "My booklist" button then opens their list, which they can email to the shop (it pre-fills an email) or copy. The list is kept only in that person's browser (localStorage). It is an invitation to get in touch, not an order or reservation. |

### Content rules followed

The page uses only the verified facts supplied: name, address, the
directions line, both phone numbers, the email address, and what the shop is
known for. It has no opening times, shop number, WhatsApp, social links,
prices, reviews, owner names, founding year, logo or photos of the shop.
Anything not verified is neutral demo copy that makes no factual claims.

The stock list currently holds **sample entries only**. They are generic
items (for example "Mathematics textbook · CSEC"), not real titles. Each card
is tagged "Sample", and a notice above the list says these are not the
shop's actual stock.

## Updating the stock list

The stock list lives in `src/data/stock.json`. Edit it, then run
`npm run build`. Each item looks like this:

```json
{ "item": "Mathematics textbook", "category": "School Textbooks", "subject": "Mathematics", "level": "CSEC (Grades 10–11)", "status": "in" }
```

- `category` must be one of `School Textbooks`, `Workbooks`, `Stationery`
  or `Gifts`, to match the filter buttons.
- `level` should be one of the values in the `levels` list at the top of the
  file. That list fills the level filter. Items with `All levels` show under
  every level.
- `status` is `in` (In stock), `low` (Few left) or `out` (Out of stock).
- When the list holds the shop's real stock, set `"sample": false`. That
  removes the demo notice and the "Sample" tags.

Search also covers subject and level, so "maths" finds Mathematics and
"CXC" finds CSEC items.

### Performance notes

- No scroll listeners and no timers. Animation runs on `requestAnimationFrame`
  and CSS/WAAPI animations, using transform and opacity only.
- The 3D loop runs at the display's own refresh rate with delta-time
  animation. It pauses when the header is off-screen or the tab is hidden,
  caps pixel ratio at 2 and lowers resolution automatically if frames start
  dropping. 3D setup is split across frames so it never delays first paint.
- With `prefers-reduced-motion`, the intro is skipped, the 3D scene is
  rendered once (frozen) and reveals are instant.
- CSS and the UI script are minified and inlined. The 3D bundle is
  tree-shaken, minified and hashed (about 150 KB gzipped). Only the five font
  weights in use ship, and the first-screen fonts are preloaded.
- Note: iPhone Safari limits web pages to 60 fps by default, whatever the
  screen. Chrome and Android run at the panel's full rate (90/120 Hz).

## Editing and rebuilding

Source lives in `src/`. Rebuild after any change:

```bash
cd demos/possessions-book-store
npm install
npm run build
```

`npm run assets` regenerates the outlined wordmark, ring text, grain texture
and favicon into `src/generated` and `src/static`. You only need it if you
change the wordmark or ring wording.

- `src/index.html`: page structure and all copy
- `src/styles.css`: design tokens (palette and type), layout, intro, reveals
- `src/app.js`: intro timing, nav, mobile menu, scroll reveals, tilt input
- `src/scene.js`: the Three.js header (objects, lighting, layout per screen shape)
- `scripts/`: asset generation, build and a dependency-free preview server

Fonts are self-hosted from Fontsource (SIL Open Font License). three.js is
MIT licensed, and its licence notice is kept in the bundle.
