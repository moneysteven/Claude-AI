import type { Metadata } from "next";
import Link from "next/link";
import { requireTenant } from "@/lib/auth/session";
import { formatPhone } from "@/lib/phone";
import { formatDateTimeShort } from "@/lib/time";

export const metadata: Metadata = { title: "Calls" };

function outcomeLabel(outcome: string | null): string {
  return outcome ? outcome.toLowerCase().replace(/_/g, " ") : "in progress";
}

export default async function CallsPage() {
  const { business, t } = await requireTenant();
  const calls = await t.callLog.findMany({ include: { contact: true }, orderBy: { createdAt: "desc" }, take: 200 });
  return (
    <>
      <h1>Calls</h1>
      <p className="muted">
        Every call {business.assistantName} answered. Transcripts and recordings are deleted automatically after {business.retentionDays} days.
      </p>
      {calls.length === 0 ? (
        <p className="muted">No calls yet. Once the phone number is connected, calls appear here.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Caller</th>
                <th>Reason</th>
                <th>Outcome</th>
                <th>Length</th>
              </tr>
            </thead>
            <tbody>
              {calls.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/dashboard/calls/${c.id}`}>{c.startedAt ? formatDateTimeShort(c.startedAt, business.timezone) : "-"}</Link>
                    {c.afterHours ? <span className="badge warn" style={{ marginLeft: 6 }}>after hours</span> : null}
                  </td>
                  <td>
                    {c.contact?.name ? (
                      <>
                        {c.contact.name}
                        <br />
                      </>
                    ) : null}
                    <small>{c.fromNumber ? formatPhone(c.fromNumber) : "hidden number"}</small>
                  </td>
                  <td>{c.reason ?? "-"}</td>
                  <td>
                    <span className={`badge ${c.outcome === "BOOKED" ? "ok" : c.outcome === "ABANDONED" ? "warn" : ""}`}>{outcomeLabel(c.outcome)}</span>
                    {c.transferred ? <span className="badge" style={{ marginLeft: 6 }}>transferred</span> : null}
                  </td>
                  <td>
                    {Math.floor(c.durationSec / 60)}:{String(c.durationSec % 60).padStart(2, "0")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
