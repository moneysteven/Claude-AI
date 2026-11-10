# Setting up the providers

Conroy runs without any provider accounts (WhatsApp messages are logged, chat uses the keyword engine, the calendar is built in). This guide connects the real services, roughly in the order you need them.

Facts were checked against the providers' documentation in November 2026. Where something couldn't be confirmed it says so. Provider dashboards and prices change: if a menu name differs, look for the closest match.

| Service | Needed for | Where it goes |
|---|---|---|
| Retell AI | answering calls | `.env` (once) + "Create voice agent" per business |
| Telnyx (recommended) or Twilio | the +1 876 number | `.env` (once) + "Connect number" per business |
| Meta WhatsApp Cloud API (or 360dialog) | WhatsApp | `.env` (once) + phone number ID per business |
| Anthropic (or any OpenAI-compatible API) | chat replies on WhatsApp / website | `.env` |
| Google Calendar or Cal.com | syncing with the calendar the business already uses | `.env` (Google, once) + business page |
| Fygaro / WiPay | payment links | the business's own links, in the wizard or Settings → Payment links |
| SMTP email | error alerts, usage alerts, "Forgot your password?" | `.env` |

After changing `.env` on the server: `docker compose up -d` (it restarts what changed).

Webhook URLs to paste into provider dashboards (replace the domain):

| Provider | URL |
|---|---|
| Retell (agent webhook) | `https://APP_DOMAIN/api/retell/webhook` (set automatically) |
| Retell (inbound call webhook on the number) | `https://APP_DOMAIN/api/retell/inbound` (set automatically) |
| Retell custom functions | `https://APP_DOMAIN/api/retell/functions/<name>` (set automatically) |
| Meta WhatsApp | `https://APP_DOMAIN/api/whatsapp/meta` |
| 360dialog | set by the "Register webhook with 360dialog" button |
| Telnyx call events (optional) | `https://APP_DOMAIN/api/telephony/telnyx` |
| Twilio status callback (optional) | `https://APP_DOMAIN/api/telephony/twilio` |

---

## 1. Retell AI (the voice agent)

1. Create an account at retellai.com and add billing.
2. **API key:** Dashboard → API Keys. Use the key that has the **webhook** badge (only that key can verify webhook signatures). Put it in `RETELL_API_KEY`. If you use a different key for API calls, put the webhook one in `RETELL_WEBHOOK_KEY`.
3. `RETELL_FUNCTION_SECRET`: any random string (`openssl rand -hex 16`). Conroy adds it as a header on every custom-function call, on top of Retell's signature.
4. **Voice:** Dashboard → Voices, listen to a few English voices and copy the voice id into `RETELL_VOICE_ID`. Test with Jamaican callers: clear and warm beats "accent-matched".
5. `RETELL_LLM_MODEL` (default `claude-5.5-haiku`): any model in Retell's list works; faster models feel more natural on calls.
6. Keep `RETELL_VERIFY_SIGNATURES=true`.
7. **Per business:** /admin → the business → **Create voice agent**. This creates a Retell LLM and agent from the Conroy template:
   - the opening line with the AI and recording notice;
   - the custom functions (availability, booking, rescheduling, cancelling, messages, handoff, payment links);
   - transfer to the business's handoff number, and end-call;
   - post-call analysis;
   - the call webhook;
   - data retention matching the business's retention setting.

   The business's knowledge (prices, hours, FAQs) is sent fresh on every call by the inbound webhook, so you only re-sync after changing the business name, assistant name or handoff number. Saving those in Settings re-syncs automatically.

You can also do this from the command line: `npm run retell:sync -- --business <slug>` (add `--dry-run` to see the config without calling Retell).

## 2. The +1 876 phone number

### Telnyx (recommended)

Twilio's Jamaica page currently says it has no voice-enabled Jamaican numbers; Telnyx sells them (from about US$34.65/month; check the current price).

1. Create a Telnyx account and complete identity verification.
2. **Buy the number:** Numbers → Search & Buy → country **Jamaica**, type Local. Jamaican numbers need a signed **Letter of Intent** (dated within the last month) and a full address; inbound calls are only switched on after Telnyx verifies the documents. Whether 658 numbers are offered wasn't confirmed: search both 876 and 658.
3. **Outbound Voice Profile:** Voice → Outbound Voice Profiles → create one allowing Jamaica (and wherever handoff numbers are).
4. **SIP connection to Retell:** Voice → SIP Connections → create an **FQDN** connection:
   - FQDN `sip.retellai.com` (Retell's docs suggest DNS record type SRV), transport TCP;
   - attach the Outbound Voice Profile;
   - under Outbound, set **credentials** (username + password) for calls Retell places (transfers).
5. Assign the number to that connection.
6. In `.env`:
   - `TELEPHONY_PROVIDER=telnyx`
   - `SIP_TERMINATION_URI=sip.telnyx.com` (Telnyx also has regional FQDNs; Retell's guide uses `sip.telnyx.com`)
   - `SIP_TRUNK_USERNAME` and `SIP_TRUNK_PASSWORD` = the credentials from step 4

   With `telnyx` set, Conroy adds the `X-Telnyx-Username` header Telnyx needs on transfers.
7. **Per business:** /admin → the business → type the number → **Connect number from SIP trunk** (after "Create voice agent"). This imports the number into Retell, binds it to the business's agent and sets the inbound webhook. You can test it from Retell's dashboard ("Test SIP connection").
8. Optional reconciliation of carrier minutes: point the connection's webhook URL at `https://APP_DOMAIN/api/telephony/telnyx`, and put the account's public key (Mission Control → Keys & Credentials → Public Key) in `TELNYX_PUBLIC_KEY`. Conroy checks the Ed25519 signature on every event.

### Twilio (if it has Jamaican numbers for you)

1. Phone Numbers → Buy → Jamaica. Twilio requires a local address (no PO box), proof of address and a signed Letter of Authorization.
2. Elastic SIP Trunking → create a trunk:
   - **Origination:** add `sip:sip.retellai.com;transport=tcp`.
   - **Termination:** choose a termination URI (it ends in `.pstn.twilio.com`; a localized one such as `name.pstn.ashburn.twilio.com` is fine) and add a **Credential List** (username + password). Instead of credentials you can allow Retell's IP ranges (listed in Retell's "inbound call" docs).
   - **Numbers:** add the number to the trunk.
3. `.env`: `TELEPHONY_PROVIDER=twilio`, `SIP_TERMINATION_URI=name.pstn.twilio.com`, `SIP_TRUNK_USERNAME` / `SIP_TRUNK_PASSWORD` = the credential's **username** (not the list's friendly name) and password.
4. Optional: status callback `https://APP_DOMAIN/api/telephony/twilio` and `TWILIO_AUTH_TOKEN` (Conroy checks `X-Twilio-Signature`).
5. Per business: as in Telnyx step 7.

### Keeping the Digicel / Flow number

Businesses keep the number their customers know and forward calls to Conroy's 876 number. The codes (filled in with the right number) are on the launch screen after onboarding and in the business dashboard under **Widget & phone setup**:

| Dial on the business's mobile | Effect |
|---|---|
| `**61*1876XXXXXXX#` | forward when unanswered (`**61*1876XXXXXXX**20#` = after about 20 seconds) |
| `**67*1876XXXXXXX#` | forward when busy |
| `**21*1876XXXXXXX#` | forward all calls (after hours) |
| `##61#`, `##67#`, `##21#` | cancel that forwarding |
| `##002#` | cancel all forwarding |
| `*#61#` | check unanswered-call forwarding |

These are standard GSM codes; confirm with Digicel/Flow how forwarded calls are charged on the business's plan. Flow landlines use Flow's own forwarding service.

## 3. WhatsApp

### Meta WhatsApp Cloud API (primary)

1. **Business Manager:** create or use Steven Scale Solutions' Meta Business account at business.facebook.com and complete **business verification**.
2. **App:** developers.facebook.com → My Apps → Create app → type **Business** → add the **WhatsApp** product. This creates a WhatsApp Business Account (WABA).
3. **App secret:** App settings → Basic → App secret → `META_WA_APP_SECRET`. Conroy uses it to verify `X-Hub-Signature-256` on every webhook.
4. **Permanent token:** Business settings → Users → **System users** → add one, assign it the app and the WABA, **Generate token** with expiry **Never** and permissions `business_management`, `whatsapp_business_management`, `whatsapp_business_messaging` → `META_WA_ACCESS_TOKEN`.
5. **Webhook:** App → WhatsApp → Configuration:
   - Callback URL `https://APP_DOMAIN/api/whatsapp/meta`;
   - Verify token = any random string, also put in `META_WA_VERIFY_TOKEN`;
   - subscribe to the **messages** field.
6. `META_WA_API_VERSION=v26.0` (default). Meta announced v27.0 in November 2026; either works. Versions last about two years.
7. **Phone numbers:** WhatsApp → API Setup → add each client's WhatsApp number and verify it by SMS or call. A number already active in the WhatsApp app must be moved, unless you use Meta's coexistence option. Copy its **Phone number ID**.
8. **Per business:** /admin → the business → WhatsApp → provider **Meta WhatsApp Cloud API**, paste the phone number ID, Save → **Send test template to the owner**.
9. **Message templates:** create the seven templates below in WhatsApp Manager → Message templates, exactly as written (names, Utility category, English `en`). Business-started messages (reminders, confirmations outside 24 hours, payment links, owner summaries, staff alerts) only send once Meta approves them.

How clients are set up: the simplest model is that every client's number lives under **your** WABA (you're the provider, you pay Meta and re-bill through the plans). Letting clients own their WABA through Meta's Embedded Signup requires becoming a Meta Tech Provider; Conroy supports per-business tokens (business page → Meta access token) if you go that way later.

Pricing (details in COST_TRACKING.md): Jamaica is in Meta's "Rest of Latin America" market. Since 1 October 2026, utility templates are charged even inside the 24-hour window, and free-form replies are charged after a monthly free allowance per number.

### 360dialog (alternative)

1. In the 360dialog hub, create a channel for the client's number and generate its **API key**.
2. Set `DIALOG360_WEBHOOK_TOKEN` in `.env` to a random string (`openssl rand -hex 24`). 360dialog doesn't sign webhooks, so this secret is what proves a webhook came from 360dialog.
3. Per business: /admin → the business → WhatsApp → provider **360dialog**, paste the phone number ID (shown in the hub) and the API key, Save. Then press **Register webhook with 360dialog**. Conroy calls 360dialog's `POST /v1/configs/webhook` with the business's URL and the secret as a header. The `APP_URL` must be https.
4. **Generating a new API key in 360dialog removes the webhook**: press "Register webhook" again after any key change.
5. Create the same seven templates in the 360dialog hub.

### The seven templates

Template parameters can't contain new lines, tabs or more than four spaces in a row; Conroy cleans them automatically.

#### `booking_confirmation`

- Category: **Utility** · Language: **English (`en`)**
- Used for: Sent right after a booking is made by phone, website or WhatsApp.
- Body:

```text
Hi {{1}}, your {{2}} at {{3}} is confirmed for {{4}}. Booking ref: {{5}}. Reply to this message if you need to reschedule or cancel.
```

- Sample values for Meta's review: {{1}} = "Shanice", {{2}} = "Silk Press", {{3}} = "Tasha's Beauty Salon", {{4}} = "Saturday 14 November at 10:00 AM", {{5}} = "TB-7K4P"

#### `appointment_reminder`

- Category: **Utility** · Language: **English (`en`)**
- Used for: Sent 24 hours and 2 hours before the appointment.
- Body:

```text
Reminder from {{1}}: your {{2}} is {{3}}, {{4}}. Booking ref: {{5}}. Reply C to cancel or R to reschedule.
```

- Sample values for Meta's review: {{1}} = "Tasha's Beauty Salon", {{2}} = "Silk Press", {{3}} = "tomorrow", {{4}} = "Saturday 14 November at 10:00 AM", {{5}} = "TB-7K4P"

#### `booking_update`

- Category: **Utility** · Language: **English (`en`)**
- Used for: Sent when a booking is rescheduled or cancelled.
- Body:

```text
Hi {{1}}, your booking {{2}} at {{3}} has been {{4}}. Details: {{5}}. Reply here if you have any questions.
```

- Sample values for Meta's review: {{1}} = "Shanice", {{2}} = "TB-7K4P", {{3}} = "Tasha's Beauty Salon", {{4}} = "rescheduled", {{5}} = "Silk Press on Monday 16 November at 2:00 PM"

#### `payment_link`

- Category: **Utility** · Language: **English (`en`)**
- Used for: Sends a Fygaro or WiPay payment link (deposit, full payment or invoice).
- Body:

```text
Hi {{1}}, here is your secure payment link from {{2}} for {{3}} ({{4}}): {{5}} Reference: {{6}}. We never ask for card details by chat.
```

- Sample values for Meta's review: {{1}} = "Shanice", {{2}} = "Tasha's Beauty Salon", {{3}} = "Box Braids deposit", {{4}} = "J$5,000", {{5}} = "https://pay.example.com/abc", {{6}} = "PAY-8XK2"

#### `payment_reminder`

- Category: **Utility** · Language: **English (`en`)**
- Used for: Polite payment follow-up (day 3 and day 7).
- Body:

```text
Hi {{1}}, a friendly reminder from {{2}}: your payment of {{3}} for {{4}} (ref {{5}}) is still open. Pay securely here: {{6}} If you've already paid, please reply and we'll check.
```

- Sample values for Meta's review: {{1}} = "Shanice", {{2}} = "Tasha's Beauty Salon", {{3}} = "J$5,000", {{4}} = "Box Braids deposit", {{5}} = "PAY-8XK2", {{6}} = "https://pay.example.com/abc"

#### `owner_call_summary`

- Category: **Utility** · Language: **English (`en`)**
- Used for: Summary sent to the owner after every call.
- Body:

```text
New call for {{1}}. Caller: {{2}}. Reason: {{3}}. Outcome: {{4}}. Booking: {{5}}. Transcript: {{6}}
```

- Sample values for Meta's review: {{1}} = "Tasha's Beauty Salon", {{2}} = "Shanice Brown (876) 555-0142", {{3}} = "Wants a silk press Saturday", {{4}} = "Booked", {{5}} = "Silk Press, Sat 14 Nov 10:00 AM, ref TB-7K4P", {{6}} = "https://app.example.com/dashboard/calls/abc"

#### `staff_alert`

- Category: **Utility** · Language: **English (`en`)**
- Used for: Handoff requests, urgent flags and messages for staff.
- Body:

```text
{{1}} for {{2}}: {{3}}. Customer: {{4}}. Open the inbox: {{5}}
```

- Sample values for Meta's review: {{1}} = "Customer wants a person", {{2}} = "Tasha's Beauty Salon", {{3}} = "Asked about a refund", {{4}} = "(876) 555-0142", {{5}} = "https://app.example.com/dashboard/inbox/abc"

## 4. Chat LLM (WhatsApp and website replies)

- **Anthropic (default):** console.anthropic.com → API keys → `ANTHROPIC_API_KEY`, with `LLM_PROVIDER=anthropic` and `LLM_MODEL=claude-haiku-5-5` (small, fast and cheap).
- **Any OpenAI-compatible API** (OpenAI, OpenRouter, Groq...): `LLM_PROVIDER=openai`, `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `LLM_MODEL`.
- `LLM_PROVIDER=rules` uses no LLM at all. It's also the automatic fallback if the LLM fails.

Emergencies, "talk to a person" and STOP never depend on the LLM.

## 5. Calendars

### Google Calendar (service account, no per-client OAuth)

1. console.cloud.google.com → create a project (e.g. "Conroy").
2. APIs & Services → Library → enable **Google Calendar API**.
3. IAM & Admin → Service accounts → create one (no roles needed) → Keys → Add key → JSON. From the file:
   - `client_email` → `GOOGLE_SERVICE_ACCOUNT_EMAIL`;
   - `private_key` → `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` (in quotes, keeping the `\n` sequences).

   Delete the JSON file afterwards.
4. **Per business:**
   - The owner opens Google Calendar → Settings → their calendar → **Share with specific people** → adds the service-account email with **Make changes to events**.
   - The **Calendar ID** is under "Integrate calendar"; for the main calendar it's their Gmail address.
   - In /admin → the business → Calendar: choose **Google Calendar**, paste the ID, Save → **Test calendar**.
   - Staff with their own calendars: share each one the same way and put its ID on the staff member (business dashboard → Settings → Staff).

Conroy's own bookings stay the source of truth. Google receives a copy of each booking and tells Conroy when the owner has blocked time.

### Cal.com

1. Cal.com → Settings → Developer → **API keys** → create a key.
2. The event type ID is the number in the event type's URL in Cal.com.
3. /admin → the business → Calendar → **Cal.com**, paste the key and event type ID, Save → **Test calendar**.

Cal.com requires an attendee email; Conroy uses a non-deliverable placeholder per booking because customers book by phone or WhatsApp.

## 6. Payment links (Fygaro, WiPay)

No card data ever reaches Conroy: it fills in the business's own link and sends it by WhatsApp, then follows up on day 3 and day 7 until staff press **Mark paid**.

- **Fygaro:** in the business's Fygaro account, create a **Fygaro Link** (payment button) for each purpose (deposit, full payment). Fygaro documents three URL parameters, so add them to the link:

  ```text
  https://fygaro.com/en/pb/<their-link>/?amount={amount}&client_reference={reference}&client_note={description}
  ```

  `client_reference` and `client_note` are stored with the payment, so staff can match it to Conroy's reference. The customer can still edit the amount on Fygaro's page. Fygaro's signed (JWT) links can lock the amount, but they need the Pro plan and aren't wired into Conroy yet.
- **WiPay:** WiPay's "pay me" links don't document pre-filled amounts, so paste the plain link (e.g. `https://jm.wipayfinancial.com/to_me/<account>`). The WhatsApp message tells the customer the amount and the reference to quote. WiPay's hosted checkout API (fixed amount plus an automatic "paid" callback) is a possible future upgrade.
- Placeholders available: `{amount}` (e.g. 5000.00), `{amount_cents}`, `{reference}`, `{name}`, `{currency}`, `{description}`. Links must be https.

## 7. Email (alerts and sign-in links)

Any SMTP account works: Hostinger email for your domain, Zoho, or a Gmail app password.

- `SMTP_HOST`, `SMTP_PORT` (587, or 465 for SSL), `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`;
- `ALERT_EMAIL` = where alerts go.

With SMTP set, the "Forgot your password?" page emails one-time sign-in links (valid 20 minutes, single use). Without it, owners reset staff passwords from the Team page and you reset owners' passwords from their business dashboard.

## 8. Emergency numbers used by the assistant

Police **119**, ambulance and fire **110** (confirmed with the Jamaica Fire Brigade and JIS). 112 and 911 are reported to work too, but the assistant gives the two official numbers.
