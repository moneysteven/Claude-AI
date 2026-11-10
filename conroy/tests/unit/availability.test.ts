import { describe, expect, it } from "vitest";
import { checkSlot, findSlots, spreadSlots, type SlotQuery } from "@/lib/availability";
import { JAMAICA_HOLIDAY_DEFAULTS } from "@/lib/holidays";
import { businessDay, describeDayHours, describeOpenNow, isAfterHours, openStatusAt, type BusinessCalendarRules } from "@/lib/hours";
import { localToUtc } from "@/lib/time";

// Tasha's-style hours: Mon 10-6, Tue-Fri 9-6 with lunch 1-1:30, Sat 8-2 (half day), Sun closed.
const rules: BusinessCalendarRules = {
  timezone: "America/Jamaica",
  weekly: [
    { weekday: 0, isClosed: true },
    { weekday: 1, isClosed: false, openTime: "10:00", closeTime: "18:00" },
    ...[2, 3, 4, 5].map((weekday) => ({
      weekday,
      isClosed: false,
      openTime: "09:00",
      closeTime: "18:00",
      breakStart: "13:00",
      breakEnd: "13:30",
    })),
    { weekday: 6, isClosed: false, openTime: "08:00", closeTime: "14:00" },
  ],
  overrides: [{ date: "2026-12-24", isClosed: false, openTime: "09:00", closeTime: "12:00", note: "Christmas Eve half day" }],
  holidayRules: JAMAICA_HOLIDAY_DEFAULTS,
  holidayOverrides: [],
  holidaySettings: [{ holidayKey: "ash_wednesday", isOpen: true }],
};

const now = new Date("2026-11-09T12:00:00Z"); // Monday 9 Nov 2026, 7:00 AM Jamaica

function query(overrides: Partial<SlotQuery> = {}): SlotQuery {
  return {
    rules,
    fromDate: "2026-11-10",
    toDate: "2026-11-10",
    now,
    slotIntervalMin: 30,
    leadTimeMin: 60,
    maxDaysAhead: 60,
    durationMin: 60,
    bufferMin: 0,
    staff: [],
    busy: [],
    ...overrides,
  };
}

describe("business hours", () => {
  it("applies weekly hours with a lunch break", () => {
    const day = businessDay(rules, "2026-11-10"); // Tuesday
    expect(day.isOpen).toBe(true);
    expect(day.windows).toEqual([
      { start: 540, end: 780 },
      { start: 810, end: 1080 },
    ]);
  });

  it("is closed on Sunday and on public holidays (unless the business opts in)", () => {
    expect(businessDay(rules, "2026-11-15").isOpen).toBe(false); // Sunday
    const heroes = businessDay(rules, "2026-10-19");
    expect(heroes.isOpen).toBe(false);
    expect(heroes.holiday?.name).toBe("National Heroes Day");
    const ash = businessDay(rules, "2026-02-18"); // Ash Wednesday, business chose to open
    expect(ash.isOpen).toBe(true);
    expect(ash.source).toBe("holiday");
  });

  it("closes on the observed Monday after a weekend Labour Day", () => {
    expect(businessDay(rules, "2026-05-25").isOpen).toBe(false);
  });

  it("date overrides win (half day Christmas Eve)", () => {
    const eve = businessDay(rules, "2026-12-24");
    expect(eve.windows).toEqual([{ start: 540, end: 720 }]);
  });

  it("knows if it is open right now", () => {
    expect(openStatusAt(rules, localToUtc("2026-11-10", "10:00")).isOpen).toBe(true);
    expect(isAfterHours(rules, localToUtc("2026-11-10", "13:10"))).toBe(true); // lunch
    expect(isAfterHours(rules, localToUtc("2026-11-10", "20:00"))).toBe(true);
    expect(describeOpenNow(rules, localToUtc("2026-11-14", "15:00"))).toBe(
      "We're closed right now. We open again Monday at 10:00 AM.",
    );
    expect(describeOpenNow(rules, localToUtc("2026-11-10", "10:00"))).toBe(
      "We're open right now until 6:00 PM (closed for lunch 1:00 PM - 1:30 PM).",
    );
    expect(describeOpenNow(rules, localToUtc("2026-11-10", "13:10"))).toBe("We're closed right now. We open again today at 1:30 PM.");
    expect(describeOpenNow(rules, localToUtc("2026-11-10", "15:00"))).toBe("We're open right now until 6:00 PM.");
  });
});

describe("describeDayHours (\"unnu open Sunday?\")", () => {
  const monday7am = localToUtc("2026-11-09", "07:00");

  it("says no for a weekly day off, and when it opens next", () => {
    expect(describeDayHours(rules, "2026-11-15", monday7am)).toBe("No, we're closed on Sundays. We're open again on Monday 16 November, 10:00 AM to 6:00 PM.");
    expect(describeDayHours(rules, "2026-11-15", localToUtc("2026-11-15", "09:00"))).toBe(
      "No, we're closed on Sundays. We're open again tomorrow, 10:00 AM to 6:00 PM.",
    );
  });

  it("gives that day's hours, with lunch", () => {
    expect(describeDayHours(rules, "2026-11-14", monday7am)).toBe("Yes, we're open on Saturday 14 November: 8:00 AM to 2:00 PM.");
    expect(describeDayHours(rules, "2026-11-10", monday7am)).toBe(
      "Yes, we're open tomorrow (Tuesday 10 November): 9:00 AM to 6:00 PM (closed for lunch 1:00 PM to 1:30 PM).",
    );
  });

  it("knows public holidays and special dates", () => {
    expect(describeDayHours(rules, "2026-12-25", monday7am)).toMatch(/^No, we're closed on Friday 25 December for Christmas Day\. We're open again on /);
    expect(describeDayHours(rules, "2026-12-24", monday7am)).toBe(
      "Yes, we're open on Thursday 24 December, special hours (Christmas Eve half day): 9:00 AM to 12:00 PM.",
    );
  });

  it("uses the live status for today", () => {
    expect(describeDayHours(rules, "2026-11-09", localToUtc("2026-11-09", "15:00"))).toBe("We're open right now until 6:00 PM.");
  });
});

describe("findSlots", () => {
  it("returns slots inside opening hours and skips lunch", () => {
    const slots = findSlots(query());
    const times = slots.map((s) => s.localTime);
    expect(times[0]).toBe("09:00");
    expect(times).toContain("12:00"); // 12:00-13:00 fits before lunch
    expect(times).not.toContain("12:30"); // would run into lunch
    expect(times).toContain("13:30");
    expect(times[times.length - 1]).toBe("17:00");
  });

  it("respects lead time from now", () => {
    const slots = findSlots(query({ now: localToUtc("2026-11-10", "10:10") }));
    expect(slots[0].localTime).toBe("11:30"); // 10:10 + 60 min lead -> first grid slot 11:30
  });

  it("excludes busy times including the service buffer", () => {
    const slots = findSlots(
      query({
        bufferMin: 15,
        busy: [{ staffId: null, startAt: localToUtc("2026-11-10", "10:00"), endAt: localToUtc("2026-11-10", "11:15") }],
      }),
    );
    const times = slots.map((s) => s.localTime);
    expect(times).not.toContain("09:00"); // 9:00 + 60 + 15 buffer overlaps 10:00
    expect(times).not.toContain("10:30");
    expect(times).toContain("11:30");
  });

  it("assigns staff using their own schedules and time off", () => {
    const staff = [
      { id: "tasha", name: "Tasha", schedule: [], timeOff: [] },
      {
        id: "keisha",
        name: "Keisha",
        schedule: [{ weekday: 2, isOff: false, startTime: "12:00", endTime: "18:00" }],
        timeOff: [{ startAt: localToUtc("2026-11-10", "15:00"), endAt: localToUtc("2026-11-10", "16:00") }],
      },
    ];
    const busy = [{ staffId: "tasha", startAt: localToUtc("2026-11-10", "14:00"), endAt: localToUtc("2026-11-10", "16:00") }];
    const slots = findSlots(query({ staff, busy }));
    const at = (t: string) => slots.find((s) => s.localTime === t)?.staffIds ?? [];
    expect(at("09:00")).toEqual(["tasha"]);
    expect(at("12:00")).toEqual(["tasha", "keisha"]);
    expect(at("14:00")).toEqual(["keisha"]); // tasha busy; keisha free until her 3 PM time off
    expect(at("14:30")).toEqual([]); // tasha busy, keisha's slot would run into time off
    expect(at("16:00")).toEqual(["tasha", "keisha"]);
  });

  it("never books on a holiday or beyond maxDaysAhead", () => {
    expect(findSlots(query({ fromDate: "2026-12-25", toDate: "2026-12-26" }))).toHaveLength(0);
    expect(findSlots(query({ fromDate: "2027-03-01", toDate: "2027-03-01", maxDaysAhead: 30 }))).toHaveLength(0);
  });

  it("filters by time of day and limit", () => {
    const slots = findSlots(query({ earliestTime: "14:00", limit: 3 }));
    expect(slots.map((s) => s.localTime)).toEqual(["14:00", "14:30", "15:00"]);
  });

  it("checks a single requested time, including off-grid times", () => {
    const base = query();
    expect(checkSlot(base, localToUtc("2026-11-10", "14:15"))).toEqual([]);
    expect(checkSlot(base, localToUtc("2026-11-10", "12:30"))).toBeNull(); // runs into lunch
    expect(checkSlot(base, localToUtc("2026-11-15", "10:00"))).toBeNull(); // Sunday
  });

  it("spreads offered options across the day", () => {
    const slots = findSlots(query());
    const picked = spreadSlots(slots, 3).map((s) => s.localTime);
    expect(picked).toEqual(["09:00", "13:30", "17:00"]);
  });
});
