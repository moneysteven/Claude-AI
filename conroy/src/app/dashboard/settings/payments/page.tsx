import { PaymentKind, PaymentProvider, type PaymentLinkTemplate } from "@prisma/client";
import type { Metadata } from "next";
import { Flash } from "@/components/Flash";
import { requireTenant, SETTINGS_ROLES } from "@/lib/auth/session";
import { formatJmd } from "@/lib/money";
import { renderPaymentUrl } from "@/lib/payments/service";
import { centsToInput } from "../_lib";
import { deletePaymentTemplateAction, savePaymentTemplateAction } from "./actions";

export const metadata: Metadata = { title: "Payment links" };

const PROVIDER_LABEL: Record<PaymentProvider, string> = { FYGARO: "Fygaro", WIPAY: "WiPay" };
const KIND_LABEL: Record<PaymentKind, string> = { DEPOSIT: "Deposit", FULL: "Full payment", INVOICE: "Invoice" };

function exampleUrl(tpl: Pick<PaymentLinkTemplate, "urlTemplate" | "defaultAmountCents" | "label">): string {
  try {
    return renderPaymentUrl(tpl, {
      amountCents: tpl.defaultAmountCents ?? 500000,
      reference: "PAY-7K4PX",
      name: "Shanice Brown",
      description: tpl.label,
    });
  } catch (err) {
    return `Invalid link: ${(err as Error).message}`;
  }
}

function TemplateForm({ tpl }: { tpl?: PaymentLinkTemplate }) {
  return (
    <form action={savePaymentTemplateAction} className="stack">
      {tpl ? <input type="hidden" name="id" value={tpl.id} /> : null}
      <div className="row">
        <label>
          Provider
          <select name="provider" defaultValue={tpl?.provider ?? "FYGARO"}>
            {Object.values(PaymentProvider).map((p) => (
              <option key={p} value={p}>
                {PROVIDER_LABEL[p]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Used for
          <select name="kind" defaultValue={tpl?.kind ?? "DEPOSIT"}>
            {Object.values(PaymentKind).map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Label
          <input name="label" defaultValue={tpl?.label ?? ""} required maxLength={80} placeholder="Booking deposit (Fygaro)" />
        </label>
      </div>
      <label>
        Payment link with placeholders
        <input
          name="urlTemplate"
          type="text"
          defaultValue={tpl?.urlTemplate ?? ""}
          required
          maxLength={1000}
          placeholder="https://fygaro.com/en/pb/your-link/?amount={amount}&client_note={reference}"
        />
      </label>
      <div className="row">
        <label>
          Default amount J$ <small className="muted">(optional)</small>
          <input name="defaultAmount" inputMode="decimal" defaultValue={centsToInput(tpl?.defaultAmountCents)} maxLength={30} placeholder="5000" />
        </label>
        <label className="check">
          <input type="checkbox" name="active" defaultChecked={tpl?.active ?? true} /> Active
        </label>
      </div>
      <div>
        <button type="submit">{tpl ? "Save link" : "Add link"}</button>
      </div>
    </form>
  );
}

export default async function PaymentLinksPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { t } = await requireTenant(SETTINGS_ROLES);
  const templates = await t.paymentLinkTemplate.findMany({
    orderBy: [{ active: "desc" }, { kind: "asc" }, { provider: "asc" }],
    include: { _count: { select: { requests: true } } },
  });

  return (
    <>
      <h1>Payment links</h1>
      <Flash searchParams={sp} />
      <div className="card">
        <p>
          Conroy sends <strong>payment links only</strong>. Customers pay on Fygaro&apos;s or WiPay&apos;s own secure page, so card numbers never
          touch Conroy, WhatsApp or the phone line.
        </p>
        <p>
          Paste the payment link from your Fygaro or WiPay account and add placeholders where the amount and reference go. Conroy fills them in for
          each customer:
        </p>
        <ul>
          <li>
            <code>{"{amount}"}</code> amount in dollars, e.g. 5000.00
          </li>
          <li>
            <code>{"{amount_cents}"}</code> amount in cents, e.g. 500000
          </li>
          <li>
            <code>{"{reference}"}</code> payment reference, e.g. PAY-7K4PX (staff match payments with it)
          </li>
          <li>
            <code>{"{name}"}</code> customer name, <code>{"{currency}"}</code> JMD, <code>{"{description}"}</code> what it is for
          </li>
        </ul>
        <p className="muted">
          Check the exact parameter names your Fygaro/WiPay link accepts in their dashboard. Links must start with https://. Follow-ups go out by
          WhatsApp on day 3 and day 7 until you mark the payment as paid.
        </p>
      </div>

      {templates.length === 0 ? <p className="muted">No payment links yet.</p> : null}
      {templates.map((tpl) => (
        <details key={tpl.id} className="card">
          <summary className="row spread">
            <span>
              <strong>{tpl.label}</strong> <span className="badge">{PROVIDER_LABEL[tpl.provider]}</span>{" "}
              <span className="badge">{KIND_LABEL[tpl.kind]}</span>
              {tpl.defaultAmountCents ? <small className="muted"> default {formatJmd(tpl.defaultAmountCents)}</small> : null}
            </span>
            <span className="row">
              {!tpl.active ? <span className="badge danger">inactive</span> : null}
              <small className="muted">{tpl._count.requests} sent</small>
            </span>
          </summary>
          <p>
            <strong>Example:</strong>
          </p>
          <pre className="code">{exampleUrl(tpl)}</pre>
          <TemplateForm tpl={tpl} />
          <form action={deletePaymentTemplateAction} className="inline" style={{ marginTop: "0.75rem" }}>
            <input type="hidden" name="id" value={tpl.id} />
            <button className="small danger">{tpl._count.requests > 0 ? "Switch off" : "Delete"}</button>
          </form>
        </details>
      ))}

      <section className="card">
        <h2>Add a payment link</h2>
        <TemplateForm />
      </section>
    </>
  );
}
