import Link from "next/link";
import { Flash } from "@/components/Flash";
import { requireTenant } from "@/lib/auth/session";
import { loadCalendarRules } from "@/lib/business";
import { describeOpenNow } from "@/lib/hours";
import { formatPhone } from "@/lib/phone";
import { addDays, formatDateTimeShort, formatTime, localToUtc, todayLocal } from "@/lib/time";

export default async function Overview({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { business, t } = await requireTenant();
  const tz = business.timezone;
  const today = todayLocal(new Date(), tz);
  const dayStart = localToUtc(today, "00:00", tz);
  const dayEnd = localToUtc(addDays(today, 1), "00:00", tz);
  const monthStart = localToUtc(`${today.slice(0, 7)}-01`, "00:00", tz);

  const [rules, todays, waiting, recentCalls, newLeads, callsThisMonth, bookingsThisMonth] = await Promise.all([
    loadCalendarRules(business.id),
    t.booking.findMany({
      where: { status: "CONFIRMED", startAt: { gte: dayStart, lt: dayEnd } },
      include: { service: true, staff: true },
      orderBy: { startAt: "asc" },
    }),
    t.conversation.findMany({ where: { status: "HUMAN" }, orderBy: { lastMessageAt: "desc" }, take: 5 }),
    t.callLog.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
    t.lead.count({ where: { status: "NEW" } }),
    t.callLog.count({ where: { createdAt: { gte: monthStart } } }),
    t.booking.count({ where: { createdAt: { gte: monthStart }, channel: { not: "DASHBOARD" } } }),
  ]);

  return (
    <>
      <h1>Overview</h1>
      <Flash searchParams={sp} />
      <p className="muted">{describeOpenNow(rules, new Date())}</p>
      <div className="grid">
        <div className="card">
          <div className="muted">Today&apos;s appointments</div>
          <div className="stat">{todays.length}</div>
        </div>
        <div className="card">
          <div className="muted">Waiting for a person</div>
          <div className="stat">{waiting.length}</div>
        </div>
        <div className="card">
          <div className="muted">New leads</div>
          <div className="stat">{newLeads}</div>
        </div>
        <div className="card">
          <div className="muted">Calls this month</div>
          <div className="stat">{callsThisMonth}</div>
        </div>
        <div className="card">
          <div className="muted">Bookings by {business.assistantName} this month</div>
          <div className="stat">{bookingsThisMonth}</div>
        </div>
      </div>

      <h2>Today</h2>
      {todays.length === 0 ? (
        <p className="muted">No appointments today.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Customer</th>
                <th>Service</th>
                <th>Staff</th>
                <th>Ref</th>
              </tr>
            </thead>
            <tbody>
              {todays.map((b) => (
                <tr key={b.id}>
                  <td>{formatTime(b.startAt, tz)}</td>
                  <td>
                    {b.customerName}
                    <br />
                    <small>{formatPhone(b.customerPhone)}</small>
                  </td>
                  <td>{b.service.name}</td>
                  <td>{b.staff?.name ?? "-"}</td>
                  <td>{b.reference}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {waiting.length > 0 ? (
        <>
          <h2>Customers waiting for a person</h2>
          <ul>
            {waiting.map((c) => (
              <li key={c.id}>
                <Link href={`/dashboard/inbox/${c.id}`}>
                  {c.channel === "WHATSAPP" ? formatPhone(c.externalId) : "Website visitor"}
                </Link>{" "}
                <small className="muted">{c.handoffReason}</small>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <h2>Recent calls</h2>
      {recentCalls.length === 0 ? (
        <p className="muted">No calls yet.</p>
      ) : (
        <ul>
          {recentCalls.map((c) => (
            <li key={c.id}>
              <Link href={`/dashboard/calls/${c.id}`}>{c.startedAt ? formatDateTimeShort(c.startedAt, tz) : "Unknown time"}</Link>{" "}
              {c.fromNumber ? formatPhone(c.fromNumber) : "hidden number"} - {c.reason ?? c.outcome?.toLowerCase().replace(/_/g, " ") ?? "in progress"}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
