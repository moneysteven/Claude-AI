# Money Muss Restaurant & Lounge: website

One-page site for Money Muss Restaurant & Lounge (on social: Money Muss Games & Bar),
Lewisville Plaza, Shop #3, 45 Lewis Street, Savanna-la-mar, Westmoreland, Jamaica.

It is a plain static site: HTML, CSS and a little JavaScript. There is nothing to
install on the server. Upload this folder to any static host and it works.

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

| What | Where to put it |
|---|---|
| The three venue photos (see below) | `images/` |
| Full menu and J$ prices | `data/menu.json` |
| After Work Jam / Happy Hour days and times | `data/specials.json` |
| WhatsApp number and email for enquiries | `data/site.json` |
| Closing time and days open | `index.html`, search for `closing time` |
| Founding story and the owner's name, if she wants it shown | `index.html`, search for `founding story` |
| Website address, once there is a domain | `index.html`, the comment near the top |

Everything not yet known shows on the page as `[Owner to fill in: …]` in a dashed
box, so nothing is guessed and nothing can be missed.

## Photos

The site uses these four files and no others. No stock, no AI pictures, and no
photo with a person in it.

| File | What it is |
|---|---|
| `images/logo-clean.jpg` | The round logo. Kept as the reference: the site draws the logo as sharp SVG. |
| `images/exterior-clean.jpg` | Front entrance |
| `images/lounge-clean.jpg` | Lounge with the gaming machines |
| `images/bar-clean.jpg` | Bar shelves |

To add or replace a photo:

1. Save it into `images/` with exactly the name above (`.jpg`, `.jpeg`, `.png` or `.webp`).
2. Run the build.

```bash
npm run build
```

The build makes AVIF, WebP and JPEG copies at five widths into `images/opt/`, applies
a gentle colour grade, and swaps the photo into every slot that uses it. Until a file
is there, its slots show a brand-colour panel that names the missing file.

Each photo slot in `index.html` is a comment like this, and it can be tuned by hand:

```html
<!-- build:photo {"img":"bar-clean","alt":"…","sizes":"…","pos":"50% 35%","zoom":"1.7"} -->
```

`pos` is the part of the photo to keep in view when the frame crops it (left-right,
top-bottom). `zoom` makes a close-up crop. The grade is set at the top of
`tools/build.mjs`.

If more footage is added later, keep the same rule: people-free only, or crop or
blur every person out first.

## Changing the menu and the specials

No code needed. Edit the file, save, and the site shows the change.

- `data/menu.json`: the Breakfast, Lunch and Drinks tabs. Each dish has a name, an
  optional description, a price in J$ as a plain number, and `dineIn` / `toGo`
  labels.
- `data/specials.json`: the weekly specials. Set `"active": false` to switch one off
  and `true` to switch it back on.
- `data/site.json`: where booking enquiries go (WhatsApp number, email, or a form
  service address).

Running `npm run build` afterwards also writes the new menu into `index.html`
itself, so it is there for search engines and for anyone with scripts turned off.

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
| `js/main.js`, `js/templates.js` | Behaviour, and the menu / specials templates |
| `js/vendor/lenis.min.js` | Lenis smooth scrolling (MIT licence) |
| `data/` | Menu, specials, enquiry settings |
| `images/` | The four photos and their web-sized copies |
| `brand/` | Logo SVGs, favicon, share image |
| `fonts/` | Bodoni Moda, Hanken Grotesk, Antonio (SIL Open Font Licence), subset |
| `tools/` | `build`, `dev` server, `shots`, `check` |

## Checking it

```bash
npm run shots
```

Screenshots of every page at 390, 768 and 1440 wide go into `shots/`. It needs
Playwright, which is not installed by this project.

```bash
npm run check
```

Lists every image and confirms each comes from the four allowed files, lists every
`[Owner to fill in]`, and checks links, headings and alt text.

## How it is built

- Logo: redrawn from the supplied artwork as SVG. `brand/logo.svg` is the full logo,
  `brand/logo-mark.svg` the small ring-and-script mark for the nav and favicon.
- Motion uses transform and opacity only. Scroll-linked pieces (the martini glass,
  the type band, the photo pan, the rising arcs) are CSS scroll timelines; where a
  browser lacks them the page is still, with a small script standing in for the
  glass on desktop.
- Smooth scrolling is Lenis, for mouse and trackpad. Phones and tablets keep their
  own touch scrolling. Reduced-motion visitors get plain scrolling, no travel, and
  a simple fade in place of the logo intro.
- The intro plays once per browser session, lasts under three seconds, and any key,
  tap or scroll skips it.
