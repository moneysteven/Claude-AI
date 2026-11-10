import { businessDay, intersectWindows, subtractWindow, type BusinessCalendarRules, type MinuteWindow } from "./hours";
import {
  JAMAICA_TZ,
  addDays,
  addMinutes,
  localDateOf,
  localToUtc,
  minutesToTime,
  overlaps,
  timeToMinutes,
  toLocal,
  todayLocal,
  weekdayOf,
  type LocalDate,
  type LocalTime,
} from "./time";

/**
 * Slot engine (pure, no I/O). Given business hours, holidays, staff schedules,
 * time off and busy intervals, it returns bookable start times. The booking
 * service re-checks the chosen slot inside a locked transaction, so this is
 * the single source of truth for "is this time free?".
 */

export interface StaffScheduleRule {
  weekday: number;
  isOff: boolean;
  startTime?: LocalTime | null;
  endTime?: LocalTime | null;
  breakStart?: LocalTime | null;
  breakEnd?: LocalTime | null;
}

export interface StaffAvailabilityInput {
  id: string;
  name: string;
  /** Empty array = works whenever the business is open. */
  schedule: StaffScheduleRule[];
  timeOff: { startAt: Date; endAt: Date }[];
}

/** Busy time. staffId null = blocks every resource (e.g. a business-wide calendar event). */
export interface BusyInterval {
  staffId: string | null;
  startAt: Date;
  endAt: Date;
}

export interface SlotQuery {
  rules: BusinessCalendarRules;
  fromDate: LocalDate;
  toDate: LocalDate; // inclusive
  now: Date;
  slotIntervalMin: number;
  leadTimeMin: number;
  maxDaysAhead: number;
  durationMin: number;
  bufferMin: number;
  /** Staff qualified for the service. Empty = the business itself is the only resource. */
  staff: StaffAvailabilityInput[];
  busy: BusyInterval[];
  /** Optional local-time filters, e.g. afternoons only. */
  earliestTime?: LocalTime;
  latestTime?: LocalTime;
  limit?: number;
}

export interface Slot {
  startAt: Date;
  /** End of the appointment itself (without buffer). */
  endAt: Date;
  localDate: LocalDate;
  localTime: LocalTime;
  /** Staff free for this slot; [] when the business has no staff resources. */
  staffIds: string[];
}

export const BUSINESS_RESOURCE = "__business__";

function staffWindows(staff: StaffAvailabilityInput, date: LocalDate, businessWindows: MinuteWindow[], tz: string): MinuteWindow[] {
  let windows = businessWindows;
  if (staff.schedule.length > 0) {
    const rule = staff.schedule.find((s) => s.weekday === weekdayOf(date));
    if (!rule || rule.isOff || !rule.startTime || !rule.endTime) return [];
    let own: MinuteWindow[] = [{ start: timeToMinutes(rule.startTime), end: timeToMinutes(rule.endTime) }];
    if (rule.breakStart && rule.breakEnd) {
      own = subtractWindow(own, { start: timeToMinutes(rule.breakStart), end: timeToMinutes(rule.breakEnd) });
    }
    windows = intersectWindows(windows, own);
  }
  // Time off that touches this date.
  const dayStart = localToUtc(date, "00:00", tz);
  const dayEnd = localToUtc(addDays(date, 1), "00:00", tz);
  for (const off of staff.timeOff) {
    if (!overlaps(off.startAt, off.endAt, dayStart, dayEnd)) continue;
    const startMin = off.startAt <= dayStart ? 0 : minuteOfDay(off.startAt, tz);
    const endMin = off.endAt >= dayEnd ? 24 * 60 : minuteOfDay(off.endAt, tz);
    windows = subtractWindow(windows, { start: startMin, end: endMin });
  }
  return windows;
}

function minuteOfDay(d: Date, tz: string): number {
  const l = toLocal(d, tz);
  return l.hour * 60 + l.minute;
}

function isFree(resourceId: string, start: Date, end: Date, busy: BusyInterval[]): boolean {
  return !busy.some(
    (b) => (b.staffId === null || b.staffId === resourceId) && overlaps(start, end, b.startAt, b.endAt),
  );
}

export function findSlots(q: SlotQuery): Slot[] {
  const tz = q.rules.timezone || JAMAICA_TZ;
  const earliestStart = addMinutes(q.now, q.leadTimeMin);
  const lastDate = addDays(todayLocal(q.now, tz), q.maxDaysAhead);
  const minFilter = q.earliestTime ? timeToMinutes(q.earliestTime) : 0;
  const maxFilter = q.latestTime ? timeToMinutes(q.latestTime) : 24 * 60;
  const step = Math.max(5, q.slotIntervalMin);
  const resources: StaffAvailabilityInput[] =
    q.staff.length > 0 ? q.staff : [{ id: BUSINESS_RESOURCE, name: "business", schedule: [], timeOff: [] }];

  const slots: Slot[] = [];
  for (let date = q.fromDate; date <= q.toDate && date <= lastDate; date = addDays(date, 1)) {
    const day = businessDay(q.rules, date);
    if (!day.isOpen) continue;

    // start minute -> free resources
    const byStart = new Map<number, string[]>();
    for (const r of resources) {
      for (const w of staffWindows(r, date, day.windows, tz)) {
        for (let s = w.start; s + q.durationMin <= w.end; s += step) {
          if (s < minFilter || s > maxFilter) continue;
          const startAt = localToUtc(date, minutesToTime(s), tz);
          if (startAt < earliestStart) continue;
          const blockedUntil = addMinutes(startAt, q.durationMin + q.bufferMin);
          if (!isFree(r.id, startAt, blockedUntil, q.busy)) continue;
          const list = byStart.get(s) ?? [];
          list.push(r.id);
          byStart.set(s, list);
        }
      }
    }

    for (const s of [...byStart.keys()].sort((a, b) => a - b)) {
      const startAt = localToUtc(date, minutesToTime(s), tz);
      const ids = byStart.get(s)!.filter((id) => id !== BUSINESS_RESOURCE);
      slots.push({
        startAt,
        endAt: addMinutes(startAt, q.durationMin),
        localDate: date,
        localTime: minutesToTime(s),
        staffIds: ids,
      });
      if (q.limit && slots.length >= q.limit) return slots;
    }
  }
  return slots;
}

/** Is one specific start time bookable (optionally for one staff member)? Returns the free staff ids. */
export function checkSlot(q: Omit<SlotQuery, "fromDate" | "toDate" | "limit">, startAt: Date, staffId?: string | null): string[] | null {
  const tz = q.rules.timezone || JAMAICA_TZ;
  const date = localDateOf(startAt, tz);
  const staff = staffId ? q.staff.filter((s) => s.id === staffId) : q.staff;
  if (staffId && staff.length === 0) return null;
  // Use a 1-minute grid aligned to the requested time so off-grid requests
  // ("2:15" on a 30-minute grid) are judged on availability, not alignment.
  const slots = findSlots({ ...q, staff, fromDate: date, toDate: date, slotIntervalMin: 5 });
  const hit = slots.find((s) => s.startAt.getTime() === startAt.getTime());
  if (!hit) return null;
  return hit.staffIds;
}

/**
 * Pick up to `n` slots spread across the list (morning / midday / afternoon)
 * so a caller hears real choices instead of 9:00, 9:30 and 10:00.
 */
export function spreadSlots<T>(slots: T[], n: number): T[] {
  if (slots.length <= n) return slots;
  const out: T[] = [];
  for (let i = 0; i < n; i++) {
    out.push(slots[Math.round((i * (slots.length - 1)) / Math.max(1, n - 1))]);
  }
  return [...new Set(out)];
}
