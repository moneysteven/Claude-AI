# Selfie TV Boss Entertainment — Website + Automated Call System

One Node.js app that runs **both** parts of the project:

1. **The website**: modern, dark "live TV" style, built phone-first.
   Services (Project Managing, Hosting, DJ, Entertainer, Movie Actor,
   Promotions), **Upcoming Events**, About, a photo/video gallery, a section aimed at promoters,
   a booking form, tap-to-call / WhatsApp buttons, and a sticky
   "Call / Book Now" bar on phones. It can be added to a phone's home screen
   like an app.
2. **The automated phone-call system** (behind the scenes, never shown on
   the website): calls people who are promoting a party or event, or who
   posted on an online platform looking for someone to host their event.
   Each call opens with a short, professional thank-you from Selfie TV Boss
   Entertainment and goes straight into the options. It plays your recorded voice (or a
   computer voice until you've recorded), and lets them press a key:

   | Key | What happens |
   |---|---|
   | 1–6 | Project Managing · Hosting · DJ · Entertainer · Movie Actor · Promotions → plays a short pitch, **texts them a booking link** that opens the website's booking form with that service already ticked, then asks **your questions** one by one and records each answer |
   | 7 | **Texts them a link to your website** so they can see everything and book online, then ends the call |
   | 0 | Forwards the call straight to your phone |
   | * | Repeats the menu |

   Each answer is saved as audio **and typed out as text** in your
   dashboard. Answering machines get a short voicemail instead. People who
   call your Twilio number back hear the same menu.

3. **Your dashboard** at `/admin` (works on your phone): every interested
   caller with their answers (play the audio or read the text), every website booking, the call history,
   the do-not-call list, an **events manager**, a box to paste contacts and start a calling
   campaign, and a **"Call my phone to test"** button. You also get a text
   message for every new lead or booking.

```
selfie-tv-boss/
├── call-script.json      ← the words the phone system says (edit freely)
├── VOICE-SCRIPT.md       ← every line to record, with file names
├── public/
│   ├── index.html        ← the website
│   ├── js/site-config.js ← YOUR phone, WhatsApp, email, socials
│   ├── media/            ← drop photos & videos here (see media/README.md)
│   └── audio/            ← drop your voice recordings here (MP3)
├── src/                  ← the call system, bookings and dashboard code
└── server.js
```

---

## 1. Tools to install

On your computer (Windows or Mac):

| Tool | What it's for | Get it |
|---|---|---|
| **Node.js 20 or newer (LTS)** | Runs the app | https://nodejs.org (choose "LTS") |
| **Git** | Saves & uploads your code | https://git-scm.com |
| **VS Code** | Editing text, contact details, call script | https://code.visualstudio.com |
| **ngrok** | Lets Twilio reach the app on your computer while testing | https://ngrok.com/download (free account) |
| **Audacity** | Recording & cleaning up your voice lines | https://www.audacityteam.org |

Accounts to open:

| Account | What it's for | Cost (approx.) |
|---|---|---|
| **Twilio** — https://www.twilio.com/try-twilio | Places the calls, phone number, keypad menu, voicemail detection, SMS alerts | Free trial credit; then roughly US$1–2/month per number + a few cents per call minute (calls to Jamaican mobiles cost more than US numbers; check *Twilio → Voice pricing → Jamaica*) |
| **Render** — https://render.com | Hosting the website + call system 24/7 | Free tier to try; ~US$7/month for an always-on server (recommended so calls never hit a sleeping server) |
| **A domain** e.g. `selfietvboss.com` | Your web address | ~US$12/year (Namecheap, GoDaddy, Cloudflare) |

> **Twilio trial note:** on a free trial, Twilio can only call numbers you've
> verified in the console, and plays a short "trial account" message first.
> Upgrade (add a payment card) before calling real promoters.

## 2. Run it on your computer

```bash
cd selfie-tv-boss
npm install
cp .env.example .env        # Windows: copy .env.example .env
npm start
```

- Website: http://localhost:3000
- Dashboard: http://localhost:3000/admin (user `boss` / password from `.env`)

The website and dashboard work right away. Calls need the next step.

## 3. Hook up Twilio (the phone calls)

1. In the Twilio console, **buy a phone number** with *Voice* (and *SMS* if
   you want text alerts). A US number is cheapest; a Jamaican (876) number
   may be available and looks more local to promoters. Check what's offered.
2. Copy your **Account SID** and **Auth Token** from the console home page
   into `.env` (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`), plus the number
   you bought (`TWILIO_PHONE_NUMBER`, like `+18765551234`).
3. Put your own cell number in `OWNER_PHONE`.
4. Give Twilio a public address for your app. While testing:
   ```bash
   ngrok http 3000
   ```
   Copy the `https://….ngrok-free.app` address into `PUBLIC_URL` in `.env`
   and restart (`npm start`).
5. In Twilio → *Phone Numbers → your number → Voice configuration*, set
   **"A call comes in"** to *Webhook*, `https://YOUR-PUBLIC-URL/voice/answer`,
   method **POST**. (This makes people who call you back hear the menu.)
6. Open `/admin` and press **"Call my phone to test"**. Your phone rings
   and you go through the whole menu yourself.

## 4. Run a calling campaign

1. In `/admin`, paste your contacts, one per line:
   ```
   name,phone,company,notes
   Jane Brown,876-555-0101,Vibez Promotions,Summer fest
   8765550102
   ```
   (You can paste straight from a spreadsheet saved as CSV.)
2. Leave **"Test run only"** ticked first: it checks every number and shows
   who would be called, without dialing.
3. Untick it and press **Start**. Calls go out one at a time (every 20s by
   default), only during calling hours (Mon–Sat 9am–7pm Jamaica time by
   default; change in `.env`). Numbers on your do-not-call list, and anyone
   already called in the last 30 days, are skipped automatically.
4. Leads appear under **Interested callers** with their answers and whether
   the website link was texted, and you get a text for each one.

Good places to find numbers: promoters' flyers and posts on Instagram,
Facebook and event sites, and posts from people looking for a host or DJ.
Use the `notes` column to remember where you found each one.

**The website link** that gets texted is `WEBSITE_URL` in `.env` (set it to
your domain once you have one). The text messages themselves are under
`sms` in `call-script.json`. Texts only reach mobile numbers; if one fails
(for example a landline), the dashboard shows why.

## 5. Your questions and voice recordings

**Questions:** open `call-script.json` and edit the `questions` list. Each
one has the words the caller hears (`text`), a short `label` for your
dashboard, and `maxSeconds` (how long they get to answer). Add, remove or
reorder them freely; the call asks them in order. Change any other line the
same way under `lines` and `options`.

**Recordings:** see **[VOICE-SCRIPT.md](VOICE-SCRIPT.md)**: it lists every
line, the exact file name to save it as, which ones are already recorded,
and recording tips. Drop the MP3s in `public/audio/`. Each one is picked up
automatically on the next call; no restart needed. After changing
`call-script.json`, run `npm run voice-script` to refresh that list.

Answers are typed out by Twilio (about US$0.05 per minute of answers). Set
`TRANSCRIBE_ANSWERS=false` in `.env` to switch that off; you still get the
audio.

## 6. Upcoming events

In `/admin`, scroll to **Upcoming events** and fill in the name, date, and
(optionally) time, venue, your role (Hosting, DJ…), a tickets link, a short
description and a flyer photo straight from your phone's camera roll. It
shows on the website immediately, with a date badge, a "THIS WEEK" /
"TOMORROW" / "TONIGHT" tag when it's close, and buttons for fans to buy
tickets, save it to their phone calendar, or share it on WhatsApp.

Use **Edit** / **Delete** to change one. Past events disappear from the
website on their own the day after (they stay listed under "Past events" in
the dashboard). Flyers are saved in `DATA_DIR/flyers`, so on Render they
need the persistent disk from step 8 too.

## 7. Photos & videos

When you have them, put them in `public/media/` and follow
`public/media/README.md`:

- `hero.mp4`: background video at the top of the site
- `boss.jpg`: the main portrait
- gallery photos/videos/YouTube links → listed in `media/gallery.json`

Until then the site shows clean "Coming Soon" placeholders.

Also update **`public/js/site-config.js`** with your real phone, WhatsApp,
email and social links, and the bio + stats in `public/index.html` (marked
`EDIT:`).

## 8. Put it online (so it works from your phone, anywhere)

1. Push this repo to GitHub (already done if you're reading this there).
2. On **Render**: *New → Web Service* → connect the repo.
   - Root directory: `selfie-tv-boss`
   - Build command: `npm install`
   - Start command: `npm start`
   - Add every value from your `.env` under *Environment*. Set `PUBLIC_URL`
     to your Render address (later, your domain).
   - Add a **Disk** (e.g. mount path `/var/data`, 1 GB) and set
     `DATA_DIR=/var/data`. Without it, leads and bookings are wiped every
     time the app redeploys.
3. Update the Twilio number's webhook (step 3, item 5) to the new address.
4. Point your domain at Render (*Settings → Custom Domains*), then update
   `PUBLIC_URL` and the Twilio webhook once more.

Open the site on your phone and use *Share → Add to Home Screen* for an
app-style icon. Bookmark `/admin` too.

## 9. Calling rules: please read

Automated sales calls are regulated. Before you start:

- **Only call people you have a business reason to call**: promoters who
  publicly advertise an event with a contact number for bookings, or people
  who've given you their number. Don't buy random number lists.
- **Calling the US or Canada?** US law (the TCPA) requires *prior written
  consent* for pre-recorded marketing calls to cell phones, with fines per
  call. Get consent first, or call US numbers personally instead.
- **Jamaica:** follow the Data Protection Act 2020: identify yourself (the
  greeting does), stop calling anyone who asks you to, and keep the contact
  list secure.
- **Opting out:** the menu no longer has a "press 9 to stop calls" key, so
  when someone tells you (on a call back, by text or in person) they don't
  want calls, add their number under **Do-not-call list** in `/admin` and
  they're never called again. US rules require an automatic opt-out key on
  pre-recorded sales calls, so don't call US numbers with this setup.
- Keep the calling-hours limits on.
- Twilio's own rules also forbid unsolicited robocalls. Accounts that get
  many complaints are suspended.

This isn't legal advice. If you plan large campaigns, a quick check with a
lawyer is worth it.

## Security checklist

- Change `ADMIN_PASSWORD` before going live (the dashboard warns you).
- Never share or upload `.env` (it's git-ignored).
- Keep `TWILIO_VALIDATE_REQUESTS=true` so only Twilio can drive the phone menu.
