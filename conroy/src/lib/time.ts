import { DateTime } from "luxon";

/**
 * Time helpers. The database stores UTC; businesses think in local time.
 * Jamaica is America/Jamaica = UTC-5 all year (no daylight saving), but we
 * always go through the IANA zone so the code is correct for any tenant.
 */
export const JAMAICA_TZ = "America/Jamaica";

export type LocalDate = string; // "2026-11-13"
export type LocalTime = string; // "14:30"

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isLocalDate(v: string): boolean {
  return DATE_RE.test(v) && DateTime.fromISO(v).isValid;
}

export function isLocalTime(v: string): boolean {
  return TIME_RE.test(v);
}

/** Minutes since midnight for "HH:mm". */
export function timeToMinutes(t: LocalTime): number {
  if (!isLocalTime(t)) throw new Error(`Invalid time "${t}"`);
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(min: number): LocalTime {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** UTC instant for a local date + time in the zone. */
export function localToUtc(date: LocalDate, time: LocalTime, tz = JAMAICA_TZ): Date {
  const dt = DateTime.fromISO(`${date}T${time}`, { zone: tz });
  if (!dt.isValid) throw new Error(`Invalid local date/time ${date} ${time}`);
  return dt.toUTC().toJSDate();
}

/** Parse "2026-11-13T14:30" (or with seconds) as local time in the zone. */
export function parseLocalDateTime(value: string, tz = JAMAICA_TZ): Date | null {
  const dt = DateTime.fromISO(value, { zone: tz, setZone: false });
  // If the string carries its own offset ("Z" / "+01:00") luxon honours it.
  return dt.isValid ? dt.toUTC().toJSDate() : null;
}

export function toLocal(d: Date, tz = JAMAICA_TZ): DateTime {
  return DateTime.fromJSDate(d, { zone: "utc" }).setZone(tz);
}

export function localDateOf(d: Date, tz = JAMAICA_TZ): LocalDate {
  return toLocal(d, tz).toISODate()!;
}

export function localTimeOf(d: Date, tz = JAMAICA_TZ): LocalTime {
  return toLocal(d, tz).toFormat("HH:mm");
}

/** 0 = Sunday ... 6 = Saturday for a local date. */
export function weekdayOf(date: LocalDate): number {
  return DateTime.fromISO(date).weekday % 7;
}

export function addDays(date: LocalDate, days: number): LocalDate {
  return DateTime.fromISO(date).plus({ days }).toISODate()!;
}

export function todayLocal(now: Date = new Date(), tz = JAMAICA_TZ): LocalDate {
  return localDateOf(now, tz);
}

/** "Friday 13 November" */
export function formatDateLong(d: Date, tz = JAMAICA_TZ): string {
  return toLocal(d, tz).toFormat("cccc d LLLL");
}

/** "Fri 13 Nov, 2:30 PM" */
export function formatDateTimeShort(d: Date, tz = JAMAICA_TZ): string {
  return toLocal(d, tz).toFormat("ccc d LLL, h:mm a");
}

/** "Friday 13 November at 2:30 PM" - what the assistant says. */
export function formatDateTimeSpoken(d: Date, tz = JAMAICA_TZ): string {
  return toLocal(d, tz).toFormat("cccc d LLLL 'at' h:mm a");
}

/** "2:30 PM" */
export function formatTime(d: Date, tz = JAMAICA_TZ): string {
  return toLocal(d, tz).toFormat("h:mm a");
}

/** "9:00 AM" from "09:00" */
export function formatLocalTime(t: LocalTime): string {
  return DateTime.fromFormat(t, "HH:mm").toFormat("h:mm a");
}

/** "Good morning" / "Good afternoon" / "Good evening" in local time. */
export function greetingFor(d: Date, tz = JAMAICA_TZ): string {
  const h = toLocal(d, tz).hour;
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/**
 * Show a Jamaica time to someone abroad, e.g. for a caller from New York:
 * "2:30 PM Jamaica time (3:30 PM your time)".
 */
export function describeForVisitor(d: Date, visitorTz: string | null, tz = JAMAICA_TZ): string {
  const local = `${formatTime(d, tz)} Jamaica time`;
  if (!visitorTz || visitorTz === tz) return local;
  const theirs = DateTime.fromJSDate(d).setZone(visitorTz);
  if (!theirs.isValid) return local;
  const sameClock = theirs.toFormat("h:mm a") === formatTime(d, tz);
  return sameClock ? local : `${local} (${theirs.toFormat("h:mm a")} your time)`;
}

/** Overlap test for half-open intervals [aStart, aEnd) and [bStart, bEnd). */
export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

export function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60_000);
}

export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
