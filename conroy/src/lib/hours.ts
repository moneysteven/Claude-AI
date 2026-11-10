import { holidayDateMap, holidaysForYear, type HolidayDate, type HolidayOverrideRule, type HolidayRule } from "./holidays";
import {
  JAMAICA_TZ,
  WEEKDAY_NAMES,
  addDays,
  formatLocalTime,
  localDateOf,
  localToUtc,
  minutesToTime,
  timeToMinutes,
  toLocal,
  weekdayOf,
  type LocalDate,
  type LocalTime,
} from "./time";

/** Opening hours for one weekday ("09:00"-"18:00", optional lunch break). */
export interface DayHours {
  isClosed: boolean;
  openTime?: LocalTime | null;
  closeTime?: LocalTime | null;
  breakStart?: LocalTime | null;
  breakEnd?: LocalTime | null;
}

export interface WeeklyHours extends DayHours {
  weekday: number; // 0 = Sunday
}

export interface DateOverrideRule {
  date: LocalDate;
  isClosed: boolean;
  openTime?: LocalTime | null;
  closeTime?: LocalTime | null;
  note?: string | null;
}

export interface HolidaySettingRule {
  holidayKey: string;
  isOpen: boolean;
  openTime?: LocalTime | null;
  closeTime?: LocalTime | null;
}

export interface BusinessCalendarRules {
  timezone: string;
  weekly: WeeklyHours[];
  overrides: DateOverrideRule[];
  holidayRules: HolidayRule[];
  holidayOverrides: HolidayOverrideRule[];
  holidaySettings: HolidaySettingRule[];
}

/** Minutes-since-midnight interval [start, end). */
export interface MinuteWindow {
  start: number;
  end: number;
}

export interface DayStatus {
  date: LocalDate;
  isOpen: boolean;
  windows: MinuteWindow[];
  source: "regular" | "override" | "holiday";
  holiday?: HolidayDate;
  note?: string | null;
}

function windowsFor(h: DayHours): MinuteWindow[] {
  if (h.isClosed || !h.openTime || !h.closeTime) return [];
  const open = timeToMinutes(h.openTime);
  const close = timeToMinutes(h.closeTime);
  if (close <= open) return [];
  if (h.breakStart && h.breakEnd) {
    const bs = timeToMinutes(h.breakStart);
    const be = timeToMinutes(h.breakEnd);
    if (bs > open && be < close && be > bs) {
      return [
        { start: open, end: bs },
        { start: be, end: close },
      ];
    }
  }
  return [{ start: open, end: close }];
}

/** Intersect two sets of windows. */
export function intersectWindows(a: MinuteWindow[], b: MinuteWindow[]): MinuteWindow[] {
  const out: MinuteWindow[] = [];
  for (const x of a) {
    for (const y of b) {
      const start = Math.max(x.start, y.start);
      const end = Math.min(x.end, y.end);
      if (end > start) out.push({ start, end });
    }
  }
  return out.sort((p, q) => p.start - q.start);
}

/** Remove [start, end) from a set of windows. */
export function subtractWindow(windows: MinuteWindow[], cut: MinuteWindow): MinuteWindow[] {
  const out: MinuteWindow[] = [];
  for (const w of windows) {
    if (cut.end <= w.start || cut.start >= w.end) {
      out.push(w);
      continue;
    }
    if (cut.start > w.start) out.push({ start: w.start, end: cut.start });
    if (cut.end < w.end) out.push({ start: cut.end, end: w.end });
  }
  return out;
}

const holidayCache = new Map<string, Map<LocalDate, HolidayDate>>();

function holidaysOn(rules: BusinessCalendarRules, date: LocalDate): HolidayDate | undefined {
  const year = Number(date.slice(0, 4));
  const cacheKey = `${year}:${JSON.stringify(rules.holidayRules)}:${JSON.stringify(rules.holidayOverrides)}`;
  let map = holidayCache.get(cacheKey);
  if (!map) {
    map = holidayDateMap(holidaysForYear(year, rules.holidayRules, rules.holidayOverrides));
    if (holidayCache.size > 50) holidayCache.clear();
    holidayCache.set(cacheKey, map);
  }
  return map.get(date);
}

/** Opening status for a local date: date override > public holiday > weekly hours. */
export function businessDay(rules: BusinessCalendarRules, date: LocalDate): DayStatus {
  const override = rules.overrides.find((o) => o.date === date);
  if (override) {
    const windows = override.isClosed ? [] : windowsFor({ isClosed: false, openTime: override.openTime, closeTime: override.closeTime });
    return { date, isOpen: windows.length > 0, windows, source: "override", note: override.note };
  }

  const weekly = rules.weekly.find((w) => w.weekday === weekdayOf(date));
  const regular = weekly ? windowsFor(weekly) : [];

  const holiday = holidaysOn(rules, date);
  if (holiday) {
    const setting = rules.holidaySettings.find((s) => s.holidayKey === holiday.key);
    if (!setting || !setting.isOpen) return { date, isOpen: false, windows: [], source: "holiday", holiday };
    const windows =
      setting.openTime && setting.closeTime
        ? windowsFor({ isClosed: false, openTime: setting.openTime, closeTime: setting.closeTime })
        : regular;
    return { date, isOpen: windows.length > 0, windows, source: "holiday", holiday };
  }

  return { date, isOpen: regular.length > 0, windows: regular, source: "regular" };
}

export interface OpenNow {
  isOpen: boolean;
  /** When open: closing time today (end of the last window). */
  closesAt?: Date;
  /** When open and a break is still to come today: the break. */
  upcomingBreak?: { start: Date; end: Date };
  /** When closed: next opening instant within 14 days. */
  nextOpenAt?: Date;
  today: DayStatus;
}

export function openStatusAt(rules: BusinessCalendarRules, at: Date): OpenNow {
  const tz = rules.timezone || JAMAICA_TZ;
  const local = toLocal(at, tz);
  const date = local.toISODate()!;
  const minute = local.hour * 60 + local.minute;
  const today = businessDay(rules, date);
  const idx = today.windows.findIndex((w) => minute >= w.start && minute < w.end);
  if (idx >= 0) {
    const last = today.windows[today.windows.length - 1];
    const next = today.windows[idx + 1];
    return {
      isOpen: true,
      closesAt: localToUtc(date, minutesToTime(last.end), tz),
      ...(next
        ? { upcomingBreak: { start: localToUtc(date, minutesToTime(today.windows[idx].end), tz), end: localToUtc(date, minutesToTime(next.start), tz) } }
        : {}),
      today,
    };
  }
  for (let i = 0; i <= 14; i++) {
    const d = addDays(date, i);
    const day = i === 0 ? today : businessDay(rules, d);
    const next = day.windows.find((w) => i > 0 || w.start > minute);
    if (next) return { isOpen: false, nextOpenAt: localToUtc(d, minutesToTime(next.start), tz), today };
  }
  return { isOpen: false, today };
}

/** True when a call at `at` falls outside opening hours (for the "after-hours calls" report). */
export function isAfterHours(rules: BusinessCalendarRules, at: Date): boolean {
  return !openStatusAt(rules, at).isOpen;
}

/** "Mon: 10:00 AM - 6:00 PM (lunch 1:00 PM - 1:30 PM)" lines for the knowledge base. */
export function describeWeeklyHours(weekly: WeeklyHours[]): string[] {
  const order = [1, 2, 3, 4, 5, 6, 0];
  return order.map((wd) => {
    const h = weekly.find((w) => w.weekday === wd);
    const name = WEEKDAY_NAMES[wd];
    if (!h || h.isClosed || !h.openTime || !h.closeTime) return `${name}: closed`;
    let line = `${name}: ${formatLocalTime(h.openTime)} - ${formatLocalTime(h.closeTime)}`;
    if (h.breakStart && h.breakEnd) line += ` (closed for lunch ${formatLocalTime(h.breakStart)} - ${formatLocalTime(h.breakEnd)})`;
    return line;
  });
}

/** Plain sentence about today's status for FAQs: "We're open today until 6:00 PM." */
export function describeOpenNow(rules: BusinessCalendarRules, at: Date): string {
  const tz = rules.timezone || JAMAICA_TZ;
  const status = openStatusAt(rules, at);
  const fmt = (d: Date) => toLocal(d, tz).toFormat("h:mm a");
  const holidayNote = status.today.holiday ? ` (today is ${status.today.holiday.name})` : "";
  if (status.isOpen && status.closesAt) {
    const lunch = status.upcomingBreak ? ` (closed for lunch ${fmt(status.upcomingBreak.start)} - ${fmt(status.upcomingBreak.end)})` : "";
    return `We're open right now until ${fmt(status.closesAt)}${lunch}${holidayNote}.`;
  }
  if (status.nextOpenAt) {
    const sameDay = localDateOf(status.nextOpenAt, tz) === localDateOf(at, tz);
    const when = sameDay ? `today at ${fmt(status.nextOpenAt)}` : toLocal(status.nextOpenAt, tz).toFormat("cccc 'at' h:mm a");
    return `We're closed right now${holidayNote}. We open again ${when}.`;
  }
  return `We're closed right now${holidayNote}.`;
}
