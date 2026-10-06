# Eclipse Enterprise Limited — Website

Static storefront (no build step). Open `index.html`, or run `python3 -m http.server` in this folder.

- `js/products.js` — the catalog (placeholder prices/specs; edit to match real inventory)
- Cart persists in the browser; checkout currently saves an *order request* locally.
  To take real payments, connect a payment provider and a backend/email for order intake.
