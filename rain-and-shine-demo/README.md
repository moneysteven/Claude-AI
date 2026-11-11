# Rain & Shine Detailing: demo site

A single-file, mobile-first demo website. Open `index.html` in a browser; there is no build step or backend.

Everything shown as `[Owner to fill in: …]` or `[Owner to attach: …]` is a placeholder. The "Highlight placeholders" toggle in the About section marks them all on the page.

To add real job photos, put an `<img loading="lazy" alt="…">` inside each `.shot-frame` in the gallery and delete its placeholder label. The before/after slider uses two canvases (`.ba-before`, `.ba-after`) that can be swapped for two `<img>` elements of the same panel.

The booking form validates in the browser and shows a confirmation, but does not send anything until it is connected to WhatsApp, email or a booking tool.
