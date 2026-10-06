# Farland Logistics website

Static site (no build step). Open `index.html`, or serve with `python3 -m http.server`.

- `index.html` – marketing home page, rate calculator, FAQ
- `prealert.html` – pre-alert form. Supports `?store=Amazon&tracking=XXXX` links.
- `js/config.js` – **edit first**: WhatsApp, email, phone, Miami address, rates, form endpoint

## Receiving pre-alerts
Set `formEndpoint` in `js/config.js` to a Formspree/Getform URL and every pre-alert lands in your inbox/dashboard.
With it blank, customers finish with a pre-filled WhatsApp/email message to your team.
