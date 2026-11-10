import { DateTime } from "luxon";
import type { Metadata } from "next";
import { Flash } from "@/components/Flash";
import { requireTenant, SETTINGS_ROLES } from "@/lib/auth/session";
import { loadHolidayRules } from "@/lib/business";
import { holidaysForYear, type HolidayDate } from "@/lib/holidays";
import { formatLocalTime, todayLocal, WEEKDAY_NAMES } from "@/lib/time";
import { deleteDateOverrideAction, saveDateOverrideAction, saveHolidaySettingAction, saveWeeklyHoursAction } from "./actions";

export const metadata: Metadata = { title: "Hours & holidays" };

const fmtDate = (d: string) => DateTime.fromISO(d).toFormat("ccc d LLL yyyy");

function HolidayDates({ h }: { h: HolidayDate | undefined }) {
  if (!h) return <span className="muted">-</span>;
  return (
    <>
      {fmtDate(h.date)}
      {h.observedDate ? (
        <>
          <br />
          <small className="muted">observed {fmtDate(h.observedDate)}</small>
        </>
      ) : null}
    </>
  );
}

export default async function HoursPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { business, t } = await requireTenant(SETTINGS_ROLES);
  const today = todayLocal(new Date(), business.timezone);
  const year = Number(today.slice(0, 4));
  const [hours, overrides, settings, holidayRules] = await Promise.all([
    t.businessHours.findMany({}),
    t.dateOverride.findMany({ orderBy: { date: "asc" } }),
    t.businessHolidaySetting.findMany({}),
    loadHolidayRules(),
  ]);
  const thisYear = holidaysForYear(year, holidayRules.rules, holidayRules.overrides);
  const nextYear = holidaysForYear(year + 1, holidayRules.rules, holidayRules.overrides);
  const upcomingOverrides = overrides.filter((o) => o.date >= today);
  const pastOverrides = overrides.filter((o) => o.date < today);

  return (
    <>
      <h1>Hours & holidays</h1>
      <Flash searchParams={sp} />
      <p className="muted">All times are Jamaica time. Bookings are only offered inside these hours.</p>

      <h2>Weekly hours</h2>
      <form action={saveWeeklyHoursAction}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Day</th>
                <th>Closed</th>
                <th>Opens</th>
                <th>Closes</th>
                <th>Lunch break (optional)</th>
              </tr>
            </thead>
            <tbody>
              {WEEKDAY_NAMES.map((name, wd) => {
                const h = hours.find((x) => x.weekday === wd);
                return (
                  <tr key={wd}>
                    <th scope="row">{name}</th>
                    <td>
                      <input type="checkbox" name={`closed_${wd}`} defaultChecked={h ? h.isClosed : wd === 0} aria-label={`${name} closed`} />
                    </td>
                    <td>
                      <input type="time" name={`open_${wd}`} defaultValue={h?.openTime ?? ""} aria-label={`${name} opens`} />
                    </td>
                    <td>
                      <input type="time" name={`close_${wd}`} defaultValue={h?.closeTime ?? ""} aria-label={`${name} closes`} />
                    </td>
                    <td>
                      <div className="row">
                        <input type="time" name={`breakStart_${wd}`} defaultValue={h?.breakStart ?? ""} aria-label={`${name} break starts`} />
                        <span>to</span>
                        <input type="time" name={`breakEnd_${wd}`} defaultValue={h?.breakEnd ?? ""} aria-label={`${name} break ends`} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button type="submit">Save weekly hours</button>
      </form>

      <h2>Special days & closures</h2>
      <p className="muted">Christmas Eve half day, staff training, closed for a funeral... A special day replaces the normal hours for that date.</p>
      {upcomingOverrides.length === 0 ? (
        <p className="muted">No special days coming up.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Hours</th>
                <th>Note</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {upcomingOverrides.map((o) => (
                <tr key={o.id}>
                  <td>{fmtDate(o.date)}</td>
                  <td>
                    {o.isClosed || !o.openTime || !o.closeTime ? (
                      <span className="badge danger">closed</span>
                    ) : (
                      `${formatLocalTime(o.openTime)} - ${formatLocalTime(o.closeTime)}`
                    )}
                  </td>
                  <td>{o.note ?? ""}</td>
                  <td>
                    <form action={deleteDateOverrideAction} className="inline">
                      <input type="hidden" name="id" value={o.id} />
                      <button className="small danger">Remove</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pastOverrides.length > 0 ? <p className="muted">{pastOverrides.length} past special day(s) hidden.</p> : null}
      <form action={saveDateOverrideAction} className="stack card">
        <h3>Add a special day</h3>
        <div className="row">
          <label>
            Date
            <input type="date" name="date" min={today} required />
          </label>
          <label className="check">
            <input type="checkbox" name="isClosed" defaultChecked /> Closed all day
          </label>
        </div>
        <div className="row">
          <label>
            Opens (if not closed)
            <input type="time" name="openTime" />
          </label>
          <label>
            Closes
            <input type="time" name="closeTime" />
          </label>
        </div>
        <label>
          Note (shared with customers)
          <input name="note" maxLength={120} placeholder="Christmas Eve - half day" />
        </label>
        <button type="submit">Save special day</button>
      </form>

      <h2>Public holidays</h2>
      <p className="muted">
        Jamaican public holidays are calculated automatically (movable dates like Ash Wednesday, Good Friday and National Heroes Day included). A
        holiday that falls on a weekend may be observed on the Monday; you are treated the same way on the actual and the observed day. By default
        you are closed on every holiday.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Holiday</th>
              <th>{year}</th>
              <th>{year + 1}</th>
              <th>Your setting</th>
            </tr>
          </thead>
          <tbody>
            {holidayRules.rules
              .filter((r) => r.active !== false)
              .map((r) => {
                const s = settings.find((x) => x.holidayKey === r.key);
                return (
                  <tr key={r.key}>
                    <th scope="row">{r.name}</th>
                    <td>
                      <HolidayDates h={thisYear.find((h) => h.key === r.key)} />
                    </td>
                    <td>
                      <HolidayDates h={nextYear.find((h) => h.key === r.key)} />
                    </td>
                    <td>
                      <form action={saveHolidaySettingAction} className="inline">
                        <input type="hidden" name="holidayKey" value={r.key} />
                        <label className="check">
                          <input type="checkbox" name="isOpen" defaultChecked={s?.isOpen ?? false} /> Open
                        </label>
                        <input type="time" name="openTime" defaultValue={s?.openTime ?? ""} aria-label={`${r.name} opens`} />
                        <input type="time" name="closeTime" defaultValue={s?.closeTime ?? ""} aria-label={`${r.name} closes`} />
                        <button className="small secondary">Save</button>
                      </form>
                      <small className="muted">Open with no times = normal hours that weekday.</small>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </>
  );
}
