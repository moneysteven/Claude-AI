# School Connect

Keeps Jamaican parents informed automatically, and lets them follow the
school bus live so they reach the stop on time.

**Three features:**

1. **Parent alerts by SMS / WhatsApp**
   - A parent is texted when their child is marked **absent** or **late**
     (once per day, even if the register is saved again).
   - A parent is texted when their child is at school but **didn't collect
     lunch**. Your existing kitchen system tells this app who got lunch (see
     *Lunch system integration* below).
   - **Message every parent at once**, or one class, or one bus route.
     There are ready-made texts for weather closures, early dismissal and
     emergencies. Each parent gets the message on their own phone, so
     there's no WhatsApp group to manage and nobody gets missed.
   - Every message is logged on the **Messages** page, a record of who was
     told what and when.

2. **CSEC SBA tracker**
   - Teachers add each SBA (subject, task, class, due date) and tick off each
     student: *not started / in progress / submitted*.
   - The **Behind** list shows every student with an SBA that isn't
     submitted and is due within 14 days or already overdue.
   - With one button, every one of those parents gets a reminder text listing
     what's outstanding.

3. **Live school bus tracking**
   - The driver opens a link on their phone and taps **Start morning run**.
     The phone's GPS then sends the bus's position every few seconds.
   - The driver taps **On** or **Off** as each student boards or gets off,
     and the parent gets a text right away ("Tajay got ON Route 1 at 6:52").
   - Each parent has a private link to a **live map** showing the bus, their
     stop, and an **alert zone** (a circle around the stop). The parent
     picks the size, 300 m up to 5 km, to match how long it takes them to
     walk to the stop.
   - When the bus enters the zone, the parent gets a **text** (and a phone
     alert and a "Time to leave!" banner if the page is open). They leave
     home just in time instead of waiting at the stop for half an hour.
   - Parents don't need to install an app or remember a password. The link
     is texted to them from the **Students** page.

## Try it (5 minutes)

```bash
cd school-connect
npm install
cp .env.example .env      # then set STAFF_PASSWORD
npm start
```

Open http://localhost:3000 and log in with your `STAFF_PASSWORD`. On first
start the app creates a demo school with 12 students, 3 classes, CSEC SBAs and
two bus routes.

To demo the bus tracking:

1. Go to **Students** and click **Open parent view** next to a bus student.
2. Go to **Buses** and click **Open driver page** for the same route.
3. On the driver page, tick **Demo: simulate the drive**, then tap
   **Start morning run**.
4. On the parent page, watch the bus move. When it reaches the orange
   circle, "Time to leave!" appears and the parent's text shows up on
   **Messages**.

`npm run seed` wipes everything and recreates the demo data.

In **test mode** (the default), nothing is really sent. Every message appears
on the Messages page instead, so you can show the full system to a principal
without an SMS account.

## Going live

### 1. Real SMS / WhatsApp
1. Create a [Twilio](https://www.twilio.com) account and buy a number that
   can send SMS to Jamaica (+1 876).
2. Fill in `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_SMS_FROM`
   in `.env`, then set `MESSAGING_PROVIDER=twilio`.
3. **WhatsApp:** WhatsApp only allows business-started messages that use
   **pre-approved templates**. Register a WhatsApp sender in Twilio, get your
   alert texts approved as templates, then set `TWILIO_WHATSAPP_FROM`. Until
   that's done, keep parents on SMS.

Prefer a local bulk-SMS gateway (often cheaper per text in Jamaica)? Add one
file in `lib/messaging/` with a `send({ to, body, channel })` function and
select it with `MESSAGING_PROVIDER`.

### 2. Host it on HTTPS
Phones only share GPS with **HTTPS** websites, so the driver page needs a real
domain with HTTPS (Render, Railway, a VPS behind Caddy, etc.). Set
`PUBLIC_URL` to that address so the links texted to parents are correct.

### 3. Real routes and students
- Bus routes and stops are in `data/buses.json` (`route` is the line drawn on
  the map; `stops` are where children get picked up). The demo coordinates
  are approximate, so replace them with your real route.
- Add students on the **Students** page. Brothers and sisters share one
  parent phone number, so the parent gets one link and one message per alert.

### Lunch system integration
Your existing lunch system calls this whenever a student receives lunch:

```
POST /api/lunch/collected
x-api-key: <LUNCH_API_KEY from .env>
Content-Type: application/json

{ "studentId": "st01" }
```

After the lunch period, a staff member presses **Text parents of students
who didn't collect** on the Lunch page.

## Privacy

This app stores children's names, classes and locations, and parents' phone
numbers. That is personal data under Jamaica's **Data Protection Act, 2020**.
Before a real rollout:
- Get written consent from parents (especially for bus tracking).
- Host on a secure server and change `STAFF_PASSWORD` and `SESSION_SECRET`.
- Keep `data/` backed up and private. It is git-ignored for this reason.
- Bus positions are only collected while the driver has a trip running.

## How it's built

Node.js + Express + EJS, the same stack as the store site. Data is kept in JSON
files in `data/` (`lib/store.js`), which is fine for a pilot. Swap that one
file for Postgres when you have many schools. Maps use Leaflet with
OpenStreetMap, which is free with no API key.

| Where | What |
|---|---|
| `lib/school.js` | Attendance, lunch and SBA logic |
| `lib/bus.js` | Trips, GPS updates, alert zones, on/off events |
| `lib/notify.js` | Sending and logging messages, plus **all message wording** |
| `lib/messaging/` | Test and Twilio providers |
| `routes/staff.js` | Staff pages (login required) |
| `routes/driver.js` | Driver phone page (`/driver/<secret link>`) |
| `routes/parent.js` | Parent live map (`/track/<secret link>`) |
| `routes/api.js` | Lunch system integration |
