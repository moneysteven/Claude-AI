import type { Metadata } from "next";
import Link from "next/link";
import { listBusinessesWithUsage } from "@/lib/admin";
import { requireSuperAdmin } from "@/lib/auth/session";
import { isPeriod, periodOf, shiftPeriod } from "@/lib/billing";
import { formatJmd, formatUsd } from "@/lib/money";
import { carrierMinutes, overageCents, usageTotals } from "./rows";

export const metadata: Metadata = { title: "Usage & billing" };

function pctBadge(percent: number) {
  if (percent >= 100) return "danger";
  if (percent >= 80) return "warn";
  return "";
}

const STATUS_BADGE: Record<string, string> = { ACTIVE: "ok", ONBOARDING: "warn", DISABLED: "danger" };

function monthLabel(period: string) {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleString("en-JM", { month: "long", year: "numeric", timeZone: "UTC" });
}

export default async function UsagePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  await requireSuperAdmin();
  const period = isPeriod(sp.month) ? sp.month : periodOf();
  const rows = await listBusinessesWithUsage(period);
  const totals = usageTotals(rows);
  const anyCarrier = totals.carrierMinutes > 0;

  return (
    <>
      <h1>Usage & billing</h1>
      <p className="muted">
        What each business used in {monthLabel(period)} (Jamaica time) against its plan, and the bill estimate at your plan prices. Call
        minutes are rounded up per call. WhatsApp counts the messages the business sent.
      </p>
      <div className="row card">
        <Link className="button secondary" href={`/admin/usage?month=${shiftPeriod(period, -1)}`}>
          &larr; Previous month
        </Link>
        <form method="get" className="inline">
          <label>
            Month
            <input type="month" name="month" defaultValue={period} />
          </label>
          <button className="secondary">Show</button>
        </form>
        <Link className="button secondary" href={`/admin/usage?month=${shiftPeriod(period, 1)}`}>
          Next month &rarr;
        </Link>
        <a className="button" href={`/admin/usage/export?month=${period}`}>
          Download CSV
        </a>
      </div>

      <div className="grid">
        <div className="card">
          <div className="muted">Call minutes</div>
          <div className="stat">{totals.voiceMinutes}</div>
          <small>{totals.calls} calls</small>
        </div>
        <div className="card">
          <div className="muted">WhatsApp sent</div>
          <div className="stat">{totals.whatsappOutbound}</div>
          <small>{totals.whatsappInbound} received</small>
        </div>
        <div className="card">
          <div className="muted">Billable this month</div>
          <div className="stat">{formatJmd(totals.totalCents)}</div>
          <small>incl. {formatJmd(totals.overageCents)} overage</small>
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
                <th>Plan</th>
                <th>Calls</th>
                <th>Call minutes</th>
                {anyCarrier ? <th>Carrier minutes</th> : null}
                <th>WhatsApp sent</th>
                <th>WhatsApp received</th>
                <th>Web chat</th>
                <th>LLM tokens (in / cached / out)</th>
                <th>Retell cost</th>
                <th>Base</th>
                <th>Overage</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.business.id}>
                  <td>
                    <Link href={`/admin/businesses/${r.business.id}`}>{r.business.name}</Link>
                    <br />
                    <span className={`badge ${STATUS_BADGE[r.business.status]}`}>{r.business.status.toLowerCase()}</span>
                  </td>
                  <td>{r.bill.plan.name}</td>
                  <td>{r.usage.calls}</td>
                  <td>
                    {r.usage.voiceMinutes} / {r.bill.includedMinutes}
                    <br />
                    <span className={`badge ${pctBadge(r.bill.minutesPercent)}`}>{r.bill.minutesPercent}%</span>
                  </td>
                  {anyCarrier ? <td>{carrierMinutes(r) > 0 ? carrierMinutes(r) : "-"}</td> : null}
                  <td>
                    {r.usage.whatsappOutbound} / {r.bill.includedMessages}
                    <br />
                    <span className={`badge ${pctBadge(r.bill.messagesPercent)}`}>{r.bill.messagesPercent}%</span>
                  </td>
                  <td>{r.usage.whatsappInbound}</td>
                  <td>{r.usage.webChatMessages}</td>
                  <td>
                    {r.usage.llmInputTokens.toLocaleString("en-US")} / {r.usage.llmCacheReadTokens.toLocaleString("en-US")} /{" "}
                    {r.usage.llmOutputTokens.toLocaleString("en-US")}
                  </td>
                  <td>
                    {r.usage.calls > 0 ? formatUsd(r.usage.voiceCostUsdCents) : "-"}
                    {r.usage.callsWithoutCost > 0 ? <small className="muted"> ({r.usage.callsWithoutCost} pending)</small> : null}
                  </td>
                  <td>{formatJmd(r.bill.baseCents)}</td>
                  <td>{overageCents(r) > 0 ? formatJmd(overageCents(r)) : "-"}</td>
                  <td>
                    <strong>{formatJmd(r.bill.totalCents)}</strong>
                  </td>
                </tr>
              ))}
              <tr>
                <th>Total</th>
                <th />
                <th>{totals.calls}</th>
                <th>
                  {totals.voiceMinutes} / {totals.includedMinutes}
                </th>
                {anyCarrier ? <th>{totals.carrierMinutes}</th> : null}
                <th>
                  {totals.whatsappOutbound} / {totals.includedMessages}
                </th>
                <th>{totals.whatsappInbound}</th>
                <th>{totals.webChatMessages}</th>
                <th>
                  {totals.llmInputTokens.toLocaleString("en-US")} / {totals.llmCacheReadTokens.toLocaleString("en-US")} /{" "}
                  {totals.llmOutputTokens.toLocaleString("en-US")}
                </th>
                <th>{formatUsd(totals.voiceCostUsdCents)}</th>
                <th>{formatJmd(totals.baseCents)}</th>
                <th>{formatJmd(totals.overageCents)}</th>
                <th>{formatJmd(totals.totalCents)}</th>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {anyCarrier ? (
        <p className="muted">
          Carrier minutes are what Twilio/Telnyx reported for the business&apos;s 876 number. Compare them with the call minutes to reconcile your
          carrier bill against Retell.
        </p>
      ) : null}
      <p className="muted">
        Retell cost is what Retell reported for each call (voice, AI and its telephony charges; not your 876 number rental), in US$. &quot;Pending&quot;
        calls have ended but their cost hasn&apos;t arrived yet. Cached LLM tokens cost about a tenth of normal input tokens.
      </p>
      <p className="muted">
        Plan prices and included amounts are set on the <Link href="/admin/plans">Plans</Link> page. Disabled businesses are listed for the
        record but don&apos;t receive new usage.
      </p>
    </>
  );
}
