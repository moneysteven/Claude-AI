# Money Muss Restaurant & Lounge: website

One-page site for Money Muss Restaurant & Lounge (on social: Money Muss Games & Bar),
Lewisville Plaza, Shop #3, 45 Lewis Street, Savanna-la-mar, Westmoreland, Jamaica.

It is a plain static site: HTML, CSS and a little JavaScript. There is nothing to
install on the server. Upload this folder to any static host and it works.

The look: a hand-painted shop sign, a printed rum label and a scratch card. Big
Gloock headlines, Bricolage Grotesque poster lettering, DM Mono for prices, dates and
times, paper grain over everything, and the weekly nights as lottery tickets.

## Look at it on your own computer

```bash
npm install
```

```bash
npm run dev
```

Then open http://localhost:4173. Add `?intro=1` to the address to replay the logo
intro, or `?intro=0` to skip it.

## Still to do before launch

Run this at any time for the current list, with file names and line numbers:

```bash
npm run check
```

It **fails** until all nine photos are in `images/`, and it lists every placeholder.

| What | Where to put it |
|---|---|
| The eight venue photos (see below) | `images/` |
| Full menu and J$ prices, and prices for the favourites | `data/menu.json` |
| Times for Whiskey & Wings Thursdays and Karaoke Saturdays | `data/specials.json` |
| Day and time for After Work Jam and Games Night | `data/specials.json` |
| Flasking Fridays flask and bucket deals, and confirm the prices | `data/specials.json` |
| WhatsApp number and email for enquiries | `data/site.json` |
| Next Cups Up date, next Back To School Treat date | `index.html`, search for `Next date` |
| Closing time and days open | `index.html`, search for `closing time` |
| Founding story and the owner's name, if she wants it shown | `index.html`, search for `founding story` |
| Website address, once there is a domain | `index.html`, the comment near the top |

Everything not yet known shows on the page as `[Owner to fill in: …]` or
`[Owner to confirm …]` in a dashed box, so nothing is guessed and nothing can be missed.

## Photos

The site uses these nine files and no others. No stock, no AI pictures, and no
photo with a person in it.

| File | Where it shows |
|---|---|
| `images/logo-clean.jpg` | A small print in the gallery (the logo itself is drawn as sharp SVG) |
| `images/exterior-clean.jpg` | The tall print in the hero, the print beside the map, the gallery. The step yellow and facade olive are sampled from it |
| `images/patio-umbrellas.jpg` | Full-width photo after the About letter, the gallery |
| `images/lounge-clean.jpg` | About print, a slot reel, the headline in the bar section, the gallery |
| `images/gaming-machines.jpg` | A slot reel, the bar headline, the wide photo that opens the gallery |
| `images/staircase.jpg` | A slot reel, the gallery |
| `images/bar-clean.jpg` | Full-width crimson two-tone behind "Bar, lounge & games", the gallery |
| `images/drinks-red-stripe.jpg` | About print, the bar headline, the gallery |
| `images/drinks-guinness-bucket.jpg` | The print beside the menu, the gallery |

To add or replace a photo:

1. Save it into `images/` with exactly the name above (`.jpg`, `.jpeg`, `.png` or `.webp`).
2. Run the build.

```bash
npm run build
```

The build makes AVIF, WebP and JPEG copies of all nine at five widths into
`images/opt/`, gives every photo the same warm grade (lifted blacks, a little
red-orange warmth, a light vignette), makes the crimson two-tone of `bar-clean`, and
puts each photo into every place that uses it.

**There are no stand-in panels.** A photo that is not in `images/` is simply left out:
its frame, reel or print is not drawn, and the gallery section stays hidden until at
least one venue photo exists. The build prints a warning and `npm run check` fails
until every file is there.

Each photo in `index.html` is a comment like this, and it can be tuned by hand:

```html
<!-- build:photo {"img":"bar-clean","alt":"…","sizes":"…","pos":"50% 35%"} -->
```

`pos` is the part of the photo to keep in view when the frame crops it (left-right,
top-bottom). The grade is set at the top of `tools/build.mjs`. The alt text and the
short captions were written from the file names: read them against the real photos
and correct anything that does not match.

If more footage is added later, keep the same rule: people-free only, or crop or
blur every person out first.

## Changing the menu and the weekly nights

No code needed. Edit the file, save, and the site shows the change.

- `data/menu.json`: the Breakfast, Lunch and Drinks tabs. Each dish has a name, an
  optional description, a price in J$ as a plain number, and `dineIn` / `toGo`
  stamps. `favourites` is the "Jamaican favourites" label: names only.
- `data/specials.json`: the weekly nights. Each one becomes a ticket, and its name
  joins the moving strip under the top of the page. Set `"active": false` to switch
  one off; the heading ("Five reasons to pass through") counts whatever is on.
  `scratch` puts deals behind the scratch-off panel. `marqueeExtras` adds names to
  the strip.
- `data/site.json`: where booking enquiries go (WhatsApp number, email, or a form
  service address). The WhatsApp number also switches on the WhatsApp half of the
  call bar at the bottom of the phone screen.

Running `npm run build` afterwards also writes the new menu and tickets into
`index.html` itself, so they are there for search engines and for anyone with scripts
turned off.

## How the enquiry form sends

The form checks the fields, then uses the first of these that is filled in
`data/site.json`:

1. `formEndpoint`: posts the enquiry to a form service (for example Formspree).
2. `whatsappNumber`: opens WhatsApp with the enquiry written out.
3. `enquiryEmail`: opens the visitor's email app with the enquiry written out.

Until one is set, the form says plainly that it is not connected and gives the phone
number. It never shows a "sent" message unless something was really sent.

## Putting it online

Point any static host (Netlify, Cloudflare Pages, GitHub Pages, cPanel) at this
`money-muss` folder. No build command is needed: the built files are already here.
Leave out `node_modules/` and `tools/`.

`404.html` loads its files from the site root, so it expects the site to sit at the
top of its domain.

## Files

| Path | What it is |
|---|---|
| `index.html` | The page |
| `404.html` | Page-not-found |
| `css/styles.css` | All styles |
| `js/main.js`, `js/templates.js` | Behaviour, and the menu / ticket / marquee templates |
| `js/scratch.js` | The scratch panel. Loaded only when a ticket with one comes near the screen |
| `js/cursor.js` | The pointer chip. Loaded only for a mouse, never on touch or with reduced motion |
| `js/vendor/lenis.min.js` | Lenis smooth scrolling (MIT licence) |
| `data/` | Menu, weekly nights, enquiry settings |
| `images/` | The nine photos and their web-sized copies |
| `brand/` | Logo SVGs, favicon, share image, and the two noise textures (`grain.png`, `paper.webp`) |
| `fonts/` | Gloock, Bricolage Grotesque, DM Mono (SIL Open Font Licence), subset: three files |
| `tools/` | `build`, `dev` server, `shots`, `check`, and `photos.mjs` (the list of allowed photos) |

## Checking it

```bash
npm run shots
```

Saves, at 390, 768 and 1440 wide: the full page, the hero, the menu, the weekly nights
and the footer, plus the 404 page, into `shots/`. It needs Playwright, which is not
installed by this project.

```bash
npm run check
```

Lists every image and proves each comes from the nine allowed files, fails loudly for
any photo that is missing, lists every `[Owner to fill in]` and `[Owner to confirm]`,
checks links, headings and alt text, and guards against the old templated patterns
coming back.

## How it is built

- Logo: redrawn from the supplied artwork as SVG. `brand/logo.svg` is the full logo,
  `brand/logo-mark.svg` the small ring-and-script mark for the nav and favicon. Its
  script is the only script lettering on the page (it also signs the About letter).
- Motion uses transform and opacity only. The photo wipes clip with a fixed inset and
  move a mask by transform; the buttons press by transform, with a shadow that is
  switched, never animated.
- The grain is one layer over the whole page: the same feTurbulence noise drawn live
  on desktop and frozen into a small tile (`brand/grain.png`) for phones.
- Smooth scrolling is Lenis, for mouse and trackpad. Phones and tablets keep their
  own touch scrolling.
- Reduced motion: plain scrolling, a simple fade for the logo intro, a still list in
  place of the marquee, no reel spin, no photo wipes, no pointer chip, and the scratch
  panel is simply the list of deals. With scripts off the page is complete as well.
- The intro plays once per browser session, lasts under three seconds, and any key,
  tap or scroll skips it.
