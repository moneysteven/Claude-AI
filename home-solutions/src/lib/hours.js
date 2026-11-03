// Opening-hours logic in America/Jamaica time (BRIEF §4.10). Pure + testable:
// every function takes an optional `now` Date so tests can mock the clock.

const KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const NAMES = { sun: "Sunday", mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday" };
const SHORT = { sun: "Sun", mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat" };

const toMin = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };

/** "17:00" -> "5:00 PM" */
export function fmt12(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM";
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${ap}`;
}

/** Day index (0=Sun) and minutes since midnight, in the given IANA zone. */
export function zonedNow(tz, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t).value;
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { day, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

/**
 * { open, label } e.g. { open:true, label:"Open now · closes 5:00 PM" }
 * or { open:false, label:"Closed · opens Mon 9:00 AM" }.
 */
export function openStatus(hours, now = new Date()) {
  const { day, minutes } = zonedNow(hours.tz, now);
  const today = hours[KEYS[day]];
  if (today && minutes >= toMin(today[0]) && minutes < toMin(today[1])) {
    return { open: true, label: `Open now · closes ${fmt12(today[1])}` };
  }
  // Find the next opening: later today, or the next day that has hours.
  if (today && minutes < toMin(today[0])) return { open: false, label: `Closed · opens ${fmt12(today[0])}` };
  for (let i = 1; i <= 7; i++) {
    const k = KEYS[(day + i) % 7];
    if (hours[k]) return { open: false, label: `Closed · opens ${i === 1 ? "tomorrow" : SHORT[k]} ${fmt12(hours[k][0])}` };
  }
  return { open: false, label: "Closed" };
}

/** Monday-first table: [{ key, day:"Monday", text:"9:00 AM – 5:00 PM" | "Closed" }] */
export function hoursTable(hours) {
  return ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((k) => ({
    key: k,
    day: NAMES[k],
    text: hours[k] ? `${fmt12(hours[k][0])} – ${fmt12(hours[k][1])}` : "Closed",
  }));
}

/** Schema.org openingHoursSpecification for JSON-LD. */
export function openingHoursSpec(hours) {
  const map = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };
  return Object.keys(map).filter((k) => hours[k]).map((k) => ({
    "@type": "OpeningHoursSpecification", dayOfWeek: map[k], opens: hours[k][0], closes: hours[k][1],
  }));
}
