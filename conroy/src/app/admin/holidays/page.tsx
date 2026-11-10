import type { Metadata } from "next";
import { DateTime } from "luxon";
import { Flash } from "@/components/Flash";
import { requireSuperAdmin } from "@/lib/auth/session";
import { loadHolidayRules } from "@/lib/business";
import { db } from "@/lib/db";
import { holidaysForYear, type HolidayDate } from "@/lib/holidays";
import { todayLocal } from "@/lib/time";
import { removeHolidayOverrideAction, setHolidayOverrideAction, updateHolidayRuleAction } from "./actions";

export const metadata: Metadata = { title: "Public holidays" };

const OBSERVED_LABEL = {
  NONE: "No observed day",
  SUNDAY_TO_MONDAY: "Sunday -> Monday",
  WEEKEND_TO_MONDAY: "Saturday or Sunday -> Monday",
} as const;

function describeRule(r: { ruleType: string; month: number | null; day: number | null; weekday: number | null; nth: number | null; easterOffset: number | null }) {
  if (r.ruleType === "FIXED" && r.month && r.day) return DateTime.utc(2024, r.month, r.day).toFormat("d LLLL") + " every year";
  if (r.ruleType === "EASTER_OFFSET") {
    const off = r.easterOffset ?? 0;
    return off === 0 ? "Easter Sunday" : `${Math.abs(off)} day${Math.abs(off) === 1 ? "" : "s"} ${off < 0 ? "before" : "after"} Easter Sunday`;
  }
  if (r.ruleType === "NTH_WEEKDAY" && r.month && r.weekday !== null && r.nth) {
    const ordinal = ["", "first", "second", "third", "fourth", "fifth"][r.nth] ?? `${r.nth}th`;
    const weekday = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][r.weekday];
    return `${ordinal} ${weekday} in ${DateTime.utc(2024, r.month, 1).toFormat("LLLL")}`;
  }
  return r.ruleType.toLowerCase();
}

function fmt(date: string) {
  return DateTime.fromISO(date).toFormat("ccc d LLL yyyy");
}

export default async function HolidaysPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  await requireSuperAdmin();
  const thisYear = Number(todayLocal().slice(0, 4));
  const years = [thisYear, thisYear + 1];
  const [defs, overrides, { rules }] = await Promise.all([
    db.holidayDefinition.findMany({ orderBy: { sortOrder: "asc" } }),
    db.holidayOverride.findMany({ orderBy: [{ year: "asc" }, { holidayKey: "asc" }] }),
    loadHolidayRules(),
  ]);
  const overrideRules = overrides.map((o) => ({ holidayKey: o.holidayKey, year: o.year, date: o.date }));
  const computed = new Map<number, Map<string, HolidayDate>>(
    years.map((y) => [y, new Map(holidaysForYear(y, rules, overrideRules).map((h) => [h.key, h]))]),
  );

  return (
    <>
      <h1>Jamaican public holidays</h1>
      <Flash searchParams={sp} />
      <p className="muted">
        These rules apply to every business. Each business then chooses to open or close on each holiday (Hours &amp; holidays in its
        dashboard). When a holiday falls on a weekend, the observed rule decides the extra day off; if two holidays land on the same day the
        later one moves to the next weekday. When the government gazettes a different date, add a one-year override below. Changes reach
        the website and chat straight away; the background worker picks them up within 5 minutes.
      </p>

      {defs.length === 0 ? (
        <p className="flash error">No holiday rules in the database yet. Run the seed (npm run db:seed) to load the Jamaican defaults.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Holiday</th>
                <th>Rule</th>
                {years.map((y) => (
                  <th key={y}>{y}</th>
                ))}
                <th>Edit</th>
              </tr>
            </thead>
            <tbody>
              {defs.map((d) => (
                <tr key={d.key}>
                  <td>
                    {d.name}
                    {!d.active ? (
                      <span className="badge danger" style={{ marginLeft: 6 }}>
                        off
                      </span>
                    ) : null}
                    <br />
                    <small className="muted">{d.key}</small>
                  </td>
                  <td>
                    {describeRule(d)}
                    <br />
                    <small className="muted">{OBSERVED_LABEL[d.observedRule]}</small>
                  </td>
                  {years.map((y) => {
                    const h = computed.get(y)?.get(d.key);
                    const overridden = overrides.some((o) => o.holidayKey === d.key && o.year === y);
                    return (
                      <td key={y}>
                        {h ? (
                          <>
                            {fmt(h.date)}
                            {overridden ? (
                              <span className="badge warn" style={{ marginLeft: 6 }}>
                                override
                              </span>
                            ) : null}
                            {h.observedDate ? (
                              <>
                                <br />
                                <small className="muted">observed {fmt(h.observedDate)}</small>
                              </>
                            ) : null}
                          </>
                        ) : (
                          <small className="muted">not applied</small>
                        )}
                      </td>
                    );
                  })}
                  <td>
                    <form action={updateHolidayRuleAction} className="inline">
                      <input type="hidden" name="key" value={d.key} />
                      <input name="name" defaultValue={d.name} aria-label={`Name of ${d.name}`} required maxLength={80} />
                      <select name="observedRule" defaultValue={d.observedRule} aria-label={`Observed rule for ${d.name}`}>
                        {Object.entries(OBSERVED_LABEL).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                      <label className="check">
                        <input type="checkbox" name="active" defaultChecked={d.active} /> Active
                      </label>
                      <button className="small secondary">Save</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>Gazetted date changes (one year only)</h2>
      {overrides.length === 0 ? (
        <p className="muted">No overrides. The rules above are used as-is.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Holiday</th>
                <th>Year</th>
                <th>Date</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {overrides.map((o) => (
                <tr key={o.id}>
                  <td>{defs.find((d) => d.key === o.holidayKey)?.name ?? o.holidayKey}</td>
                  <td>{o.year}</td>
                  <td>{fmt(o.date)}</td>
                  <td>
                    <form action={removeHolidayOverrideAction} className="inline">
                      <input type="hidden" name="holidayKey" value={o.holidayKey} />
                      <input type="hidden" name="year" value={o.year} />
                      <button className="small danger">Remove</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {defs.length > 0 ? (
        <form action={setHolidayOverrideAction} className="stack card">
          <h3 style={{ marginTop: 0 }}>Add or change an override</h3>
          <div className="row">
            <label>
              Holiday
              <select name="holidayKey" required>
                {defs.map((d) => (
                  <option key={d.key} value={d.key}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Year
              <input name="year" type="number" min={2000} max={2100} defaultValue={thisYear} required />
            </label>
            <label>
              Date
              <input name="date" type="date" required />
            </label>
          </div>
          <small className="muted">The date replaces the holiday for that year only; no extra observed day is added.</small>
          <button type="submit">Save override</button>
        </form>
      ) : null}
    </>
  );
}
