import { DateTime } from "luxon";
import type { LocalDate } from "./time";

/**
 * Jamaican public holidays. Rules live in the HolidayDefinition table (seeded
 * from JAMAICA_HOLIDAY_DEFAULTS, editable by the super admin); this module
 * turns rules into concrete dates for a year, including "observed" days
 * (a holiday on a Sunday is observed on the Monday, etc.).
 */

export type HolidayRuleType = "FIXED" | "EASTER_OFFSET" | "NTH_WEEKDAY";
export type ObservedRule = "NONE" | "SUNDAY_TO_MONDAY" | "WEEKEND_TO_MONDAY";

export interface HolidayRule {
  key: string;
  name: string;
  ruleType: HolidayRuleType;
  month?: number | null;
  day?: number | null;
  weekday?: number | null; // 0 = Sunday
  nth?: number | null;
  easterOffset?: number | null;
  observedRule: ObservedRule;
  active?: boolean;
}

export interface HolidayOverrideRule {
  holidayKey: string;
  year: number;
  date: LocalDate;
}

export interface HolidayDate {
  key: string;
  name: string;
  /** Calendar date of the holiday. */
  date: LocalDate;
  /** Day off when it differs from `date` (e.g. Sunday holiday -> Monday). */
  observedDate: LocalDate | null;
}

export const JAMAICA_HOLIDAY_DEFAULTS: HolidayRule[] = [
  { key: "new_years_day", name: "New Year's Day", ruleType: "FIXED", month: 1, day: 1, observedRule: "SUNDAY_TO_MONDAY" },
  { key: "ash_wednesday", name: "Ash Wednesday", ruleType: "EASTER_OFFSET", easterOffset: -46, observedRule: "NONE" },
  { key: "good_friday", name: "Good Friday", ruleType: "EASTER_OFFSET", easterOffset: -2, observedRule: "NONE" },
  { key: "easter_monday", name: "Easter Monday", ruleType: "EASTER_OFFSET", easterOffset: 1, observedRule: "NONE" },
  { key: "labour_day", name: "Labour Day", ruleType: "FIXED", month: 5, day: 23, observedRule: "WEEKEND_TO_MONDAY" },
  { key: "emancipation_day", name: "Emancipation Day", ruleType: "FIXED", month: 8, day: 1, observedRule: "SUNDAY_TO_MONDAY" },
  { key: "independence_day", name: "Independence Day", ruleType: "FIXED", month: 8, day: 6, observedRule: "SUNDAY_TO_MONDAY" },
  { key: "national_heroes_day", name: "National Heroes Day", ruleType: "NTH_WEEKDAY", month: 10, weekday: 1, nth: 3, observedRule: "NONE" },
  { key: "christmas_day", name: "Christmas Day", ruleType: "FIXED", month: 12, day: 25, observedRule: "SUNDAY_TO_MONDAY" },
  { key: "boxing_day", name: "Boxing Day", ruleType: "FIXED", month: 12, day: 26, observedRule: "SUNDAY_TO_MONDAY" },
];

/** Easter Sunday (Gregorian), anonymous Gregorian algorithm (Meeus/Jones/Butcher). */
export function easterSunday(year: number): LocalDate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return DateTime.utc(year, month, day).toISODate()!;
}

function nthWeekdayOfMonth(year: number, month: number, weekday: number, nth: number): LocalDate {
  const first = DateTime.utc(year, month, 1);
  const firstWeekday = first.weekday % 7; // 0 = Sunday
  const offset = (weekday - firstWeekday + 7) % 7;
  const date = first.plus({ days: offset + (nth - 1) * 7 });
  if (date.month !== month) throw new Error(`No ${nth}th weekday ${weekday} in ${year}-${month}`);
  return date.toISODate()!;
}

export function ruleDate(rule: HolidayRule, year: number): LocalDate {
  switch (rule.ruleType) {
    case "FIXED":
      if (!rule.month || !rule.day) throw new Error(`Holiday ${rule.key} needs month and day`);
      return DateTime.utc(year, rule.month, rule.day).toISODate()!;
    case "EASTER_OFFSET":
      return DateTime.fromISO(easterSunday(year), { zone: "utc" })
        .plus({ days: rule.easterOffset ?? 0 })
        .toISODate()!;
    case "NTH_WEEKDAY":
      if (!rule.month || rule.weekday === null || rule.weekday === undefined || !rule.nth) {
        throw new Error(`Holiday ${rule.key} needs month, weekday and nth`);
      }
      return nthWeekdayOfMonth(year, rule.month, rule.weekday, rule.nth);
  }
}

function weekday(date: LocalDate): number {
  return DateTime.fromISO(date, { zone: "utc" }).weekday % 7;
}

function plusDays(date: LocalDate, days: number): LocalDate {
  return DateTime.fromISO(date, { zone: "utc" }).plus({ days }).toISODate()!;
}

/**
 * All holidays for a year, sorted by date. Observed days that would land on
 * another holiday (Christmas on Sunday -> Monday 26th) push the later one
 * forward (Boxing Day -> Tuesday 27th).
 */
export function holidaysForYear(
  year: number,
  rules: HolidayRule[] = JAMAICA_HOLIDAY_DEFAULTS,
  overrides: HolidayOverrideRule[] = [],
): HolidayDate[] {
  const actual = rules
    .filter((r) => r.active !== false)
    .map((r) => {
      const override = overrides.find((o) => o.holidayKey === r.key && o.year === year);
      return { rule: r, date: override ? override.date : ruleDate(r, year), overridden: Boolean(override) };
    })
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  // Dates already used as a day off by holidays processed so far.
  const claimed = new Set<LocalDate>();
  const isWeekend = (d: LocalDate) => weekday(d) === 0 || weekday(d) === 6;
  const result: HolidayDate[] = [];

  for (const h of actual) {
    let observed: LocalDate | null = null;
    if (!h.overridden) {
      const wd = weekday(h.date);
      if (h.rule.observedRule === "SUNDAY_TO_MONDAY" && wd === 0) observed = plusDays(h.date, 1);
      if (h.rule.observedRule === "WEEKEND_TO_MONDAY" && (wd === 0 || wd === 6)) {
        observed = plusDays(h.date, wd === 0 ? 1 : 2);
      }
    }
    // This holiday's own date was already taken as an earlier holiday's
    // observed day (Boxing Day after a Sunday Christmas): it needs its own day off.
    if (!observed && claimed.has(h.date)) observed = h.date;
    if (observed) {
      while (claimed.has(observed) || isWeekend(observed)) observed = plusDays(observed, 1);
    }
    claimed.add(h.date);
    if (observed) claimed.add(observed);
    result.push({
      key: h.rule.key,
      name: h.rule.name,
      date: h.date,
      observedDate: observed && observed !== h.date ? observed : null,
    });
  }
  return result;
}

/** Map of local date -> holiday for quick lookups (both actual and observed days). */
export function holidayDateMap(holidays: HolidayDate[]): Map<LocalDate, HolidayDate> {
  const map = new Map<LocalDate, HolidayDate>();
  for (const h of holidays) {
    map.set(h.date, h);
    if (h.observedDate) map.set(h.observedDate, h);
  }
  return map;
}
