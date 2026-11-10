import { describe, expect, it } from "vitest";
import { easterSunday, holidaysForYear, JAMAICA_HOLIDAY_DEFAULTS } from "@/lib/holidays";
import {
  describeForVisitor,
  formatDateTimeSpoken,
  greetingFor,
  localDateOf,
  localTimeOf,
  localToUtc,
  parseLocalDateTime,
  weekdayOf,
} from "@/lib/time";

describe("Jamaica time zone (UTC-5, no DST)", () => {
  it("converts local Jamaica time to UTC in winter and summer alike", () => {
    expect(localToUtc("2026-01-15", "09:00").toISOString()).toBe("2026-01-15T14:00:00.000Z");
    expect(localToUtc("2026-07-15", "09:00").toISOString()).toBe("2026-07-15T14:00:00.000Z");
  });

  it("converts UTC back to local date and time across midnight", () => {
    const d = new Date("2026-03-01T03:30:00Z"); // 10:30 PM on 28 Feb in Jamaica
    expect(localDateOf(d)).toBe("2026-02-28");
    expect(localTimeOf(d)).toBe("22:30");
  });

  it("parses local ISO strings as Jamaica time", () => {
    expect(parseLocalDateTime("2026-11-14T14:30")?.toISOString()).toBe("2026-11-14T19:30:00.000Z");
    expect(parseLocalDateTime("not a date")).toBeNull();
  });

  it("speaks dates naturally", () => {
    expect(formatDateTimeSpoken(new Date("2026-11-14T19:30:00Z"))).toBe("Saturday 14 November at 2:30 PM");
    expect(weekdayOf("2026-11-14")).toBe(6);
  });

  it("greets by local time of day", () => {
    expect(greetingFor(new Date("2026-11-10T13:00:00Z"))).toBe("Good morning"); // 8 AM
    expect(greetingFor(new Date("2026-11-10T18:00:00Z"))).toBe("Good afternoon"); // 1 PM
    expect(greetingFor(new Date("2026-11-10T23:00:00Z"))).toBe("Good evening"); // 6 PM
  });

  it("confirms times for callers abroad in Jamaica time", () => {
    const at = new Date("2026-07-10T19:30:00Z"); // 2:30 PM Jamaica, 3:30 PM New York (EDT)
    expect(describeForVisitor(at, "America/New_York")).toBe("2:30 PM Jamaica time (3:30 PM your time)");
    expect(describeForVisitor(at, "Europe/London")).toBe("2:30 PM Jamaica time (8:30 PM your time)");
    // In January New York is also UTC-5, so the clocks agree.
    expect(describeForVisitor(new Date("2026-01-10T19:30:00Z"), "America/New_York")).toBe("2:30 PM Jamaica time");
  });
});

describe("Jamaican public holidays", () => {
  it("computes Easter correctly", () => {
    expect(easterSunday(2025)).toBe("2025-04-20");
    expect(easterSunday(2026)).toBe("2026-04-05");
    expect(easterSunday(2027)).toBe("2027-03-28");
    expect(easterSunday(2030)).toBe("2030-04-21");
  });

  it("produces all ten holidays for 2026 with movable dates", () => {
    const h = Object.fromEntries(holidaysForYear(2026).map((x) => [x.key, x]));
    expect(Object.keys(h)).toHaveLength(10);
    expect(h.new_years_day.date).toBe("2026-01-01");
    expect(h.ash_wednesday.date).toBe("2026-02-18");
    expect(h.good_friday.date).toBe("2026-04-03");
    expect(h.easter_monday.date).toBe("2026-04-06");
    expect(h.labour_day.date).toBe("2026-05-23");
    expect(h.emancipation_day.date).toBe("2026-08-01");
    expect(h.independence_day.date).toBe("2026-08-06");
    expect(h.national_heroes_day.date).toBe("2026-10-19");
    expect(h.christmas_day.date).toBe("2026-12-25");
    expect(h.boxing_day.date).toBe("2026-12-26");
  });

  it("observes Labour Day on Monday when it falls on a weekend", () => {
    const labour2026 = holidaysForYear(2026).find((x) => x.key === "labour_day")!;
    expect(labour2026.observedDate).toBe("2026-05-25"); // Sat -> Mon
    const labour2027 = holidaysForYear(2027).find((x) => x.key === "labour_day")!;
    expect(labour2027.observedDate).toBe("2027-05-24"); // Sun -> Mon
  });

  it("moves a Sunday Emancipation Day to Monday", () => {
    const e = holidaysForYear(2027).find((x) => x.key === "emancipation_day")!;
    expect(e.date).toBe("2027-08-01");
    expect(e.observedDate).toBe("2027-08-02");
  });

  it("handles Christmas on a Sunday (Christmas -> Mon 26, Boxing Day -> Tue 27)", () => {
    const list = holidaysForYear(2022);
    expect(list.find((x) => x.key === "christmas_day")!.observedDate).toBe("2022-12-26");
    expect(list.find((x) => x.key === "boxing_day")!.observedDate).toBe("2022-12-27");
  });

  it("handles Christmas on a Saturday (Boxing Day Sunday -> Monday 27)", () => {
    const list = holidaysForYear(2027);
    expect(list.find((x) => x.key === "christmas_day")!.observedDate).toBeNull();
    expect(list.find((x) => x.key === "boxing_day")!.observedDate).toBe("2027-12-27");
  });

  it("National Heroes Day is the third Monday in October", () => {
    expect(holidaysForYear(2025).find((x) => x.key === "national_heroes_day")!.date).toBe("2025-10-20");
    expect(holidaysForYear(2027).find((x) => x.key === "national_heroes_day")!.date).toBe("2027-10-18");
  });

  it("applies an admin override for a gazetted date", () => {
    const list = holidaysForYear(2026, JAMAICA_HOLIDAY_DEFAULTS, [{ holidayKey: "labour_day", year: 2026, date: "2026-05-22" }]);
    const labour = list.find((x) => x.key === "labour_day")!;
    expect(labour.date).toBe("2026-05-22");
    expect(labour.observedDate).toBeNull();
  });

  it("lets admins edit observed rules", () => {
    const rules = JAMAICA_HOLIDAY_DEFAULTS.map((r) => (r.key === "labour_day" ? { ...r, observedRule: "NONE" as const } : r));
    expect(holidaysForYear(2026, rules).find((x) => x.key === "labour_day")!.observedDate).toBeNull();
  });
});
