# HLS Dental & Medical — website

A single-file website for the Savanna-la-Mar office (Shop 17, Hendon Mall, Beckford Street, across from Manning's School).

```
hls-dental/
  index.html      ← the whole site (HTML, CSS and JS inline)
  photos/         ← keep this folder beside index.html
```

The only external files are Google Fonts (Fraunces and Outfit) and three.js r128 from cdnjs. If three.js can't load, the hero falls back to an SVG tooth with a circular service ring, and the rest of the page works as normal.

Host the folder on any static host (Netlify, GitHub Pages, cPanel and so on). Opening `index.html` straight from disk also works. In that case the browser blocks reading photo pixels, so the gallery uses the stored fallback palettes and a simpler hover instead of the WebGL ripple.

## Before going live

Every unknown on the page is marked `[Owner to …]` with a dashed gold outline:

- **Fees:** one per service card. The service list itself also needs confirming.
- **Dentist:** name, title and a short introduction.
- **WhatsApp:** confirm (876) 788-3648 is on WhatsApp. If not, change `SITE.whatsapp` in the script.
- **Instagram / Facebook:** fill in `SITE.instagram` and `SITE.facebook`. The icons appear only once real values are set.
- **Photos:** exterior of Shop 17, reception and treatment room.
- **Consent:** confirm patient consent is on file for every published clinical photo. The outreach photo shows students in school uniform, so check consent for minors too.

## Settings (top of the `<script>` in index.html)

| Setting | What it does |
| --- | --- |
| `SITE` | Phone, WhatsApp number, email, socials, booking message |
| `OWNER_PASSCODE` | Passcode for the `#owner` dashboard. Currently the demo code `hls-demo-2026`: **change it before real use** |
| `GALLERY_IMAGES` | Gallery photos and captions. Put a JPEG in `photos/` and set its `src`; an empty `src` shows a placeholder frame |
| `MONTAGE` | The four plates in the intro |
| `THREE_URL` | three.js build (cdnjs r128) |

## Smile Recall (patient recall demo)

- Patients join from the public form. Nothing is saved unless the consent box is ticked.
- Open `index.html#owner` and enter the passcode to see the recall list, the rules (6-month recall, follow-up 10 days after treatment, 12-month win-back, birthdays), one-tap WhatsApp messages, the send log, counters, and JSON export/import.
- It ships with eight **SAMPLE DATA** patients on fake 876-555-01xx numbers. Use "Remove all sample data" when you start for real.

Honest limits:
- Records live in `localStorage` in the browser where they were entered. A sign-up made on a patient's own phone stays on that phone. Use the front-desk device, or add a small backend to collect sign-ups centrally.
- One-tap WhatsApp opens a ready-written message, and a person still presses Send. Fully automatic reminders need the WhatsApp Business API and a server.
- The passcode is a lock inside the browser, not real security. Real patient data needs a proper login on a server.
