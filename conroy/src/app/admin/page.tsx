import type { Metadata } from "next";
import Link from "next/link";
import { Flash } from "@/components/Flash";
import { listBusinessesWithUsage } from "@/lib/admin";
import { periodOf } from "@/lib/billing";
import { formatJmd } from "@/lib/money";
import { recentDeletions } from "@/lib/offboarding";
import { formatDateTimeShort } from "@/lib/time";
import { switchBusinessAction } from "./actions";

export const metadata: Metadata = { title: "Businesses" };

const STATUS_BADGE: Record<string, string> = { ACTIVE: "ok", ONBOARDING: "warn", DISABLED: "danger" };

function pctBadge(pct: number) {
  return pct >= 100 ? "danger" : pct >= 80 ? "warn" : "";
}

export default async function AdminHome({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const period = periodOf();
  const [rows, deletions] = await Promise.all([listBusinessesWithUsage(period), recentDeletions()]);
  const active = rows.filter((r) => r.business.status === "ACTIVE");
  const totals = rows.reduce(
    (acc, r) => ({
      minutes: acc.minutes + r.usage.voiceMinutes,
      messages: acc.messages + r.usage.whatsappOutbound,
      base: acc.base + (r.business.status === "ACTIVE" ? r.bill.baseCents : 0),
      overage: acc.overage + (r.business.status === "ACTIVE" ? r.bill.voiceOverageCents + r.bill.messageOverageCents : 0),
    }),
    { minutes: 0, messages: 0, base: 0, overage: 0 },
  );

  return (
    <>
      <div className="row spread">
        <h1>Businesses</h1>
        <Link className="button" href="/admin/businesses/new">
          + Onboard a business
        </Link>
      </div>
      <Flash searchParams={sp} />
      <div className="grid">
        <div className="card">
          <div className="muted">Live businesses</div>
          <div className="stat">
            {active.length} <small className="muted">/ {rows.length}</small>
          </div>
        </div>
        <div className="card">
          <div className="muted">Call minutes ({period})</div>
          <div className="stat">{totals.minutes}</div>
        </div>
        <div className="card">
          <div className="muted">WhatsApp messages sent</div>
          <div className="stat">{totals.messages}</div>
        </div>
        <div className="card">
          <div className="muted">Monthly plans (live)</div>
          <div className="stat">{formatJmd(totals.base)}</div>
          <small className="muted">+ {formatJmd(totals.overage)} overage so far</small>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="muted">No businesses yet.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Business</th>
                <th>Status</th>
                <th>Plan</th>
                <th>Call minutes</th>
                <th>WhatsApp sent</th>
                <th>Owner last seen</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ business: b, owner, usage, bill }) => (
                <tr key={b.id}>
                  <td>
                    <Link href={`/admin/businesses/${b.id}`}>{b.name}</Link>
                    <br />
                    <small className="muted">
                      {[b.area, b.parish].filter(Boolean).join(", ") || b.slug} · {b.category.toLowerCase().replace("_", " ")}
                    </small>
                  </td>
                  <td>
                    <span className={`badge ${STATUS_BADGE[b.status]}`}>{b.status.toLowerCase()}</span>
                  </td>
                  <td>{bill.plan.name}</td>
                  <td>
                    {usage.voiceMinutes} / {bill.includedMinutes} <span className={`badge ${pctBadge(bill.minutesPercent)}`}>{bill.minutesPercent}%</span>
                  </td>
                  <td>
                    {usage.whatsappOutbound} / {bill.includedMessages} <span className={`badge ${pctBadge(bill.messagesPercent)}`}>{bill.messagesPercent}%</span>
                  </td>
                  <td>{owner?.lastLoginAt ? formatDateTimeShort(owner.lastLoginAt, b.timezone) : <span className="muted">never</span>}</td>
                  <td>
                    <form action={switchBusinessAction} className="inline">
                      <input type="hidden" name="businessId" value={b.id} />
                      <button className="small secondary">Open dashboard</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {deletions.length > 0 ? (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Deleted in the last 30 days: finish by hand</h2>
          {deletions.map((d) => (
            <div key={`${d.slug}-${d.at.toISOString()}`}>
              <h3>
                {d.name} <small className="muted">deleted {formatDateTimeShort(d.at)}</small>
              </h3>
              <ul>
                {d.manualSteps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ) : null}
    </>
  );
}
