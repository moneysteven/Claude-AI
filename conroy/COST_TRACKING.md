# Cost tracking: what each client uses and what it costs you

Conroy meters usage per business automatically. This note explains what is counted, where to see it, what each unit costs you, and how to check your provider bills against Conroy's numbers each month.

> **Every price below is a planning estimate from November 2026 research, not a quote.** Some figures come from third-party summaries (marked *unconfirmed*). Re-check each against the provider's current price page before you set or change your plans. The exchange rate **J$158 = US$1** is only an example.

---

## 1. What is counted (`UsageEvent`)

Every billable event is written to the `UsageEvent` table with the business, the kind, a quantity and the time. Provider webhooks are often sent more than once. A `dedupeKey` (for example `call:<Retell call id>` or `wa-out:<message id>`) makes sure a retry is never counted twice.

| Kind | Counted when | Quantity | Dedupe key |
|---|---|---|---|
| `VOICE_SECONDS` | Retell sends `call_ended` | seconds of the call | `call:<Retell call id>` |
| `TELEPHONY_SECONDS` | Twilio/Telnyx call webhook (`/api/telephony/twilio` or `/telnyx`), only if you set them up | seconds the carrier saw | `twilio:<CallSid>` / `telnyx:<call session>` |
| `WHATSAPP_INBOUND` | a customer's WhatsApp message arrives | 1 | `wa-in:<WhatsApp message id>` |
| `WHATSAPP_OUTBOUND_SESSION` | Conroy or staff send a free-form reply inside the 24-hour window | 1 | `wa-out:<message id>` |
| `WHATSAPP_OUTBOUND_TEMPLATE` | a template is sent: confirmations, reminders, payment links and follow-ups, **and** owner call summaries and staff alerts | 1 | `wa-out:` / `wa-staff:` |
| `WEB_CHAT_MESSAGE` | a visitor sends a message in the website widget | 1 | (none) |
| `LLM_INPUT_TOKENS`, `LLM_OUTPUT_TOKENS` | every chat-model call for WhatsApp and website chat | tokens | (none) |

Notes:
- **Call minutes are rounded up per call** (a 61-second call counts as 2 minutes), the way carriers bill. Raw seconds are kept too.
- **Voice AI cost isn't in the token counts.** Retell runs the phone conversation's model and bills you for it per minute. The LLM token kinds only cover WhatsApp and web chat.
- **Input tokens include cached prompt tokens.** Cached reads cost about a tenth of normal input, so the count overstates real chat cost a little.
- **A plan's "WhatsApp messages" means messages sent** (session + template), including owner summaries and alerts. Messages received aren't charged by Meta and aren't counted against the plan.

## 2. Where to see it

| Who | Where | What |
|---|---|---|
| You | `/admin` | Totals for the month and, per business, call minutes and WhatsApp sent against the plan with a % badge |
| You | `/admin/usage` | Month picker, every business with calls, minutes, carrier minutes (if any), WhatsApp in/out, web chats, LLM tokens, base price, overage and total. **Download CSV** for invoicing. |
| You | `/admin` → a business | "Usage this month" with the bill so far |
| Owner | Dashboard overview | "This month's plan usage" card |
| Owner | `/dashboard/report` | Monthly report: calls answered, after-hours calls, minutes used, bookings, leads, messages, payments |

**Billing month = calendar month in Jamaica time** (America/Jamaica, UTC−5). A call at 11:30 PM on 30 November counts in November.

## 3. Alerts at 80% and 100%

A worker job runs every hour (minute 23). When a business passes **80%** and then **100%** of its plan's included **call minutes** or **WhatsApp messages**:
- you get an email at `ALERT_EMAIL` (needs `SMTP_*` set in `.env`);
- the owner gets a WhatsApp "Usage notice" (the `staff_alert` template), which mentions the overage rate at 100%.

Each alert fires once per business, per month, per threshold (stored in `UsageAlert`).

---

## 4. Unit costs (planning figures)

### 4.1 Phone calls

| Part | US$ per minute | Confidence |
|---|---|---|
| Retell voice infrastructure | 0.055 | medium (Retell blog/learn pages; pricing page not reached) |
| Retell text-to-speech, platform voice | ≈ 0.015 (premium voices 0.04–0.10) | medium |
| Retell LLM (small model, e.g. `claude-5.5-haiku` / GPT-5 mini class) | ≈ 0.008–0.04 | medium |
| Retell telephony on **your own** SIP trunk | 0 | medium |
| Carrier inbound (Telnyx "from" rate) | from 0.0032 (Jamaica-specific rate *unconfirmed*; Twilio's CSV lists 0.01) | low |
| **Planning total** | **≈ 0.11** | |

At J$158/US$1, the planning cost is **≈ J$17.40 per minute**.

The voice you choose (`RETELL_VOICE_ID`) matters most: a premium voice can double the per-minute cost.

### 4.2 Phone number

| Item | US$ per month | Confidence |
|---|---|---|
| Telnyx Jamaica local number | ≈ 34.65 (≈ J$5,475) | medium (Telnyx Jamaica page) |
| Twilio Jamaica local number | 27.00 in Twilio's pricing file, but Twilio's page says no voice-enabled JM numbers right now | low |

The number is a **fixed cost per client** whether or not they get calls. At low volumes it is the biggest single cost.

### 4.3 WhatsApp (Meta)

- Jamaica (+1 876 / 658) is in Meta's **"Rest of Latin America"** pricing market.
- **Utility template**: ≈ **US$0.0113** per delivered message (≈ J$1.79). Third-party figure; confirm on Meta's rate card.
- **Since 1 October 2026** utility templates are charged **even inside the 24-hour window**.
- Free-form replies (session messages) are billed after about **1,000 free per phone number per month** (*confirm*; the rate after that isn't confirmed; the examples below assume the utility rate as a cautious guess).
- Incoming customer messages: free.
- 360dialog adds its own monthly fee per number on top of Meta's charges. Check their current plan.

### 4.4 Chat AI (WhatsApp + website)

- Default model **Claude Haiku 5.5** (`LLM_MODEL=claude-haiku-5-5`): **US$0.10 per million input tokens, US$0.50 per million output tokens** (for prompts up to 100K tokens).
- A typical reply uses ~3–5K input tokens per model call (the knowledge base is most of it) and 1–2 calls, with ~100–300 output tokens. That's about **US$0.001–0.002 per reply (≈ J$0.16–0.32)**.
- The `rules` engine (`LLM_PROVIDER=rules`) costs nothing but only handles simple questions.

### 4.5 Hosting

Hostinger **KVM 2** (2 vCPU, 8 GB): about US$9–15/month (≈ J$1,400–2,400). It is **shared by all clients**. With 10 clients that is ≈ J$240 each.

### 4.6 Planning cost summary (per client per month)

| Item | Planning cost (J$) |
|---|---|
| Each call minute | 17.40 |
| Each WhatsApp template sent | 1.79 |
| Each WhatsApp free-form reply after the ~1,000 free | ≈ 1.79 (assumed) |
| Each AI chat reply | 0.32 |
| 876 number | 5,475 / month |
| Hosting share (10 clients) | 240 / month |

---

## 5. Worked examples (default plans)

Default plans (from `DEFAULT_PLANS` in `src/lib/billing.ts`; your current prices are in `/admin/plans`):

| Plan | Monthly | Included minutes | Included WhatsApp messages | Extra minute | Extra message |
|---|---|---|---|---|---|
| Lite | J$7,500 | 60 | 500 | J$40 | J$4 |
| Starter | J$15,000 | 200 | 1,500 | J$35 | J$3 |
| Growth | J$30,000 | 600 | 4,000 | J$30 | J$3 |

All three examples assume each client has its own Telnyx 876 number, 10 clients share the server, and 40% of sent WhatsApp messages are templates.

**Starter client using exactly its allowance** (200 minutes, 1,500 messages sent, 1,000 AI chat replies):

| Item | Calculation | J$ |
|---|---|---|
| Calls | 200 × 17.38 | 3,476 |
| 876 number | | 5,475 |
| Templates | 600 × 1.79 | 1,071 |
| Free-form replies | 900, inside the ~1,000 free | 0 |
| AI chat | 1,000 × 0.32 | 320 |
| Hosting share | | 237 |
| **Cost** | | **≈ 10,580** |
| **Price** | | **15,000** |
| **Margin** | | **≈ 4,420 (≈ 29%)** |

**Lite client using its allowance** (60 minutes, 500 messages, 300 chat replies): cost ≈ 1,043 + 5,475 + 357 + 0 + 96 + 237 = **≈ J$7,210** against **J$7,500**. **Almost no margin**, because the J$5,475 number is most of the price.
- Options: raise the Lite price;
- or sell Lite without its own 876 number (chat + WhatsApp, with phone answering added as an upgrade);
- or check whether a cheaper number is available.

**Growth client using its allowance** (600 minutes, 4,000 messages, 2,500 chat replies): cost ≈ 10,428 + 5,475 + 2,857 (1,600 templates) + 2,500 (1,400 free-form replies over the free 1,000, assumed rate) + 800 + 237 = **≈ J$22,300** against **J$30,000**. Margin **≈ J$7,700 (≈ 26%)**.

**Overage is profitable at planning costs:** an extra Starter minute sells for J$35 and costs ≈ J$17.40; an extra message sells for J$3 and costs ≈ J$1.79.

### Sensitivity: what moves the numbers
- **The number rental is the largest fixed cost** at low volume (section 4.2).
- **Voice minutes dominate the usage costs.** Every extra 100 minutes costs ≈ J$1,740. If you pick a premium voice (total ≈ US$0.20/min ≈ J$31.60), the Starter overage of J$35/min barely covers cost. Keep the platform voice, or raise overage prices.
- **WhatsApp templates** grow with bookings (confirmation + up to two reminders each) and with every call (the owner's summary is a template).
- **Chat AI is small**, even at thousands of replies.
- **The exchange rate** directly scales every US$-priced item.

---

## 6. Monthly reconciliation (30 minutes, first week of the month)

1. Open `/admin/usage`, pick last month, press **Download CSV**.
2. **Retell**: compare Retell's invoice minutes with the CSV's call minutes summed over all businesses. Retell bills by the second, so its total should be **at or below** Conroy's rounded minutes. A big gap means calls without a `call_ended` webhook: check the app logs for Retell errors. To see one business's calls, filter Retell's call history by agent (each business has its own agent ID, shown on its admin page).
3. **Carrier (Telnyx/Twilio)**: per number, compare the invoice's inbound minutes with the "carrier minutes" column, available if you pointed the carrier's call webhook at `/api/telephony/telnyx` or `/twilio`. Add the monthly number rental per business.
4. **Meta / 360dialog**: in WhatsApp Manager (or the 360dialog hub), view the month's charges per phone number. Compare with "WhatsApp sent" and the template count on each business page. Meta charges per *delivered* message, so its count can be slightly lower than Conroy's "sent".
5. **Anthropic (chat AI)**: one API key serves all businesses. Compare the console's monthly token totals with the sum of the CSV's LLM token columns, and split the bill by each business's share of tokens.
6. **Hosting**: divide the Hostinger invoice by the number of live businesses.
7. Invoice each client: base plan + overage from the CSV. Overage is already calculated with your current plan prices.

## 7. Adjusting prices

`/admin/plans` → edit a plan's name, description, monthly price (J$), included voice minutes, J$ per extra minute, included WhatsApp messages and J$ per extra message → Save.

New prices apply to every business on that plan, including the current month's figures. Nothing charges anyone automatically. Before changing prices, rerun the examples in section 5 with your actual costs from section 6.
