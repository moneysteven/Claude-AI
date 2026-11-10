import type { Channel } from "@prisma/client";
import { DateTime } from "luxon";
import type { Metadata } from "next";
import Link from "next/link";
import { requireTenant } from "@/lib/auth/session";
import { formatJmd } from "@/lib/money";
import { localToUtc, todayLocal } from "@/lib/time";

export const metadata: Metadata = { title: "Monthly report" };

const CHANNELS: Channel[] = ["VOICE", "WHATSAPP", "WEB", "DASHBOARD"];
const CHANNEL_LABEL: Record<Channel, string> = { VOICE: "Phone", WHATSAPP: "WhatsApp", WEB: "Website", DASHBOARD: "Staff (dashboard)" };

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="card">
      <div className="muted">{label}</div>
      <div className="stat">{value}</div>
      {hint ? <small className="muted">{hint}</small> : null}
    </div>
  );
}

export default async function ReportPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { business, t } = await requireTenant();
  const tz = business.timezone;
  const currentMonth = todayLocal(new Date(), tz).slice(0, 7);
  const month = sp.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month) ? sp.month : currentMonth;
  const first = DateTime.fromISO(`${month}-01`);
  const prevMonth = first.minus({ months: 1 }).toFormat("yyyy-MM");
  const nextMonth = first.plus({ months: 1 }).toFormat("yyyy-MM");
  const from = localToUtc(`${month}-01`, "00:00", tz);
  const to = localToUtc(`${nextMonth}-01`, "00:00", tz);
  const inMonth = { gte: from, lt: to };

  const [calls, bookingsByChannel, cancelled, leadsByChannel, waIn, waOut, webIn, webOut, paymentsCreated, paymentsPaid, paidTotal] = await Promise.all([
    t.callLog.findMany({ where: { createdAt: inMonth }, select: { durationSec: true, afterHours: true, outcome: true, transferred: true } }),
    t.booking.groupBy({ by: ["channel"], where: { createdAt: inMonth }, _count: { _all: true } }),
    t.booking.count({ where: { status: "CANCELLED", cancelledAt: inMonth } }),
    t.lead.groupBy({ by: ["channel"], where: { createdAt: inMonth }, _count: { _all: true } }),
    t.message.count({ where: { createdAt: inMonth, direction: "INBOUND", conversation: { channel: "WHATSAPP" } } }),
    t.message.count({ where: { createdAt: inMonth, direction: "OUTBOUND", status: { in: ["SENT", "DELIVERED", "READ"] }, conversation: { channel: "WHATSAPP" } } }),
    t.message.count({ where: { createdAt: inMonth, direction: "INBOUND", conversation: { channel: "WEB" } } }),
    t.message.count({ where: { createdAt: inMonth, direction: "OUTBOUND", conversation: { channel: "WEB" } } }),
    t.paymentRequest.count({ where: { createdAt: inMonth } }),
    t.paymentRequest.count({ where: { status: "PAID", paidAt: inMonth } }),
    t.paymentRequest.aggregate({ where: { status: "PAID", paidAt: inMonth }, _sum: { amountCents: true } }),
  ]);

  const callsAnswered = calls.length;
  const afterHours = calls.filter((c) => c.afterHours).length;
  const transferred = calls.filter((c) => c.transferred || c.outcome === "TRANSFERRED").length;
  // Billed like carriers: every started minute counts.
  const minutesUsed = calls.reduce((sum, c) => sum + Math.ceil(c.durationSec / 60), 0);
  const bookingCount = (ch: Channel) => bookingsByChannel.find((b) => b.channel === ch)?._count._all ?? 0;
  const leadCount = (ch: Channel) => leadsByChannel.find((l) => l.channel === ch)?._count._all ?? 0;
  const bookingsTotal = CHANNELS.reduce((s, ch) => s + bookingCount(ch), 0);
  const bookingsByAssistant = bookingCount("VOICE") + bookingCount("WHATSAPP") + bookingCount("WEB");
  const leadsTotal = CHANNELS.reduce((s, ch) => s + leadCount(ch), 0);
  const isCurrent = month === currentMonth;

  return (
    <>
      <h1>Monthly report</h1>
      <div className="row spread card">
        <div className="row">
          <Link href={`/dashboard/report?month=${prevMonth}`} className="button secondary">
            &larr; {first.minus({ months: 1 }).toFormat("LLL yyyy")}
          </Link>
          <strong>{first.toFormat("LLLL yyyy")}</strong>
          {month < currentMonth ? (
            <Link href={`/dashboard/report?month=${nextMonth}`} className="button secondary">
              {first.plus({ months: 1 }).toFormat("LLL yyyy")} &rarr;
            </Link>
          ) : null}
        </div>
        <form method="get" className="inline">
          <label>
            <span className="visually-hidden">Month</span>
            <input type="month" name="month" defaultValue={month} max={currentMonth} />
          </label>
          <button type="submit" className="secondary">
            Show
          </button>
        </form>
      </div>
      {isCurrent ? <p className="muted">Month to date (Jamaica time).</p> : null}

      <h2>Calls</h2>
      <div className="grid">
        <Stat label="Calls answered" value={callsAnswered} />
        <Stat label="After-hours calls" value={afterHours} hint="Calls that would have been missed" />
        <Stat label="Minutes used" value={minutesUsed} hint="Each call rounded up to the minute" />
        <Stat label="Transferred to staff" value={transferred} />
      </div>

      <h2>Bookings & leads</h2>
      <div className="grid">
        <Stat label={`Bookings made by ${business.assistantName}`} value={bookingsByAssistant} hint={`${bookingsTotal} including staff bookings`} />
        <Stat label="Bookings cancelled" value={cancelled} />
        <Stat label="Leads captured" value={leadsTotal} />
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Channel</th>
              <th>Bookings</th>
              <th>Leads</th>
            </tr>
          </thead>
          <tbody>
            {CHANNELS.map((ch) => (
              <tr key={ch}>
                <td>{CHANNEL_LABEL[ch]}</td>
                <td>{bookingCount(ch)}</td>
                <td>{leadCount(ch)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Messages</h2>
      <div className="grid">
        <Stat label="WhatsApp messages received" value={waIn} />
        <Stat label="WhatsApp messages sent" value={waOut} hint="Replies, confirmations, reminders, payment links" />
        <Stat label="Website chat messages" value={webIn + webOut} hint={`${webIn} from visitors, ${webOut} replies`} />
      </div>

      <h2>Payments</h2>
      <div className="grid">
        <Stat label="Payment links sent" value={paymentsCreated} />
        <Stat label="Marked paid" value={paymentsPaid} />
        <Stat label="Total paid" value={formatJmd(paidTotal._sum.amountCents ?? 0)} />
      </div>
    </>
  );
}
