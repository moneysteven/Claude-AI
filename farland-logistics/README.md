# Farland Logistics website

One self-contained file, no build step. Open `index.html` or run `python3 -m http.server`.

- Edit the `FARLAND` block near the bottom of `index.html`: WhatsApp, email, phone, office, Miami address, rates, product photos, `formEndpoint`.
- `prealert.html` redirects to `index.html#prealert`. Links like `index.html?store=Amazon&tracking=XXXX` pre-fill the form.
- Set `formEndpoint` to a Formspree/Getform URL so pre-alerts arrive in your inbox. Without it, customers finish with a pre-filled WhatsApp message.
