# Steven Scale Solutions — Website

The marketing site for Steven Scale Solutions: the Hidden Psychology book
series, business services (websites, social media, sales training),
personal development coaching, and a way for content creators to monetize.

This is a straight migration off Hostinger — the page in `public/index.html`
is the real, live homepage (same copy, same images/video, same branding),
now served from a plain Node.js app instead of Hostinger's hosting, so the
domain can be pointed anywhere.

## What's included

- The full single-page site: hero, the 3-book offer, the three service
  tracks (business / personal development / content creators), how it
  works, FAQ, and the lead-capture form
- All real images, poster frames, and the three background/scroll videos,
  pulled directly from the live site
- The lead form still posts straight to the same Formspree inbox
  (`https://formspree.io/f/mbglddey`) the business already uses — nothing
  to reconfigure
- The two live Whop checkouts are unchanged:
  - **"Get the 3 books"** links out to the book bundle's Whop checkout
  - **"Money machine" (the side hustle)** checks out inline on the page via
    Whop Elements

## Running it locally

```bash
npm install
cp .env.example .env
npm start
```

Visit `http://localhost:3000`.

## Deploying so `stevenscalesolutions.com` can point here

This is a normal Node.js app (just `express.static` serving `public/`), so
it runs on any of these (all have free or very cheap tiers):

- **Render** (render.com) — connect the GitHub repo, deploy.
- **Railway** (railway.app) — same idea, also very simple.
- **Fly.io / a VPS** — more control if you want it later.

Once deployed, point your domain's DNS (wherever `stevenscalesolutions.com`
is registered) at the new host following its "custom domain" instructions,
then you can cancel the Hostinger hosting plan — the site itself lives
entirely in this repo now.

## Making changes

Because the whole page is one self-contained `public/index.html` (styles
and script inline, same as the original build), editing copy, colors, or
layout means editing that file directly — there's no separate template or
build step. Images/video live in `public/assets/`.

## Notes

- No secrets or payment credentials live in this app — card entry happens
  entirely on Whop's own checkout pages, and the lead form goes straight to
  Formspree client-side. There is nothing sensitive to configure in `.env`.
- The previous commit in this repo's history built out a hardware-store
  demo (cart/checkout/receipts) — that was for a different, unrelated
  business and has been removed in favor of this real migration.
