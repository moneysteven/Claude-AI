# Money Muss Restaurant & Lounge: website

One-page site for the new Money Muss Restaurant & Lounge in Dunbars River, Westmoreland,
Jamaica (formerly Guangos, beside Yaadman). On social it is Money Muss Games & Bar.

It is a plain static site: HTML, CSS and a little JavaScript. There is nothing to
install on the server. Upload this folder to any static host and it works.

The look comes from the owner's logo: the charcoal inside its ring, the champagne gold
of its script, the plum of the script's shadow and its rose martini glass. The page sits
on night, plum and navy grounds lit with a low rose and gold glow, with one champagne
band (the yearly events) and the red of the walls in the strip, the bar section and the
gallery. Gloock headlines, Bricolage Grotesque poster lettering, DM Mono for prices,
dates and times, and the logo's own kind of script (Great Vibes) in gold for the patois
lines: "Wah gwaan.", "Yuh cyaan miss it.", "Mek wi link.", "Likkle more." The weekly
nights are lottery tickets, and gold rules with the rose martini divide the sections.

## Look at it on your own computer

```bash
npm install
```

```bash
npm run dev
```

Then open http://localhost:4173. Add `?intro=1` to the address to replay the opening
video as an intro, or `?intro=0` to skip it.

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
| The two drinks photos (see Photos) | `images/` |
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

The site uses these nine files and no others. No stock, no AI-made pictures, and no
photo with a person in it.

Six of them are stills taken from the owner's walk-through, after every person was
taken out of it (see "The opening video" below): the front, the patio, the bar
shelves, the gaming machines, the staircase and the lounge. Each was checked by eye,
reflections included. Real photos can replace any of them at any time: save the new
file under the same name and run the build. The two drinks photos are still to come.

| File | Where it shows |
|---|---|
| `images/logo-clean.jpg` | The owner's logo. The build cuts it round (transparent outside the ring) into `brand/logo-<size>` for the nav, the hero, the About sign-off, the booking card and the 404 page, and makes the favicon, the phone icons and the sharing picture from it. Also a small print in the gallery |
| `images/exterior-clean.jpg` | The gallery. The step yellow and facade olive are sampled from it |
| `images/patio-umbrellas.jpg` | Full-width photo after the About letter, the gallery |
| `images/lounge-clean.jpg` | About print, a slot reel, the headline in the bar section, the gallery |
| `images/gaming-machines.jpg` | A slot reel, the bar headline, the wide photo that opens the gallery |
| `images/staircase.jpg` | A slot reel, the gallery |
| `images/bar-clean.jpg` | The gallery |
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
puts each photo into every place that uses it. Every photo loads only as it comes
near the screen (the first screen's picture is the walk-through's still, see Videos).

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

## Videos

Three clips filmed at Money Muss play on the page. They are the owner's own footage.
None has sound.

| Clip | Original | Where it plays |
|---|---|---|
| `intro-walk` | `video/source/intro-walk-steady.mp4` (37.5 s: the walk-through with every person taken out, then steadied) | The opening video, at the top of the page (see below) |
| `intro-fill` | the same file, blurred and darkened | Fills the sides of a wide screen behind the opening video. Phones never fetch it |
| `bar-pan` | `video/source/bar-pan.mov` (first 2.3 s, played forward and back) | Behind "Bar, lounge & games", in the crimson two-tone, wide on a computer and tall on a phone |
| `sign-out-front` | `video/source/sign-out-front.mov` (first 1.2 s, half speed, forward and back) | The square print beside the map ("Look for the sign.") |

How they behave:

- Each one shows a still first (its first frame), so the frame is never empty. The
  video is fetched only when it comes on screen (the opening video at once, the others
  after the page has loaded), fades in once it is really playing, and pauses when it
  goes off screen.
- They start by themselves, silently, except for visitors who have asked their phone
  or computer for less motion, or who are saving data. Those visitors see the still,
  with a play button.
- Every clip has a small round button to pause and play it.
- Two copies of each are served: AV1 (small, for browsers that play it) and H.264
  (plays everywhere, including older iPhones).

To change or add a clip: put the original (straight off the phone, `.mov` or `.mp4`)
in `video/source/` with the name above, then:

```bash
npm run video
```

```bash
npm run build
```

`npm run video` needs ffmpeg installed on the computer (`brew install ffmpeg` on a
Mac, `sudo apt install ffmpeg` on Linux). It brings iPhone HDR footage down to
ordinary colour, gives it the same warm grade as the photos (or the crimson two-tone),
cuts, crops and sizes it, and writes the web copies and stills to `video/opt/`. Which
part of each original is used, how fast, and how it is cropped are set in
`tools/clips.mjs`. The originals are large, so they stay out of git; the web copies
in `video/opt/` are committed, and they are kept as they are on a computer that does
not have the originals.

**People in the clips.** The bar clip is cut before the bartender steps in, and the
mirror shelf that reflects guests is softened on the phone cut.

### The opening video

The owner's walk from the path out front, through the front door and into the bar and
lounge is the first thing a visitor sees.

- **Nobody is in it.** At the owner's request every person was taken out of the
  walk-through with an AI video editor (Higgsfield, the FLUX video edit model), in
  three pieces joined with short cross-fades: the man who held the door is gone and
  the door now swings open by itself, and the guests and staff at the bar and the
  tables are gone. Every second was checked by eye afterwards. This is the only AI
  editing on the site, and it only removes people; the building, the signs and the
  rooms are as filmed. The edited file is `video/source/intro-walk-clean.mp4` (not in
  git, like the other originals). It is 704 by 1248 pixels, the editor's own size.
- **Steadied.** The walk was then given a steady, gliding camera with
  `tools/steady.py`: it measures how the picture moves from frame to frame and works
  out the smoothest camera path that stays within a 12% enlargement (held shots, steady
  glides, eased starts and stops), so the up-and-down float of walking is gone (about
  60 to 70% less up-and-down movement) and the turns stay. The picture's level was
  measured from its vertical lines and was already level, so tilt is left as filmed.
  The result is `video/source/intro-walk-steady.mp4`, which both `intro-walk` and
  `intro-fill` are made from. To redo it (it needs ffmpeg with vidstab, and Python 3
  with numpy, scipy and Pillow):

  ```bash
  python3 tools/steady.py video/source/intro-walk-clean.mp4 video/source/intro-walk-steady.mp4
  ```

  then `npm run video` and `npm run build`.
- **The intro.** On a visitor's first visit (once per browser session) it plays full
  screen with nothing over it but a small "Skip intro" button, a quarter faster than
  real time (`data-intro-speed="1.25"` on the hero in `index.html`), so the front door
  swings open about 10 seconds in. At the door
  (12.9 seconds into the video, `data-blend-at`), or at a tap, a scroll or a key, the
  logo, the headline, the buttons and the nav fade up over it, and it carries on
  playing at the top of the page at normal speed. For a quicker or slower intro change
  `data-intro-speed` (`1` is real time, `2` twice as fast); to let the whole walk play
  before the page appears, set `data-blend-at` to `37`.
- On a phone the video fills the screen. On a computer it stands as a tall framed
  print on the right, over a blurred copy of itself; during the intro it is centred.
- No intro for visitors who prefer less motion or are saving data, or when the page is
  opened part-way down: they get the page at once, with the video's still at the top
  (and its play button). If the video cannot start within four seconds, or stalls for
  three, the page is shown anyway.

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
- `data/site.json`: where booking enquiries go (see the next section), and the
  Christmas touches (see "Christmas" below).

Running `npm run build` afterwards also writes the new menu and tickets into
`index.html` itself, so they are there for search engines and for anyone with scripts
turned off.

## Christmas

Two small touches come out for Christmas and put themselves away again:

- a string of pepper lights along the top of the opening video, twinkling gently;
- a greeting at the head of the red strip under it.

They are drawn in code (no picture files) and are set by `christmas` in
`data/site.json`:

```json
"christmas": { "show": "auto", "from": "11-15", "to": "01-06", "greeting": "Merry Christmas & Happy New Year" }
```

- `show`: `"auto"` shows them from the `from` date to the `to` date every year
  (month-day, so 15 November to 6 January as it stands; the dates may run over New
  Year). `"on"` shows them always and `"off"` never.
- `greeting`: the line in the red strip. Use `""` for the lights only.

Save the file and the site follows it. Run `npm run build` as well, so the page
knows before it is first drawn. To see them out of season, add `?xmas=1` to the
address; `?xmas=0` hides them. With reduced motion the lights glow without
twinkling, and with scripts turned off none of it is shown.

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
| `data/` | Menu, weekly nights, enquiry settings and the Christmas setting |
| `images/` | The nine photos and their web-sized copies |
| `video/` | The owner's clips: originals in `source/` (not in git), web copies and stills in `opt/`, `manifest.json` |
| `brand/` | The owner's logo cut round at seven sizes (`logo-<size>`, AVIF, WebP and PNG), favicon and phone icons, share image, all made by the build from `images/logo-clean.jpg`; and the two noise textures (`grain.png`, `paper.webp`) |
| `fonts/` | Gloock, Bricolage Grotesque, DM Mono and Great Vibes (all SIL Open Font Licence), subset: four files. Great Vibes, the gold script, is not preloaded: it only appears below the first screen |
| `sitemap.xml`, `robots.txt` | Written by the build from `SITE_URL` |
| `tools/` | `build`, `video`, `dev` server, `shots`, `check`, `steady.py` (steadies a handheld clip), `photos.mjs` (the list of allowed photos) and `clips.mjs` (the clips) |

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

- Logo: the owner's own artwork (`images/logo-clean.jpg`), cut round by the build so
  it sits on any ground. Its colours are the site's colours (`--night`, `--plum`,
  `--gold`, `--gilt`, `--rose` at the top of `css/styles.css`), and its script is
  echoed by the gold patois lines. Gold lettering only ever uses `--gilt`, the logo's
  gold; `npm run check` holds to that.
- **One motion system.** The top of `css/styles.css` sets three durations (`--dur-1`
  200ms for taps and hovers, `--dur-2` 350ms for tabs, nav, sheets and buttons,
  `--dur-3` 600ms for entrances, photo reveals and the photo viewer), two springs
  (`--spring-smooth`, no bounce; `--spring-snappy`, a small overshoot, for small things
  only) and `--ease-out` for opacity. Nothing else is used. Movement rides a spring;
  opacity uses `--ease-out`. Scripted motion reads the same tokens.
- Only transform, opacity and clip-path are animated. Everything that follows the
  scroll or a finger is written from one shared frame loop in `js/main.js`, which reads
  the scroll position once per frame and sleeps when nothing is moving. Where the
  browser has CSS scroll timelines (the progress line on the nav) they run without any
  script at all.
- No animation library is used: CSS transitions and animations, the browser's own
  Web Animations (for the photo viewer) and that one loop cover everything. The menu
  tabs cross-fade with plain CSS; View Transitions were tried there and dropped
  because they cost frames on slow phones.
- The grain is one layer over the whole page: the same feTurbulence noise drawn live
  on desktop (where it shimmers in four steps every half second) and frozen into a
  small still tile (`brand/grain.png`) for phones.
- Smooth scrolling is Lenis, for mouse and trackpad. Phones and tablets keep their
  own touch scrolling.
- Reduced motion: plain scrolling, no intro (the opening video's still, with a play
  button), a still list in place of the marquee, no entrances, no rolling numbers, no reel spin,
  no grain shimmer, no pointer dot or magnetic pull, a nav that never hides, a photo
  viewer and phone menu that fade instead of flying, and the scratch panel is simply
  the list of deals. With scripts off the page is complete as well.
- The intro plays once per browser session, gives way when the door opens, and any
  key, tap or scroll (or "Skip intro") brings the page in at once.
