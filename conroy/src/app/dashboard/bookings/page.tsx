import type { Metadata } from "next";
import { Flash } from "@/components/Flash";
import { requireTenant } from "@/lib/auth/session";
import { formatPhone } from "@/lib/phone";
import { addDays, formatDateLong, formatTime, isLocalDate, localDateOf, localToUtc, todayLocal } from "@/lib/time";
import { cancelBookingAction, createBookingAction, markBookingAction, rescheduleBookingAction } from "./actions";

export const metadata: Metadata = { title: "Bookings" };

const STATUS_BADGE: Record<string, string> = { CONFIRMED: "ok", CANCELLED: "danger", COMPLETED: "", NO_SHOW: "warn" };

export default async function BookingsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { business, t } = await requireTenant();
  const tz = business.timezone;
  const today = todayLocal(new Date(), tz);
  const from = sp.from && isLocalDate(sp.from) ? sp.from : today;
  const days = Math.min(Math.max(Number(sp.days ?? 14) || 14, 1), 62);
  const showCancelled = sp.cancelled === "1";

  const [bookings, services, staff] = await Promise.all([
    t.booking.findMany({
      where: {
        startAt: { gte: localToUtc(from, "00:00", tz), lt: localToUtc(addDays(from, days), "00:00", tz) },
        ...(showCancelled ? {} : { status: { not: "CANCELLED" } }),
      },
      include: { service: true, staff: true },
      orderBy: { startAt: "asc" },
      take: 500,
    }),
    t.service.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    t.staff.findMany({ where: { active: true, acceptsBookings: true }, orderBy: { sortOrder: "asc" } }),
  ]);

  const byDay = new Map<string, typeof bookings>();
  for (const b of bookings) {
    const d = localDateOf(b.startAt, tz);
    byDay.set(d, [...(byDay.get(d) ?? []), b]);
  }

  return (
    <>
      <h1>Bookings</h1>
      <Flash searchParams={sp} />
      <form className="inline card" method="get">
        <label>
          From
          <input type="date" name="from" defaultValue={from} />
        </label>
        <label>
          Days
          <input type="number" name="days" min={1} max={62} defaultValue={days} />
        </label>
        <label className="check">
          <input type="checkbox" name="cancelled" value="1" defaultChecked={showCancelled} /> Show cancelled
        </label>
        <button type="submit" className="secondary">
          Show
        </button>
      </form>

      {byDay.size === 0 ? <p className="muted">No bookings in this period.</p> : null}
      {[...byDay.entries()].map(([day, list]) => (
        <section key={day}>
          <h2>{formatDateLong(localToUtc(day, "12:00", tz), tz)}</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Customer</th>
                  <th>Service</th>
                  <th>Staff</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {list.map((b) => (
                  <tr key={b.id}>
                    <td>
                      {formatTime(b.startAt, tz)}
                      <br />
                      <small>{b.reference}</small>
                    </td>
                    <td>
                      {b.customerName}
                      <br />
                      <small>{formatPhone(b.customerPhone)}</small>
                      {b.notes ? (
                        <>
                          <br />
                          <small className="muted">{b.notes}</small>
                        </>
                      ) : null}
                    </td>
                    <td>
                      {b.service.name}
                      <br />
                      <small className="muted">via {b.channel.toLowerCase()}</small>
                    </td>
                    <td>{b.staff?.name ?? "-"}</td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[b.status]}`}>{b.status.toLowerCase().replace("_", " ")}</span>
                    </td>
                    <td>
                      {b.status === "CONFIRMED" ? (
                        <div style={{ display: "grid", gap: 6 }}>
                          <form action={rescheduleBookingAction} className="inline">
                            <input type="hidden" name="bookingId" value={b.id} />
                            <input type="date" name="date" defaultValue={localDateOf(b.startAt, tz)} aria-label="New date" required />
                            <input type="time" name="time" step={300} aria-label="New time" required />
                            <button className="small secondary">Move</button>
                          </form>
                          <div className="row">
                            <form action={markBookingAction} className="inline">
                              <input type="hidden" name="bookingId" value={b.id} />
                              <input type="hidden" name="status" value="COMPLETED" />
                              <button className="small secondary">Done</button>
                            </form>
                            <form action={markBookingAction} className="inline">
                              <input type="hidden" name="bookingId" value={b.id} />
                              <input type="hidden" name="status" value="NO_SHOW" />
                              <button className="small secondary">No-show</button>
                            </form>
                            <form action={cancelBookingAction} className="inline">
                              <input type="hidden" name="bookingId" value={b.id} />
                              <button className="small danger">Cancel</button>
                            </form>
                          </div>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <h2>New booking</h2>
      <form action={createBookingAction} className="stack card">
        <label>
          Service
          <select name="serviceId" required>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.durationMin} min)
              </option>
            ))}
          </select>
        </label>
        <label>
          Staff (optional)
          <select name="staffId" defaultValue="">
            <option value="">Any available</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <div className="row">
          <label>
            Date
            <input type="date" name="date" min={today} defaultValue={today} required />
          </label>
          <label>
            Time (Jamaica)
            <input type="time" name="time" step={300} required />
          </label>
        </div>
        <label>
          Customer name
          <input name="customerName" required maxLength={120} />
        </label>
        <label>
          WhatsApp / phone <small className="muted">(confirmation and reminders go here)</small>
          <input name="customerPhone" inputMode="tel" placeholder="876-555-1234" maxLength={30} />
        </label>
        <label>
          Notes
          <textarea name="notes" maxLength={1000} />
        </label>
        <button type="submit">Book</button>
      </form>
    </>
  );
}
