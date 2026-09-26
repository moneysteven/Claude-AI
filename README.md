# Steven Scale Solutions — Online Store

A hardware store website: browse products, add to cart, check out, pay
online, and both you and the customer get an automatic receipt.

## What's included

- Product catalog with categories + search
- Shopping cart (persists in the browser between visits)
- Checkout that hands off to a payment provider
- Automatic PDF receipts, emailed to the customer **and** to you
  (`BUSINESS_RECEIPT_EMAIL`) the moment a payment is confirmed
- A simple admin area to see orders and manage products
- A **test mode** so you can try the entire flow today, before your real
  payment account is set up — no money moves, but every screen (cart,
  checkout, receipt, admin) works exactly as it will in production

## Payment provider: Fygaro

[Fygaro](https://fygaro.com) is a Jamaican payment platform that pays out to
local JMD/USD bank accounts, which is why it's wired in here as the default
"real" provider — most gateways used elsewhere (Stripe, Shopify Payments)
don't support Jamaican payout accounts.

To go live:

1. Open a Fygaro merchant account (you said your business is already
   registered, which is what they'll ask for).
2. From your Fygaro dashboard, get your API key/secret and webhook signing
   secret.
3. Open `lib/providers/fygaro.js` and confirm the exact API endpoint and
   field names against Fygaro's own developer docs (I've written it to the
   standard shape of a hosted-checkout gateway, but Fygaro's exact contract
   should be confirmed from their docs once you have account access — the
   file has clear comments marking exactly what to check).
4. Fill in the `FYGARO_*` values in your `.env`.
5. Set `PAYMENT_PROVIDER=fygaro` in `.env`.

Until then, leave `PAYMENT_PROVIDER=test` — the site works fully, just
without moving real money.

If you'd rather use **WiPay** or a bank's own merchant gateway instead, the
same pattern applies: add a new file in `lib/providers/` implementing
`createPaymentLink`, `verifyWebhook`, and `parseWebhookEvent`, then point
`PAYMENT_PROVIDER` at it. Nothing else in the app needs to change.

## Running it locally

```bash
npm install
cp .env.example .env
npm start
```

Visit `http://localhost:3000`. Admin area: `http://localhost:3000/admin`
(username/password from `.env`, defaults are `admin` / `change-me-now` —
change these before deploying).

## Sending receipt emails

Fill in `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` in `.env` with any email
account (a Gmail "app password" works well, or an email account from your
domain registrar/host). Until these are set, orders still work and receipts
are viewable/downloadable on the confirmation page — emails are just
skipped, so you can test everything else first.

## Deploying so `stevenscalesolutions.com` can point at it

This is a normal Node.js app, so it runs on any of these (all have free or
very cheap tiers):

- **Render** (render.com) — easiest: connect the GitHub repo, set the
  environment variables from `.env` in its dashboard, deploy.
- **Railway** (railway.app) — same idea, also very simple.
- **Fly.io / a VPS** — more control if you want it later.

Once deployed, point your domain's DNS (from wherever you registered
`stevenscalesolutions.com`) at the hosting provider following their
"custom domain" instructions, and set `SITE_URL` in your environment
variables to `https://stevenscalesolutions.com`.

**Important:** the payment webhook (`/webhooks/fygaro`) only works once the
site is live on the internet — Fygaro can't reach `localhost`. Test the full
real-payment flow only after deploying.

## Managing products

Log into `/admin`, go to "Manage Products" to add, edit, or remove hardware
items — no code changes needed for day-to-day catalog updates.

## Security notes

- Change `ADMIN_PASSWORD` and `SESSION_SECRET` in `.env` before going live.
- Never commit your real `.env` file (it's already git-ignored).
- Card data never touches this server — customers enter it on Fygaro's own
  secure payment page, which keeps you out of PCI-compliance scope.
