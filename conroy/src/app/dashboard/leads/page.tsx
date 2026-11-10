import type { Metadata } from "next";
import { Flash } from "@/components/Flash";
import { requireTenant } from "@/lib/auth/session";
import { formatPhone } from "@/lib/phone";
import { formatDateTimeShort } from "@/lib/time";
import { updateLeadAction } from "./actions";

export const metadata: Metadata = { title: "Leads" };

const URGENCY_BADGE: Record<string, string> = { LOW: "", NORMAL: "", HIGH: "warn", URGENT: "danger" };

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { business, t } = await requireTenant();
  const status = ["NEW", "CONTACTED", "WON", "LOST"].includes(sp.status ?? "") ? (sp.status as "NEW") : undefined;
  const leads = await t.lead.findMany({
    where: status ? { status } : {},
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 300,
  });
  return (
    <>
      <h1>Leads & messages</h1>
      <Flash searchParams={sp} />
      <p className="muted">People {business.assistantName} took a message for or who asked about something it couldn&apos;t book.</p>
      <form className="inline card" method="get">
        <label>
          Status
          <select name="status" defaultValue={status ?? ""}>
            <option value="">All</option>
            <option value="NEW">New</option>
            <option value="CONTACTED">Contacted</option>
            <option value="WON">Won</option>
            <option value="LOST">Lost</option>
          </select>
        </label>
        <button className="secondary">Filter</button>
      </form>
      {leads.length === 0 ? (
        <p className="muted">No leads yet.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>Wants</th>
                <th>Urgency</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id}>
                  <td>
                    {formatDateTimeShort(l.createdAt, business.timezone)}
                    <br />
                    <small className="muted">via {l.channel.toLowerCase()}</small>
                  </td>
                  <td>
                    {l.name ?? "-"}
                    <br />
                    <small>{l.phone ? <a href={`tel:${l.phone}`}>{formatPhone(l.phone)}</a> : "no number"}</small>
                  </td>
                  <td>
                    {l.request}
                    {l.preferredTime ? (
                      <>
                        <br />
                        <small className="muted">Preferred: {l.preferredTime}</small>
                      </>
                    ) : null}
                  </td>
                  <td>
                    <span className={`badge ${URGENCY_BADGE[l.urgency]}`}>{l.urgency.toLowerCase()}</span>
                  </td>
                  <td>
                    <form action={updateLeadAction} className="inline">
                      <input type="hidden" name="leadId" value={l.id} />
                      <select name="status" defaultValue={l.status} aria-label="Lead status">
                        <option value="NEW">New</option>
                        <option value="CONTACTED">Contacted</option>
                        <option value="WON">Won</option>
                        <option value="LOST">Lost</option>
                      </select>
                      <input name="notes" defaultValue={l.notes ?? ""} placeholder="Notes" aria-label="Notes" maxLength={1000} />
                      <button className="small secondary">Save</button>
                    </form>
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
