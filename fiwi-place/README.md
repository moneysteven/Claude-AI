# Fiwi Place — Website Template

Static template for Fiwi Place Restaurant's events venue site (baby showers,
birthdays, wedding brunch, private dinners, and other events). Not live yet —
this is the working template.

## Structure

- `index.html` — all page content/sections
- `css/style.css` — styles (colors, fonts, layout, background effects)
- `js/main.js` — hero carousel (with swipe), mobile menu, sticky header, Book Now modal

## Logo

The FiWi Place logo is an inline SVG (in the header and footer of
`index.html`). "FiWi" and "Place" are both set in the Allura script font; the
last letter of "FiWi" is a dotless "ı", and the flame sits above it as its
dot. "RESTAURANT" uses Josefin Sans. The logo takes its color from CSS
`color`, so it can be switched to a dark version for light backgrounds. The
flame's gradient is defined once near the top of `<body>` (`#fp-flame`).

## Backgrounds

- Hero: animated aurora glows (`.blob`, colors per slide in `.theme-*`),
  venue arches (`.arch`), and a film-grain overlay.
- Page background photo: `assets/garden-cottage.jpg` (tropical garden cottage
  with coconut palm), shown by the fixed `.scenery` layer behind the
  see-through light sections. Replace that file with another photo (ideally
  2000px wide or larger) to change the background without touching code.
- Headings and text over the scenery sit on frosted panels (`.section-head`,
  `.about-copy`); dark bands are `.section-dark` in `css/style.css`.
- All motion is switched off for visitors who set "reduce motion" on their
  device.

## Running locally

Just open `index.html` in a browser, or serve the folder:

```bash
cd fiwi-place
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Before going live

- [ ] Swap the gradient photo placeholders (`.ph` blocks) for real venue
      photography; each has a label saying which photo goes there.
- [ ] Replace the "Book Now" modal (in `index.html`, marked with a `TODO`
      comment, and in `js/main.js`) with the real booking embed link/iframe
      once it's ready — each button already carries a `data-book="<Event
      Type>"` attribute so you can route different event types to different
      booking pages if needed.
- [ ] Fill in real phone/email/address in the footer and modal (currently
      placeholders: `hello@fiwiplace.com`, `(876) 000-0000`).
- [ ] Update the "Upcoming Event" section with the next real scheduled event.
- [ ] Review nav links, section copy, and event list for accuracy.
