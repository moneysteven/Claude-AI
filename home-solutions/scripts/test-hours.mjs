// BRIEF §9.7: open-now badge in America/Jamaica time (UTC-5, no DST).
import { openStatus, hoursTable } from "../src/lib/hours.js";
import { BUSINESS } from "../src/config.js";
const cases = [
  ["Sat 15:00", "2026-11-07T20:00:00Z", true, "Open now · closes 3:30 PM"],
  ["Sat 16:00", "2026-11-07T21:00:00Z", false, "Closed · opens Mon 9:00 AM"],
  ["Sun 12:00", "2026-11-08T17:00:00Z", false, "Closed · opens tomorrow 9:00 AM"],
  ["Mon 08:30", "2026-11-09T13:30:00Z", false, "Closed · opens 9:00 AM"],
  ["Fri 16:59", "2026-11-06T21:59:00Z", true, "Open now · closes 5:00 PM"],
  ["Fri 17:00", "2026-11-06T22:00:00Z", false, "Closed · opens tomorrow 9:00 AM"],
];
let fail = 0;
for (const [name, iso, open, label] of cases) {
  const s = openStatus(BUSINESS.hours, new Date(iso));
  const ok = s.open === open && s.label === label;
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${s.label}${ok ? "" : `  (expected ${label})`}`);
}
console.log(hoursTable(BUSINESS.hours).map((r) => `${r.day}: ${r.text}`).join("\n"));
process.exit(fail ? 1 : 0);
