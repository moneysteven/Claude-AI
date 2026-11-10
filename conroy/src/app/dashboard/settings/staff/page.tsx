import type { Staff } from "@prisma/client";
import type { Metadata } from "next";
import { Flash } from "@/components/Flash";
import { requireTenant, SETTINGS_ROLES } from "@/lib/auth/session";
import { formatPhone } from "@/lib/phone";
import { formatDateTimeShort, todayLocal, WEEKDAY_NAMES } from "@/lib/time";
import { addTimeOffAction, deleteTimeOffAction, saveStaffAction, setStaffScheduleAction, setStaffServicesAction } from "./actions";

export const metadata: Metadata = { title: "Staff" };

function StaffForm({ staff, nextSort }: { staff?: Staff; nextSort: number }) {
  return (
    <form action={saveStaffAction} className="stack">
      {staff ? <input type="hidden" name="id" value={staff.id} /> : null}
      <div className="row">
        <label>
          Name
          <input name="name" defaultValue={staff?.name ?? ""} required maxLength={80} />
        </label>
        <label>
          Title
          <input name="title" defaultValue={staff?.title ?? ""} maxLength={80} placeholder="Senior stylist" />
        </label>
      </div>
      <div className="row">
        <label>
          Direct phone (optional)
          <input name="phone" inputMode="tel" defaultValue={staff?.phone ? formatPhone(staff.phone) : ""} maxLength={30} />
        </label>
        <label>
          Calendar ID (optional)
          <input name="calendarId" defaultValue={staff?.calendarId ?? ""} maxLength={200} placeholder="Google calendar id or Cal.com event type id" />
        </label>
        <label>
          Sort order
          <input name="sortOrder" type="number" min={0} max={1000} defaultValue={staff?.sortOrder ?? nextSort} required />
        </label>
      </div>
      <div className="row">
        <label className="check">
          <input type="checkbox" name="acceptsBookings" defaultChecked={staff?.acceptsBookings ?? true} /> Takes bookings
        </label>
        <label className="check">
          <input type="checkbox" name="active" defaultChecked={staff?.active ?? true} /> Active
        </label>
      </div>
      <div>
        <button type="submit">{staff ? "Save details" : "Add staff member"}</button>
      </div>
    </form>
  );
}

export default async function StaffPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { business, t } = await requireTenant(SETTINGS_ROLES);
  const tz = business.timezone;
  const today = todayLocal(new Date(), tz);
  const [staff, services] = await Promise.all([
    t.staff.findMany({
      orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
      include: {
        services: true,
        schedules: true,
        timeOff: { where: { endAt: { gte: new Date() } }, orderBy: { startAt: "asc" } },
      },
    }),
    t.service.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  const nextSort = staff.reduce((m, s) => Math.max(m, s.sortOrder), -1) + 1;

  return (
    <>
      <h1>Staff</h1>
      <Flash searchParams={sp} />
      <p className="muted">
        Bookings are only given to staff who do the service and are working at that time. If no one is linked to a service, any bookable staff
        member can take it.
      </p>

      {staff.map((s) => {
        const followsBusiness = s.schedules.length === 0;
        return (
          <details key={s.id} className="card">
            <summary className="row spread">
              <span>
                <strong>{s.name}</strong> {s.title ? <small className="muted">{s.title}</small> : null}
              </span>
              <span className="row">
                {!s.active ? <span className="badge danger">inactive</span> : null}
                {s.active && !s.acceptsBookings ? <span className="badge warn">no bookings</span> : null}
                <small className="muted">
                  {s.services.length} service(s) - {followsBusiness ? "business hours" : "own schedule"}
                </small>
              </span>
            </summary>

            <h3>Details</h3>
            <StaffForm staff={s} nextSort={nextSort} />

            <h3>Services</h3>
            <form action={setStaffServicesAction} className="stack">
              <input type="hidden" name="staffId" value={s.id} />
              <div className="row">
                {services.map((svc) => (
                  <label key={svc.id} className="check">
                    <input type="checkbox" name="serviceId" value={svc.id} defaultChecked={s.services.some((l) => l.serviceId === svc.id)} /> {svc.name}
                  </label>
                ))}
              </div>
              <div>
                <button type="submit" className="secondary">
                  Save services
                </button>
              </div>
            </form>

            <h3>Weekly schedule</h3>
            <form action={setStaffScheduleAction}>
              <input type="hidden" name="staffId" value={s.id} />
              <label className="check">
                <input type="checkbox" name="followsBusiness" defaultChecked={followsBusiness} /> Works whenever the business is open (ignore the table
                below)
              </label>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Day</th>
                      <th>Off</th>
                      <th>Starts</th>
                      <th>Ends</th>
                      <th>Break (optional)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {WEEKDAY_NAMES.map((name, wd) => {
                      const r = s.schedules.find((x) => x.weekday === wd);
                      return (
                        <tr key={wd}>
                          <th scope="row">{name}</th>
                          <td>
                            <input type="checkbox" name={`off_${wd}`} defaultChecked={r ? r.isOff : wd === 0} aria-label={`${s.name} off on ${name}`} />
                          </td>
                          <td>
                            <input type="time" name={`start_${wd}`} defaultValue={r?.startTime ?? ""} aria-label={`${s.name} starts ${name}`} />
                          </td>
                          <td>
                            <input type="time" name={`end_${wd}`} defaultValue={r?.endTime ?? ""} aria-label={`${s.name} ends ${name}`} />
                          </td>
                          <td>
                            <div className="row">
                              <input type="time" name={`breakStart_${wd}`} defaultValue={r?.breakStart ?? ""} aria-label={`${s.name} break starts ${name}`} />
                              <span>to</span>
                              <input type="time" name={`breakEnd_${wd}`} defaultValue={r?.breakEnd ?? ""} aria-label={`${s.name} break ends ${name}`} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <button type="submit" className="secondary">
                Save schedule
              </button>
            </form>

            <h3>Time off</h3>
            {s.timeOff.length === 0 ? (
              <p className="muted">No upcoming time off.</p>
            ) : (
              <ul>
                {s.timeOff.map((o) => (
                  <li key={o.id} className="row">
                    <span>
                      {formatDateTimeShort(o.startAt, tz)} to {formatDateTimeShort(o.endAt, tz)}
                      {o.reason ? ` - ${o.reason}` : ""}
                    </span>
                    <form action={deleteTimeOffAction} className="inline">
                      <input type="hidden" name="id" value={o.id} />
                      <button className="small danger">Remove</button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            <form action={addTimeOffAction} className="stack">
              <input type="hidden" name="staffId" value={s.id} />
              <div className="row">
                <label>
                  From
                  <input type="date" name="date" min={today} required />
                </label>
                <label>
                  To (optional)
                  <input type="date" name="endDate" min={today} />
                </label>
                <label className="check">
                  <input type="checkbox" name="allDay" defaultChecked /> All day
                </label>
              </div>
              <div className="row">
                <label>
                  Start time
                  <input type="time" name="startTime" />
                </label>
                <label>
                  End time
                  <input type="time" name="endTime" />
                </label>
                <label>
                  Reason (optional)
                  <input name="reason" maxLength={200} placeholder="Vacation" />
                </label>
              </div>
              <div>
                <button type="submit" className="secondary">
                  Add time off
                </button>
              </div>
            </form>
          </details>
        );
      })}

      <section className="card">
        <h2>Add a staff member</h2>
        <StaffForm nextSort={nextSort} />
      </section>
    </>
  );
}
