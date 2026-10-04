# Candid Expressions Photography — Website

A modern, mobile-first website for **Candid Expressions Photography**, Shop #15 Hendon Mall,
Beckford Street, Savanna-la-Mar, Westmoreland, Jamaica.

No server, build tools or database needed. It is plain HTML/CSS/JavaScript, so it runs on any
free static host (GitHub Pages, Netlify, Cloudflare Pages) or straight from a folder.

## Pages

| Page | File | What's on it |
|---|---|---|
| Home | `index.html` | Animated intro (the name written over your photo), photo stream, wedding photo band, featured work, services, how it works, reviews, booking call-to-action |
| About | `about.html` | Story, values, studio address + map |
| Galleries / Portfolio | `galleries.html` | Weddings · Birthdays & Events · Schools · Photo Sessions · Portraits · Aerial & Real Estate · ID Printing, each with its options and a "Book" button |
| Services & Pricing | `services.html` | Package cards with "Starting at" prices, prints & digital files, Fiwi Place add-ons, FAQ |
| Booking / Contact | `booking.html` | Smart form that changes per service, plus WhatsApp, phone, email and map |
| Client Proofing | `proofing.html` | Clients enter an access code, search their IMG #, and send a print/digital order |
| Testimonials | `testimonials.html` | Reviews, plus a "Leave a review" form |

Every page has the same footer with the address (tap for Google Maps directions), an embedded map,
phone, email and WhatsApp, plus a floating WhatsApp button.

## How the forms work

The booking, review and proofing-order forms open **WhatsApp** (or the client's **email app**) with
everything they filled in already typed out. The client just presses *send*, and it arrives on
(876) 568-5668 or candidexpressionsphotography@gmail.com.

Optional: to receive form submissions straight to your email without the client's email app, make a
free form at [formspree.io](https://formspree.io), then paste its URL into `formEndpoint` in
`js/content.js`.

## Editing the site: everything is in `js/content.js`

Open `js/content.js` in any text editor (on GitHub, open the file and tap the ✏️ pencil).

- **Prices:** in `PRICES`, replace `null` with your price in quotes, for example `school: "J$5,000",`.
  Until you do, the site shows "Ask for a quote".
- **Photos:** upload images into `images/gallery/`, then list them under `FEATURED` (home page,
  best 6–10) and `GALLERIES` (each category). Examples are in the file. Add `wide: true` to
  landscape (sideways) photos so they get a large spot on the home page and a full-width spot in
  mostly-landscape galleries.
- **Logo:** `images/logo.png` (full colour, used on light backgrounds) and `images/logo-light.png`
  (cream lettering, used on dark backgrounds such as the footer and the top of each page). The
  browser-tab icon is `images/favicon.png`. Replace these files (same names) to update the logo.
- **Page background:** the wedding photo behind every page is `images/wedding-bg.jpg`. To use a
  different photo, replace that file with another landscape photo of the same name (about 1600px wide).
- **Photo stream (top of the home page):** the photos that float up behind the headline after the
  intro come from `HERO_STREAM`. With one photo it repeats; add more paths, such as
  `"images/gallery/wedding-01.jpg",`, and they take turns.
- **Wedding packages:** add them to `WEDDING_PACKAGES`. They appear on the Galleries page and in
  the booking form.
- **Reviews:** add real client quotes to `TESTIMONIALS`.
- **Fiwi Place link:** put their website or Instagram in `fiwiPlaceUrl` if you'd like one.

### Client proofing galleries

1. Upload **watermarked, lower-resolution** proofs to a folder such as `images/proofs/school-name/`.
2. Choose an access code (for example `STJOHN2026`) and turn it into a SHA-256 code at
   https://emn178.github.io/online-tools/sha256.html (type the code in CAPITAL letters).
3. Add a gallery to `PROOFING_GALLERIES` with that `codeHash` and the list of photos and IMG numbers.
4. Remove the `Demo Gallery` (access code `DEMO`) when you're done testing.

> The access code keeps casual visitors out, but anything on a public website can be found by a
> determined person. Never upload full-resolution originals here. If you need real privacy, use a
> proofing service such as Pixieset or ShootProof and link to it.

## Putting it online (view it on your phone)

**GitHub Pages (free):**
1. On GitHub, open the repository → **Settings** → **Pages**.
2. Under *Build and deployment*, choose **Deploy from a branch**, pick the branch, folder `/ (root)`, and save.
3. After a minute the site is live at
   `https://<your-username>.github.io/<repo-name>/candid-expression/`.

For a cleaner address (or your own domain such as `candidexpressions.com`), move the contents of this
folder into a new repository of its own and enable Pages there.

## Saving it to your Desktop

On your computer, open the repository on GitHub → **Code** → **Download ZIP**, unzip it, and drag
the `candid-expression` folder onto your Desktop. Double-click `index.html` to open the site in your
browser.

## Notes

- The intro is an animated recreation of the effect in your reference video (photo full screen, name
  written vertically letter by letter, then the photo settles into an arch frame with floating
  photos). It plays in full once per visit, then shortens. It's skipped for visitors who turn off
  motion on their device.
- Your hero photo is 854×1280. For the sharpest look on big screens, replace `images/hero.jpg` with a
  larger version (2000px+ tall) of the same photo.
- Light/dark theme follows the visitor's phone setting. There's also a toggle in the footer.
