# Solution

A web app for a school to track which **grant-program students** received
food or other products each day. Staff sign in, scan or type a student's
**School ID number**, and Solution either records the serving or shows a big red
**ALREADY RECEIVED TODAY** warning, so no student gets the same item twice in a day.
No cash is involved.

## What it does

- **Staff log-ins.** Each person has their own username and password.
  - **Administrators** manage students, products, staff log-ins and reports.
  - **Staff** can serve students and see today's list.
- **Serve screen** (works on a phone): pick the product (Lunch, Breakfast,
  Snack…), then scan or type the School ID.
  - ✓ **Green:** the student is on the program and hasn't had this product today, so give it to them. It's recorded with the time and the staff member's name.
  - ✕ **Red:** they **already received** it today. It shows what time and who served them.
  - **Yellow:** the ID isn't on the program list, or the student is marked inactive.
  - "Check only" looks a student up without recording anything.
- **One per student, per product, per day.** The database itself enforces this rule, so
  two phones scanning the same student at the same moment can't both succeed.
- **Students:** add them one at a time or import the whole list from Excel (CSV).
  Mark students inactive when they leave the program.
- **Undo:** an administrator can undo a mistaken entry (a reason is required).
  The entry stays on record, crossed out, for accountability.
- **Reports:** any date range, filtered by product, with a spreadsheet (CSV)
  download for the government program's paperwork. Each student's history is available too.
- **Activity log:** records sign-ins, changes, undos and exports.

---

## 1. Put it in a "Solution" folder on your Desktop

1. On GitHub, open this repository, switch to the branch
   `claude/magical-pasteur-ni0yq2` (or `main` once it's merged), click
   **Code → Download ZIP**, and unzip it.
2. Inside the unzipped files, find the folder named **`Solution`** and drag it
   onto your **Desktop**. That folder holds the whole app.

## 2. Install Node.js (one time)

Download the **LTS** version from <https://nodejs.org> and install it with the
default options. (Solution needs version 22.13 or newer.)

## 3. Start Solution

- **Windows:** double-click `start-windows.bat` in the Desktop `Solution` folder.
- **Mac:** double-click `start-mac.command`. If macOS blocks it the first time,
  right-click it → **Open** → **Open**.

The first run installs what it needs (about a minute). After that, a window
like this appears. **Keep it open** while Solution is in use:

```
  Solution is running.

  On this computer:  http://localhost:3000
  On your phone:     http://192.168.1.25:3000   (phone must be on the same Wi-Fi)
```

Open `http://localhost:3000` in a browser on that computer. The **first time**,
it asks you to create the main administrator account. Then:

1. **Products** tab: add what you give out (e.g. *Lunch*, *Breakfast*).
2. **Students** tab → **Import list**: upload a CSV with these columns:
   `School ID, First name, Last name, Grade, Program`
3. **Staff** tab: create a log-in for each staff member who serves.

## 4. Use it on your phone

1. Connect the phone to the **same Wi-Fi** as the computer running Solution.
2. On the phone's browser, type the **"On your phone"** address shown in the
   Solution window (e.g. `http://192.168.1.25:3000`).
3. Sign in, then add it to your home screen so it opens like an app:
   - **iPhone (Safari):** Share → **Add to Home Screen**
   - **Android (Chrome):** ⋮ menu → **Add to Home screen**

Any number of phones, tablets and computers can be signed in at once. They all
share the same records, so a student served at one station shows as
"already received" at every other station right away.

**If the phone can't connect:** check that it's on the same Wi-Fi, not mobile
data. On Windows, if a firewall popup appeared when you started Solution, click
**Allow**. If you missed it, search Windows for "Allow an app through Windows
Firewall" and allow **Node.js**.

**Using it away from the school Wi-Fi** requires putting Solution on a
hosting service with HTTPS (e.g. Render, Railway, or a school server). When doing that,
set `COOKIE_SECURE=1` and `TRUST_PROXY=1`, and make sure the `data` folder is
on a persistent disk.

---

## Barcode scanners

Any USB or Bluetooth barcode scanner that works as a keyboard (most do) works
with Solution. Click the School ID box and scan. The scanner "types" the number
and presses Enter, and Solution records it automatically.

## Your data

- Everything is stored in one file: `Solution/data/solution.db`.
- **Back it up regularly.** Close Solution, then copy that file to a USB drive or cloud folder.
  To restore it, put the file back in the same place.
- To move Solution to a different computer, copy the whole `Solution` folder
  (including `data`).
- This is information about children, so give log-ins only to staff who need them.
  Disable a staff log-in on the **Staff** tab when someone leaves. Don't share passwords.

## Settings (optional)

Set these as environment variables before starting:

| Setting           | Default                 | What it does                                             |
|-------------------|-------------------------|----------------------------------------------------------|
| `PORT`            | `3000`                  | Port number in the web address                            |
| `SCHOOL_TIMEZONE` | the computer's timezone | Decides when a new day starts, e.g. `America/Jamaica`     |
| `DATA_FILE`       | `data/solution.db`      | Where records are stored                                 |
| `COOKIE_SECURE`   | off                     | Set to `1` when served over HTTPS                        |
| `TRUST_PROXY`     | off                     | Set to `1` when behind a hosting provider's proxy        |

## For developers

```
npm install
npm test     # API tests: duplicate blocking, roles, CSRF, lockout
npm start
```

Node ≥ 22.13 (uses the built-in `node:sqlite`). The only dependency is Express.
