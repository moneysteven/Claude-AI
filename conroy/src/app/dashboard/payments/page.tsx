import type { Metadata } from "next";
import Link from "next/link";
import { Flash } from "@/components/Flash";
import { requireTenant } from "@/lib/auth/session";
import { formatJmd } from "@/lib/money";
import { FOLLOW_UP_DAYS } from "@/lib/payments/service";
import { formatPhone } from "@/lib/phone";
import { formatDateTimeShort } from "@/lib/time";
import { cancelPaymentAction, createPaymentAction, markPaidAction, resendPaymentAction } from "./actions";

export const metadata: Metadata = { title: "Payments" };

const BADGE: Record<string, string> = { PENDING: "warn", PAID: "ok", CANCELLED: "" };

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { business, t } = await requireTenant();
  const [templates, requests] = await Promise.all([
    t.paymentLinkTemplate.findMany({ where: { active: true }, orderBy: [{ kind: "asc" }, { provider: "asc" }] }),
    t.paymentRequest.findMany({ include: { template: true }, orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 200 }),
  ]);
  return (
    <>
      <h1>Payments</h1>
      <Flash searchParams={sp} />
      <p className="muted">
        Payment links (Fygaro / WiPay) go by WhatsApp. Card details never touch {business.assistantName}. Unpaid links get polite follow-ups on
        day {FOLLOW_UP_DAYS.slice(1).join(" and day ")}; marking a request as paid stops them.
      </p>

      {templates.length === 0 ? (
        <p className="flash error">
          No payment links set up yet. Add your Fygaro/WiPay links in <Link href="/dashboard/settings/payments">Settings &rarr; Payment links</Link>.
        </p>
      ) : (
        <form action={createPaymentAction} className="stack card">
          <h2 style={{ marginTop: 0 }}>Send a payment link</h2>
          <label>
            Link
            <select name="templateId" required>
              {templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.label} ({tpl.provider === "FYGARO" ? "Fygaro" : "WiPay"}, {tpl.kind.toLowerCase()})
                </option>
              ))}
            </select>
          </label>
          <div className="row">
            <label>
              Customer name
              <input name="customerName" maxLength={120} />
            </label>
            <label>
              WhatsApp number
              <input name="customerPhone" required inputMode="tel" placeholder="876-555-1234" maxLength={30} />
            </label>
          </div>
          <div className="row">
            <label>
              Amount (J$)
              <input name="amount" required inputMode="decimal" placeholder="5000" maxLength={20} />
            </label>
            <label>
              Booking ref (optional)
              <input name="bookingReference" maxLength={20} placeholder="TB-7K4P" />
            </label>
          </div>
          <label>
            What it&apos;s for
            <input name="description" maxLength={200} placeholder="Box braids deposit" />
          </label>
          <button type="submit">Send by WhatsApp</button>
        </form>
      )}

      <h2>Payment requests</h2>
      {requests.length === 0 ? (
        <p className="muted">None yet.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Ref</th>
                <th>Customer</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Messages sent</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.reference}
                    <br />
                    <small className="muted">{formatDateTimeShort(r.createdAt, business.timezone)}</small>
                  </td>
                  <td>
                    {r.customerName ?? "-"}
                    <br />
                    <small>{formatPhone(r.customerPhone)}</small>
                  </td>
                  <td>
                    {formatJmd(r.amountCents)}
                    <br />
                    <small className="muted">{r.description}</small>
                  </td>
                  <td>
                    <span className={`badge ${BADGE[r.status]}`}>{r.status.toLowerCase()}</span>
                    {r.paidAt ? (
                      <>
                        <br />
                        <small className="muted">{formatDateTimeShort(r.paidAt, business.timezone)}</small>
                      </>
                    ) : null}
                  </td>
                  <td>
                    {r.followUpsSent} / {FOLLOW_UP_DAYS.length}
                  </td>
                  <td>
                    {r.status === "PENDING" ? (
                      <div className="row">
                        <form action={markPaidAction} className="inline">
                          <input type="hidden" name="paymentRequestId" value={r.id} />
                          <button className="small">Mark paid</button>
                        </form>
                        <form action={resendPaymentAction} className="inline">
                          <input type="hidden" name="paymentRequestId" value={r.id} />
                          <button className="small secondary">Remind now</button>
                        </form>
                        <form action={cancelPaymentAction} className="inline">
                          <input type="hidden" name="paymentRequestId" value={r.id} />
                          <button className="small danger">Cancel</button>
                        </form>
                      </div>
                    ) : null}
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
