# Fiwi Place — Website Template

Static template for Fiwi Place Restaurant's events venue site (baby showers,
birthdays, wedding brunch, private dinners, and other events). Not live yet —
this is the working template.

## Structure

- `index.html` — all page content/sections
- `css/style.css` — styles (colors, fonts, layout)
- `js/main.js` — hero carousel, mobile nav, sticky header, Book Now modal

## Running locally

Just open `index.html` in a browser, or serve the folder:

```bash
cd fiwi-place
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Before going live

- [ ] Swap the placeholder color blocks (`.media-placeholder`) for real venue
      photography — search each `--<name>` variant in `css/style.css`.
- [ ] Replace the "Book Now" modal (in `index.html`, marked with a `TODO`
      comment, and in `js/main.js`) with the real booking embed link/iframe
      once it's ready — each button already carries a `data-book="<Event
      Type>"` attribute so you can route different event types to different
      booking pages if needed.
- [ ] Fill in real phone/email/address in the footer and modal (currently
      placeholders: `hello@fiwiplace.com`, `(876) 000-0000`).
- [ ] Update the "Upcoming Event" section with the next real scheduled event.
- [ ] Review nav links, section copy, and event list for accuracy.
