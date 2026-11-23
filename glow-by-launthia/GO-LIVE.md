# Glow by Launthia – going live

Everything in the website and dashboard is built and tested. What is left is connecting it to her own accounts.
Nothing here goes live until the website is uploaded to Hostinger, and that only happens when you say so.

Her email for everything: **Launthiawatson@yahoo.com**

## Already done (no action needed)

- The database setup files (`supabase/setup.sql`, `supabase/platform.sql`) and her private payment file (kept
  outside this repository) were rehearsed on a brand-new, empty database. They run cleanly, can be run again
  safely, and give exactly this:
  - Open Monday to Saturday, 9am to 5pm. Online booking on, up to 90 days ahead.
  - Clients pay a **JMD 3,000 deposit** online to book; the balance is paid in person at the appointment. Optional
    **professional photos** add JMD 3,000 to the total (paid with the balance).
  - Ways to pay the deposit: **Bank transfer** (NCB and Scotiabank, shown only to a client who is paying) and
    **PayPal** (her PayPal, at **1 US dollar = 154 JMD**, so the deposit is USD 19.49). Booking with "pay in person"
    is switched off. No card payments: there is no merchant account yet.
  - Soft Glam J$9,500, Natural Full Glam J$10,500 and Statement Full Glam J$12,000 can be booked online. Full Glam
    (the range) and Bridal are booked by message.
  - Launthiawatson@yahoo.com is the only admin; booking alerts go to that address.
  - The public cannot read her bank details.
- The practice copy uses the same rate (154).

## 1. Supabase (the database) – about 10 minutes, needs her Yahoo inbox

This has to be done by someone who can open her Yahoo email, because Supabase sends a confirmation email there.

1. Go to **supabase.com** and tap **Start your project**. Sign up with **Launthiawatson@yahoo.com** and a strong
   password. Open the confirmation email in her Yahoo and confirm.
2. Tap **New project**. Name: `glow-by-launthia`. Database password: make a strong one and **write it down
   somewhere safe – do not send it to anyone**. Region: **East US (North Virginia)** (closest to Jamaica).
   Tap **Create new project** and wait about 2 minutes.
3. Send these two in the chat (they are public by design; they go inside the website):
   - **Project URL** (Project Settings → API), looks like `https://abcdefgh.supabase.co`
   - **anon public** key (same page)
4. Make an **access token** so the setup can be done from here: supabase.com/dashboard/account/tokens →
   **Generate new token** → name it `Glow setup`. **Do not paste it in the chat.** When you're ready, a secure form
   will pop up for it.

## 2. The server code – done from here once step 1 is finished

"Server code" means four small programs that run on her Supabase account, not on the website:

| Program | What it does |
| --- | --- |
| `checkout` | Holds a client's time, shows the payment details to a client who is paying, takes "I've made my payment" with the receipt. (Pay in person is switched off, and this program refuses it.) The website talks only to this. |
| `booking-emails` | Sends the emails: the client's confirmation and receipt, and Launthia's "new booking" / "check your bank" alerts. |
| `notify-owner` | Sends Launthia's test alert from the dashboard. |
| `send-confirmation` | Re-sends a client's confirmation from the dashboard. |

(`paypal-webhook` is only for PayPal's paid business checkout, which needs a merchant account, so it is not used
now.)

With the access token, these get done from here:

- Run the database files and her private payment file.
- Put the four programs online.
- Give them their settings.
- Switch on the email trigger.
- Connect the website to her project.

You can delete the token afterwards.

## 3. Email – needs a web address of her own for client emails

**Important:** no website service is allowed to send email *from* a @yahoo.com address. Yahoo blocks it, to stop
fake emails. So:

- **Her own alerts** ("new booking – deposit paid", "check your bank for the J$3,000 deposit") are sent **to** Launthiawatson@yahoo.com.
- **Client emails** (confirmation, receipt, cancellation) are sent **from** an address on her own web address, for
  example `bookings@glowbylaunthia.com`. When a client presses Reply, it goes to **Launthiawatson@yahoo.com**. That
  is already built in.
- Hostinger plans include a web address. Once she has one, it is verified once by adding 3 lines in Hostinger's DNS
  settings (step-by-step given at the time).

Steps:

1. Go to **resend.com**, sign up with **Launthiawatson@yahoo.com**, and confirm the email in her Yahoo.
2. API Keys → **Create API key** → name `Glow`, permission **Sending access**. **Do not paste it in the chat**; a
   secure form will pop up for it.
3. When her web address exists: Domains → **Add domain** → enter it, then add the 3 records it shows in Hostinger's
   DNS. Until then, her alerts can still reach her Yahoo, but **clients won't get emails**. The website still tells
   clients on screen that they're booked.

## 4. Her dashboard login – 1 minute

In Supabase: **Authentication → Users → Invite user** → `Launthiawatson@yahoo.com`. She opens the invite in her
Yahoo and chooses her own password. Nobody else ever sees it. Her dashboard is the website address with `/owner`
at the end. On her phone she can add it to her Home Screen (the dashboard shows her how, once); new bookings then
appear in it by themselves with a soft chime.

## 5. Final check before upload

After steps 1–4:

1. The same automatic checks run against her real project, which tell us everything is connected.
2. Then one real test from start to finish on her phone, on the connected practice site:
   - book Soft Glam, pay the JMD 3,000 deposit by bank transfer, and confirm it in the dashboard;
   - check both emails arrive (hers, and the client's once the web address is verified);
   - see it appear in the dashboard by itself (with the chime and the red number on Bookings);
   - try Move and Cancel.
3. Optional: a real bank transfer of the deposit, confirmed with "Confirm booking".

## 6. Upload to Hostinger – only when you say

Upload the contents of `glow-by-launthia-hostinger.zip` to `public_html`. Then the site is live.

## Still to confirm

- The legal pages say "[Owner to confirm: sole trader / registered business name]" in 5 places. A lawyer should
  read the legal pages before launch.
- Optional: a Formspree form for a second copy of her booking alerts.
