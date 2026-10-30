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
   - **The driver only taps Start and End.** Their phone's GPS sends the
     bus's position every few seconds. They never tap anything for students.
   - **Students check themselves on.** A cheap phone or tablet fixed at the
     bus door runs the **door scanner** page. Each student holds up the QR
     sticker on their school ID card: the first scan means "got on", and a
     second scan (afternoon) means "got off". On the morning run, everyone
     still on board when the driver ends the trip is recorded as
     **arrived at school**, so students only scan once in the morning. The
     **Students → Print ID card QR codes** page prints the stickers.
   - Each parent has a private link to a **live map** showing the bus,
     their stop, and an **alert zone** (a circle around the stop). The
     parent picks the size, 300 m up to 5 km, to match their walk to the
     stop. When the bus enters the zone, the parent gets a **text** (and a
     phone alert and a "Time to leave!" banner if the page is open).
   - The parent's page shows **each of their children** ("On the bus ✓",
     "Arrived at school") and everything they need about the bus: **bus
     number, plate, what it looks like, route, their stop, the driver's name
     and the driver's phone number**.
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

1. Go to **Students** and click **Open parent view** for Andrew Brown
   (two children, Tajay and Jaden, on Route 1).
2. Go to **Buses** and click **Open driver page** for Bus 12.
3. On the driver page, tick **Demo: simulate the drive**, then tap
   **Start morning run**.
4. Go back to **Buses** and click **Open door scanner**. Open "Card won't
   scan?" and type `st02` (Tajay) and then `st13` (Jaden). This works the same
   as scanning their cards. The parent page now shows both boys on the bus.
5. On the parent page, watch the bus move. When it reaches the orange
   circle, "Time to leave!" appears and the parent's text shows up on
   **Messages**.
6. End the trip on the driver page. Both boys are recorded as arrived at
   school and their parent is texted.

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

### 3. The door scanner
Any Android phone or tablet with a front camera works. Mount it by the door,
facing the steps, plugged into the bus's USB power, with the door scanner
link open. Students hold their ID card up to it. It flashes green with their
name and beeps, or flashes red if the card isn't recognised. The camera
also needs HTTPS (see step 2).

### 4. Real routes and students
- Bus routes and stops are in `data/buses.json` (`route` is the line drawn on
  the map; `stops` are where children get picked up), together with each
  bus's number, plate, description, and driver's name and phone. The demo coordinates
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
| `lib/bus.js` | Trips, GPS updates, alert zones, ID card scans |
| `lib/notify.js` | Sending and logging messages, plus **all message wording** |
| `lib/messaging/` | Test and Twilio providers |
| `routes/staff.js` | Staff pages (login required) |
| `routes/driver.js` | Driver phone page (`/driver/<secret link>`): start/end trip only |
| `routes/scanner.js` | Door scanner for student ID cards (`/scan/<secret link>`) |
| `routes/parent.js` | Parent live map (`/track/<secret link>`) |
| `routes/api.js` | Lunch system integration |
