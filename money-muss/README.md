# Money Muss Restaurant & Lounge: website

One-page site for the new Money Muss Restaurant & Lounge in Dunbars River, Westmoreland,
Jamaica (formerly Guangos, beside Yaadman). On social it is Money Muss Games & Bar.

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

## Go-live checklist

1. **Photos.** Save the nine photos into `images/` with the exact names listed under
   "Photos" below, then run `npm run build`.
2. **Owner details.** Fill in everything in the table under "Still to do before launch".
   Each one shows on the page as `[Owner to fill in: …]` or `[Owner to confirm …]`
   until it is done.
3. **The domain.** Open `tools/build.mjs`, replace `{{SITE_URL}}` near the top with the
   real address (for example `https://www.example.com`, no slash on the end) and run
   `npm run build`. That one value fills the canonical link, `og:url`, the share-image
   links, the structured data, `sitemap.xml`, the `Sitemap:` line in `robots.txt` and
   the way home on the 404 page.
4. **The form key.** Go to web3forms.com, enter the email address that should receive
   enquiries, and paste the access key they email you into `data/site.json` as
   `web3formsKey`. Put the same address in `enquiryEmail`.
5. **Check.** Run `npm run check`. It must pass with nothing left to fill in.
6. **Deploy** this `money-muss` folder (leave out `node_modules/`, `tools/` and `shots/`):
   - **Netlify or Cloudflare Pages:** connect the repository, set the publish (output)
     directory to `money-muss` and leave the build command empty. Or drag the folder
     onto the Netlify dashboard. Both serve `404.html` for missing pages on their own.
   - **Hostinger (or any cPanel-style host):** upload what is inside this folder into
     `public_html` with the File Manager, and add this line to `.htaccess` there:
     `ErrorDocument 404 /404.html`
   - **GitHub Pages:** it publishes the top of a repository or its `/docs` folder, so
     keep this folder in a repository of its own, or publish `money-muss` with a Pages
     workflow. It serves `404.html` on its own.
7. **After it is live:** send one test enquiry through the form, open the site on a
   phone, and paste the address into a WhatsApp chat to see the share preview.

## Still to do before launch

Run this at any time for the current list, with file names and line numbers:

```bash
npm run check
```

It **fails** until all nine photos are in `images/`, and it lists every placeholder.

| What | Where to put it |
|---|---|
| The eight venue photos (see below) | `images/` |
| Exact street address in Dunbars River | `index.html`, search for `exact street address` |
| Closing time and days open | `index.html`, search for `closing time` |
| Confirm the two phone numbers are current | `index.html`, search for `current numbers` |
| Full menu and J$ prices, and prices for the favourites | `data/menu.json` |
| Confirm the Friday line-up runs at the new location (Flasking Fridays; Heineken Happy Hour, then After Work Jam) | `data/specials.json`, the `confirm` lines |
| Confirm the Flasking Fridays bucket and flask prices (taken from the flyer) | `data/specials.json`, the `note` line |
| Times for Whiskey & Wings Thursdays and Karaoke Saturdays; day and time for Games Night | `data/specials.json` |
| WhatsApp number and email for enquiries, and the form key | `data/site.json` |
| Next Cups Up date, next Back To School Treat date | `index.html`, search for `Next date` |
| Founding story and the owner's name, if she wants it shown | `index.html`, search for `founding story` |
| Website address, once there is a domain | `tools/build.mjs`, `{{SITE_URL}}` near the top |
| The exact map pin (the map and directions search "Dunbars River, Westmoreland, Jamaica" until then) | `index.html`, search for `google.com/maps` |

Everything not yet known shows on the page as `[Owner to fill in: …]` or
`[Owner to confirm …]` in a dashed box, so nothing is guessed and nothing can be missed.

Opening hours are shown as "Breakfast from 6:30 a.m. · Lunch from 11:00 a.m.". Once the
closing time and days are known, also add an `openingHoursSpecification` to the
structured data near the top of `index.html`; it is left out until then on purpose.

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
puts each photo into every place that uses it. The hero photo is preloaded; every
other photo loads only as it comes near the screen.

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
  `scratch` puts a price list under the scratch-off panel (the Flasking Fridays
  buckets and flasks). `confirm` and `note` are reminders for the owner that show on
  the ticket until they are deleted. `marqueeExtras` adds names to the strip.
- `data/site.json`: where booking enquiries go (see the next section).

Running `npm run build` afterwards also writes the new menu and tickets into
`index.html` itself, so they are there for search engines and for anyone with scripts
turned off.

## How the enquiry form sends

The form checks the fields (a hidden trap field catches spam robots), then uses the
first of these that is filled in `data/site.json`:

1. `web3formsKey`: sends the enquiry straight to your inbox through Web3Forms. It is
   free and needs no server. To get the key, enter your email address at web3forms.com
   and they email it to you.
2. `formEndpoint`: posts to another form service instead (for example Formspree).
3. `whatsappNumber`: opens WhatsApp with the enquiry written out.
4. `enquiryEmail`: opens the visitor's email app with the enquiry written out.

When it sends, the form says so. If sending fails it says that too, and offers the
phone number (and "send it by email" once `enquiryEmail` is set). Until something is
set, the form says plainly that it is not connected and gives the phone number. It
never shows a "sent" message unless something was really sent.

The WhatsApp buttons (in the booking section and in the bar at the bottom of a phone
screen) stay out of the page entirely until `whatsappNumber` is filled in; the Call
button takes the full width until then.

## Visitor counts (optional, off)

Near the end of the `<head>` in `index.html` there is a commented-out line each for
Plausible, Umami and Cloudflare Web Analytics. To switch one on, put your own details
in and move that one line out of the comment. All three work without cookies.

## Files

| Path | What it is |
|---|---|
| `index.html` | The page |
| `404.html` | Page-not-found. It carries its own styles, fonts and logo, so it works from any address |
| `css/styles.css` | All styles, with the motion tokens at the top |
| `js/main.js`, `js/templates.js` | Behaviour, and the menu / ticket / marquee templates |
| `js/lightbox.js` | The photo viewer. Fetched only when there are photos to open |
| `js/scratch.js` | The scratch panel. Fetched only when a ticket with one comes near the screen |
| `js/pointer.js` | The pointer dot and the magnetic pull on the main buttons. Fetched only for a mouse, never on touch or with reduced motion |
| `js/vendor/lenis.min.js` | Lenis smooth scrolling (MIT licence) |
| `data/` | Menu, weekly nights, enquiry settings |
| `images/` | The nine photos and their web-sized copies |
| `brand/` | Logo SVGs, favicon and touch icons, share image, and the two noise textures (`grain.png`, `paper.webp`) |
| `fonts/` | Gloock, Bricolage Grotesque, DM Mono (SIL Open Font Licence), subset: three files |
| `sitemap.xml`, `robots.txt` | Written by the build from `SITE_URL` |
| `tools/` | `build`, `dev` server, `shots`, `check`, and `photos.mjs` (the list of allowed photos) |

## Checking it

```bash
npm run shots
```

Saves, at 390, 768 and 1440 wide: the full page, the hero, the menu, the weekly nights
and the footer, plus the 404 page, into `shots/`. It needs Playwright, which is not
installed by this project.

```bash
npm run shots -- --motion
```

Also films the page in motion at 390 and 1440 (the hero while scrolling, the menu
tabs, the weekly nights, the scratch panel, and the photo viewer once there are
photos): a contact sheet with one frame every 300ms, and an animated WebP of each.

```bash
npm run check
```

Lists every image and proves each comes from the nine allowed files, fails loudly for
any photo that is missing, lists every `[Owner to fill in]` and `[Owner to confirm]`,
checks links, headings and alt text, checks that the old address has not crept back,
that motion uses only the shared tokens, and guards against the old templated patterns
coming back.

## How it is built

- Logo: redrawn from the supplied artwork as SVG. `brand/logo.svg` is the full logo,
  `brand/logo-mark.svg` the small ring-and-script mark for the nav and favicon. Its
  script is the only script lettering on the page (it also signs the About letter).
- **One motion system.** The top of `css/styles.css` sets three durations (`--dur-1`
  200ms for taps and hovers, `--dur-2` 350ms for tabs, nav, sheets and buttons,
  `--dur-3` 600ms for entrances, photo reveals and the photo viewer), two springs
  (`--spring-smooth`, no bounce; `--spring-snappy`, a small overshoot, for small things
  only) and `--ease-out` for opacity. Nothing else is used. Movement rides a spring;
  opacity uses `--ease-out`. Scripted motion reads the same tokens.
- Only transform, opacity and clip-path are animated. Everything that follows the
  scroll or a finger is written from one shared frame loop in `js/main.js`, which reads
  the scroll position once per frame and sleeps when nothing is moving. Where the
  browser has CSS scroll timelines (the glass in the hero, the progress line on the
  nav, the stamp's drift) they run without any script at all.
- No animation library is used: CSS transitions and animations, the browser's own
  Web Animations (for the photo viewer) and that one loop cover everything. The menu
  tabs cross-fade with plain CSS; View Transitions were tried there and dropped
  because they cost frames on slow phones.
- The grain is one layer over the whole page: the same feTurbulence noise drawn live
  on desktop (where it shimmers in four steps every half second) and frozen into a
  small still tile (`brand/grain.png`) for phones.
- Smooth scrolling is Lenis, for mouse and trackpad. Phones and tablets keep their
  own touch scrolling.
- Reduced motion: plain scrolling, a simple fade for the logo intro, a still list in
  place of the marquee, no entrances, no rolling numbers, no reel spin, no glow pulse,
  no grain shimmer, no pointer dot or magnetic pull, a nav that never hides, a photo
  viewer and phone menu that fade instead of flying, and the scratch panel is simply
  the list of deals. With scripts off the page is complete as well.
- The intro plays once per browser session, lasts under three seconds, and any key,
  tap or scroll skips it.
