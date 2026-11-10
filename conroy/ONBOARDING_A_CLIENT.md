# Onboarding a client (step by step for Steven)

How to take a new business from "yes" to a live AI receptionist. Budget about 30 minutes with the owner for the form, then 1–3 days for the phone number and WhatsApp approval.

Related guides: [SETUP_PROVIDERS.md](SETUP_PROVIDERS.md) (Retell, Telnyx/Twilio, Meta/360dialog, Google/Cal.com, Fygaro/WiPay accounts), [DEPLOY_HOSTINGER.md](DEPLOY_HOSTINGER.md) (the server), [COST_TRACKING.md](COST_TRACKING.md) (what each client costs you).

---

## 1. Before the meeting: what to collect

Send the owner this list a few days ahead. The onboarding wizard has the same 10 steps, so the meeting goes quickly if they come prepared.

**1. Business**
- [ ] Business name exactly as customers say it (the assistant greets callers with it)
- [ ] Type of business (salon, barber, auto shop, restaurant, clinic, gym, boutique, tour operator, guesthouse, other)
- [ ] Street address, area/town and parish
- [ ] Directions and landmarks in plain words ("opposite the Texaco, upstairs above the pharmacy, parking at the back")
- [ ] Business email and website address (if any)
- [ ] Website platform: WordPress, Hostinger Website Builder, Wix, Squarespace, Shopify, plain HTML, Facebook/Instagram only, none

**2. Contacts & owner**
- [ ] Owner's name and the email they'll sign in with
- [ ] Owner's WhatsApp number (gets every call summary and alert; required)
- [ ] The number customers already call (usually a Digicel or Flow mobile)
- [ ] The business WhatsApp number customers message
- [ ] The live-transfer number: who should a caller be put through to when they ask for a person?
- [ ] Do they want to **keep their existing Digicel/Flow number** and forward calls to Conroy? (Almost always yes.)

**3. Hours & holidays**
- [ ] Opening and closing time for each day, including half days (e.g. Saturday 8–2) and lunch breaks
- [ ] Which public holidays they stay **open** (default: closed on all ten)
- [ ] Any dates already known to be closed or short (Christmas Eve, Old Year's Day, staff training)

**4. Staff**
- [ ] Everyone who takes appointments: name, role, and which days they work
- [ ] If nobody is booked by name (e.g. one mechanic bay), leave staff empty: Conroy books "the business", one appointment at a time

**5. Services & prices**
- [ ] Every service, how long it takes, and the price in **J$** (e.g. 4,500)
- [ ] Which ones are "from" prices (e.g. "box braids from J$15,000")
- [ ] Which need a deposit, and how much
- [ ] Who does each service
- [ ] Never guess a price. If the owner isn't sure, leave it blank: Conroy will say "price on consultation".

**6. FAQs & policies**
- [ ] The 5–10 questions they get every day, **answered in the owner's own words** (parking, walk-ins, children, what to bring, payment methods)
- [ ] Cancellation, lateness and deposit policies

**7. Assistant**
- [ ] Assistant name (default "Conroy"; some owners pick their own)
- [ ] Tone: friendly Jamaican English, or light Patois in greetings and sign-offs only
- [ ] Anything the assistant must know or must never promise ("we don't do colour on Saturdays")

**8. Payment links**
- [ ] Their Fygaro payment link(s) and/or WiPay "pay me" link(s), for deposits, full payment or invoices
- [ ] Fygaro links can pre-fill the amount and reference (`?amount={amount}&client_reference={reference}`), per Fygaro's help pages
- [ ] WiPay "to_me" links: pre-filling isn't documented, so use the plain link; Conroy's WhatsApp message carries the amount and reference

**9. Calendar & plan**
- [ ] Calendar: Conroy's built-in calendar (simplest), Google Calendar (owner's Gmail address), or Cal.com (API key and event type ID)
- [ ] Plan: Lite, Starter or Growth (see `/admin/plans` for current prices)

**10. Review**
- [ ] Decide whether to go live straight away or create the business in "onboarding" status first

---

## 2. During the meeting: the wizard

1. Sign in and open **`/admin` → "+ Onboard a business"**.
2. Work through the 10 steps. Your answers are saved in this browser as you go, so a dropped connection doesn't lose anything (they're not saved on the server until you press Create).

Tips per step:

| Step | Tip |
|---|---|
| 1. Business | Pick the type first, then press **"Use typical hours & services for a …"** to pre-fill hours and service names. Prices stay blank on purpose. |
| 2. Contacts & owner | Any phone format works (876-555-1234, (876) 555 1234, 5551234). The owner's WhatsApp is required. Leave "Conroy's 876 number" blank if you haven't bought it yet. |
| 3. Hours & holidays | "Copy Monday to Tuesday–Friday" saves time. Tick only the holidays they stay **open**. |
| 4. Staff | Untick days off. Staff hours follow the business hours on the days they work. |
| 5. Services & prices | Type prices as numbers (4500 or 4,500). Tick "from" for starting prices. "Done by" left empty means anyone can do it. |
| 6. FAQs & policies | "Add common questions for this type of business" adds the usual questions; fill in each answer with the owner or remove it. |
| 7. Assistant | Read the "Callers will hear" preview out loud to the owner. The AI and recording notice is always included, even with a custom greeting. |
| 8. Payment links | Optional now; you can add them later in the business's Settings → Payment links. Links must start with https://. |
| 9. Calendar & plan | For Google, the owner shares their calendar later (section 3.6). |
| 10. Review & create | See below. |

On **Review & create**:

- **"Go live now"**: ticked = status **Active** (reminders and payment follow-ups start). Unticked = status **Onboarding**: the widget and assistant work for your testing, but no reminders go out and the business doesn't count as live in your totals. Use Onboarding when the number or WhatsApp isn't ready yet.
- **"Create the Retell voice agent now"**: leave it ticked. If `RETELL_API_KEY` isn't set on the server it is skipped with a clear message, and you can create it later from the business page.
- Press **Create business**. If anything is wrong, a red box lists every problem; press **Fix** to jump to the field.

---

## 3. Right after: the launch screen and setup

The launch screen appears once. Work down it before closing the tab.

### 3.1 Owner login (shown once)
- Copy the **temporary password** (looks like `Conroy-7K4P-Q9MZ`) and send it to the owner **by WhatsApp**, with the sign-in address (`https://YOUR-APP-DOMAIN/login`) and their email.
- It works once. At first sign-in they must choose their own password.
- Lost it? The owner can't reset their own password without email. You can: open the business dashboard (business page → **Open dashboard** → **Team** → **Reset password**). If email (SMTP) is set up on the server, they can also use "Forgot your password?".

### 3.2 Website widget
Copy the snippet from the launch screen:

```html
<script src="https://YOUR-APP-DOMAIN/widget.js" data-business="their-slug" defer></script>
```

| Platform | Where to paste it |
|---|---|
| WordPress | Install the free **WPCode** (or "Insert Headers and Footers") plugin → Code Snippets → Header & Footer → **Footer** box → Save |
| Hostinger Website Builder | Settings → Integrations → custom code (footer), or an **Embed code** element on every page → Publish |
| Wix | Settings → Custom code → Add custom code → "Body – end", all pages |
| Squarespace | Settings → Advanced → Code injection → Footer |
| Shopify | Online Store → Themes → Edit code → `theme.liquid`, just before `</body>` |
| Plain HTML | Just before `</body>` on every page |

If you limit the widget to their site (business Settings → "Websites allowed to use the widget"), add their exact domain first, e.g. `https://www.theirsalon.com`. Also link their footer to the privacy notice on the launch screen (`/p/their-slug/privacy`), or to their own notice made from `legal/PRIVACY_NOTICE_TEMPLATE.md`.

### 3.3 The 876 number
1. Buy a Jamaican +1 876 number. **Telnyx is recommended**: they sell Jamaican local numbers (about US$34.65/month on their Jamaica page) but need a signed Letter of Intent and a full address before inbound calls work. Twilio's own pricing page says it currently has no voice-enabled Jamaican numbers; check the Twilio console before relying on it. Setup steps: [SETUP_PROVIDERS.md](SETUP_PROVIDERS.md).
2. On the business page (`/admin` → the business): if the agent isn't there yet, press **"Create voice agent"**, then type the number and press **"Connect number from SIP trunk"**.
3. Call the number to check (section 4).

### 3.4 Call forwarding (keeping their Digicel/Flow number)
On the **owner's business phone**, dial each code and press call. The launch screen shows these filled in with Conroy's real number (`1876XXXXXXX` below means the number without "+").

| What it does | Dial |
|---|---|
| Forward when you don't answer | `**61*1876XXXXXXX#` |
| Forward when you don't answer, after about 20 seconds | `**61*1876XXXXXXX**20#` |
| Forward when the line is busy | `**67*1876XXXXXXX#` |
| Forward ALL calls (after hours, shop closed) | `**21*1876XXXXXXX#` |
| Stop forwarding unanswered calls | `##61#` |
| Stop forwarding busy calls | `##67#` |
| Stop forwarding all calls | `##21#` |
| Cancel every kind of forwarding | `##002#` |
| Check unanswered-call forwarding | `*#61#` |

Recommended: unanswered + busy forwarding during opening hours, and "all calls" when the shop is closed. These are standard GSM codes; confirm with Digicel/Flow and ask how forwarded calls are charged on the owner's plan. Flow landlines use Flow's own forwarding service.

### 3.5 WhatsApp
**Meta WhatsApp Cloud API (default)**
1. Register the business's WhatsApp number under your Meta app (see [SETUP_PROVIDERS.md](SETUP_PROVIDERS.md)). A number can't be on the WhatsApp phone app and the Cloud API at the same time unless Meta's coexistence option is available for it.
2. Make sure the 7 message templates are approved (names and wording are in `src/lib/whatsapp/templates.ts` and SETUP_PROVIDERS.md).
3. On the business page → **WhatsApp**: Provider "Meta WhatsApp Cloud API", paste the **Phone number ID**, **Save WhatsApp**.
4. Press **"Send test template to the owner"**. The owner's phone should receive a "Test message" alert.

**360dialog (alternative)**
1. On the business page: Provider "360dialog", paste the phone number ID and the channel's **360dialog API key**, **Save WhatsApp**.
2. Press **"Register webhook with 360dialog"** (needs an https `APP_URL` and `DIALOG360_WEBHOOK_TOKEN` on the server). If the channel's API key is ever regenerated, 360dialog drops the webhook: press the button again.
3. Press **"Send test template to the owner"**.

### 3.6 Calendar
- **Built-in**: nothing to do.
- **Google Calendar**: the owner opens Google Calendar → Settings → their calendar → "Share with specific people" → adds the service-account email shown on the business page (`GOOGLE_SERVICE_ACCOUNT_EMAIL`) with **"Make changes to events"**. Then press **"Test calendar"** on the business page. Per-staff calendars go in each staff member's "Calendar ID" (business Settings → Staff).
- **Cal.com**: enter the API key and event type ID on the business page → **Save calendar** → **Test calendar**.

---

## 4. Test script before go-live

Do every line yourself. Tick it off on the business page's "Internal notes" if you like.

**Phone**
- [ ] Call the 876 number. Greeting names the business, says it's an AI assistant and that the call may be recorded.
- [ ] Ask in Patois: "Wah gwaan, unnu open today?" and "How much fi a [service]?" Answers match the hours and price list.
- [ ] Book an appointment for tomorrow. You hear a booking reference; a WhatsApp confirmation arrives on your phone.
- [ ] Call again from the same phone: move the booking to another day, then cancel it.
- [ ] Ask "Mi waan talk to a real person". The call transfers to the live-transfer number. Let it ring out: the assistant takes a message instead.
- [ ] Call outside opening hours (or with "all calls" forwarding on). The assistant still answers; the call shows as **after hours** in Calls.
- [ ] Within a few minutes of each call, the owner's WhatsApp gets the **call summary** with a link to the transcript.

**WhatsApp**
- [ ] Message the business number: "how much fi a [service]?" First reply includes the AI notice and privacy link.
- [ ] Book through WhatsApp.
- [ ] Send **STOP**: you get an unsubscribe confirmation. Send **START**: you're subscribed again.
- [ ] Send "talk to a person": the bot goes quiet and the owner gets a staff alert.

**Website**
- [ ] On their **real website** (not just the demo page), open the widget, ask a question, then book on the **Book** tab. A WhatsApp confirmation arrives.

**Dashboard**
- [ ] The test bookings are in **Bookings**, the calls (with transcripts) in **Calls**, the chats in **Inbox**, any messages taken in **Leads**.
- [ ] Clean up: cancel test bookings and mark test leads "Lost".

Then set the status to **Active** on the business page (if you created it in Onboarding).

---

## 5. Training the owner and staff (15 minutes)

- **Inbox**: when a customer asks for a person, the chat shows **"Needs a person"** and the assistant pauses. Staff reply right there. When finished, press **"Resume assistant"**, or the bot stays quiet for that customer. More than 24 hours after the customer's last message, WhatsApp only allows templates, so the reply box is locked until the customer writes again.
- **Bookings**: create, move, cancel, mark Done / No-show. Customers get WhatsApp updates automatically.
- **Calls**: every call with summary, transcript and recording, deleted automatically after the retention period (90 days by default).
- **Customer details** are removed automatically after a set time without any contact from that person (24 months by default; Settings → Business & assistant). Past bookings and payments stay, marked "Past customer", so their records still add up.
- **Leads**: messages the assistant took. Update the status as they follow up.
- **Payments**: send a Fygaro/WiPay link by WhatsApp; press **"Mark paid"** when the money arrives (this stops the day-3 and day-7 reminders).
- **Team** (owners/managers): add staff with **Create account**. A one-time password shows once; send it by WhatsApp.
- **Monthly report**: calls answered, after-hours calls, bookings, leads, minutes used.
- **Settings**: prices, hours, holidays, FAQs, staff. Changes reach the phone assistant on the very next call.

What the assistant will **never** do: invent prices or free times, take card numbers, give medical/legal/financial advice, or pretend to be human. For clinics it only books and routes, and for emergencies it tells the caller to dial **110** (ambulance/fire) or **119** (police) and alerts staff.

---

## 6. Go-live and the first week

- Day 1: check `/admin` → the business: usage counters moving, owner signed in ("hasn't set a password yet" should be gone).
- Days 2–3: read 5–10 call transcripts in **Calls**. Look at the outcome column: lots of "Message taken" for one topic usually means a missing FAQ. Add it in Settings → FAQs & policies.
- Day 7: check `/admin/usage` for the month's minutes and messages against the plan, and ask the owner how it's going.
- Usage alerts: at 80% and 100% of the plan's included minutes or messages you get an email (`ALERT_EMAIL`) and the owner gets a WhatsApp notice, once per month per threshold.

## 7. Changing plans

Business page → **Plan** → choose Lite / Starter / Growth → **Save**. The new included amounts apply to the current month's report straight away. Prices per plan are edited in `/admin/plans`. Nothing charges anyone automatically: invoice from `/admin/usage` (Download CSV).

## 8. Pausing or disabling a client

Business page → **Status** → **Disabled (paused)** → **Save**. Immediately:
- calls get a short "not available, please WhatsApp" message;
- the widget disappears, and WhatsApp replies and reminders stop;
- the business's users are signed out and can't sign in.

Nothing is deleted. Set it back to **Active (live)** to restore everything. Tell the owner to cancel call forwarding (`##002#`) if the pause will be long, otherwise their customers reach the "not available" message.

## 9. Offboarding (client leaves)

Everything is on the business's admin page, in **Client leaving: export and delete**.

1. **Give them their data.** Press **Download all data (JSON)**. The file has everything held for the business, decrypted: settings, services and staff, customers, bookings, leads, every chat and call transcript still within the retention period, payment requests, monthly usage and the activity log. It never contains passwords or provider keys. Recording links point to Retell and stop working after step 4, so if the client wants recordings, they should download them first. Send the file to the owner securely (not by plain email if you can avoid it), and keep a note of when.
2. **Disable** the business (section 8). Deleting is only possible once it's disabled.
3. Owner dials **`##002#`** on their phone to cancel all forwarding.
4. **Delete the business.** Tick "The client has their data export, or has said in writing they don't want one", type the business's short name (its slug) and press **Delete**. This removes every row for the business (customers, bookings, chats, calls, payment requests, logins, settings, usage) in one go, and queues deletion of Retell's copies in the background: every call (recording and transcript), the voice agent, its LLM and the number import. One line stays in the audit log saying who deleted which business and when, with record counts and the last two months' usage totals, but no customer data. **Run the final invoice from `/admin/usage` before deleting**: the business disappears from that page afterwards.
5. **Finish by hand.** `/admin` then lists, for 30 days, what's left outside Conroy for that business:
   - release the 876 number in Telnyx/Twilio (or port it to the owner if agreed);
   - remove the number from your Meta WhatsApp account or 360dialog, or hand it back;
   - ask them to stop sharing their Google Calendar with the service account, or delete the Cal.com API key they gave you;
   - remove the widget snippet from their website.
6. **Backups** still contain the business until they rotate out (`BACKUP_KEEP_DAYS`, 14 by default), as do any off-server copies you keep. Tell the client this; the data-processing clause (`legal/DATA_PROCESSING_CLAUSE.md`) already says so.

If the client only wants some people removed and stays a customer, use **Erase data** per person on the dashboard's **Privacy requests** page instead.
