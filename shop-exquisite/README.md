# Shop Exquisite

A static, upscale clothing store: browse the collection with live in-stock / low-stock / sold-out labels, pick a size, add to bag, and place an order that is **emailed to the owner** for DHL island-wide delivery.

No server needed — open `index.html` or host the folder anywhere (Netlify, GitHub Pages, any web host).

## Setup (5 minutes)
1. Open `config.js` and set `ownerEmail` (where orders arrive), `whatsapp`, DHL fee and free-delivery threshold.
2. **Activate email delivery (one time):** host the site, place one test order, then click the confirmation link FormSubmit emails to the owner. After that every order arrives in the inbox (customer gets a copy too).
3. Edit `products.js` to manage products and stock. A size with `0` shows as sold out and can't be ordered; total 0 shows a "Sold Out" badge.
4. Add real photos: put files in `img/` and add `image: "img/name.jpg"` to a product (SVG placeholders are used otherwise).

## Notes
- Stock is updated by editing `products.js` (e.g. after each order). If you later want automatic stock deduction, payment, or an admin screen, that needs a backend.
- If email sending fails, the customer is offered a pre-filled WhatsApp message with their order.
- Orders are "request to buy": the owner confirms by email/phone and arranges payment before shipping.
