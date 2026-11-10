import type { Faq, Policy } from "@prisma/client";
import type { Metadata } from "next";
import { Flash } from "@/components/Flash";
import { requireTenant, SETTINGS_ROLES } from "@/lib/auth/session";
import { POLICY_KINDS } from "../_lib";
import { deleteFaqAction, deletePolicyAction, saveFaqAction, savePolicyAction } from "./actions";

export const metadata: Metadata = { title: "FAQs & policies" };

const KIND_LABEL: Record<(typeof POLICY_KINDS)[number], string> = {
  CANCELLATION: "Cancellation",
  DEPOSIT: "Deposit",
  LATENESS: "Lateness",
  PAYMENT: "Payment",
  CHILDREN: "Children",
  OTHER: "Other",
};

function FaqForm({ faq, nextSort }: { faq?: Faq; nextSort: number }) {
  return (
    <form action={saveFaqAction} className="stack">
      {faq ? <input type="hidden" name="id" value={faq.id} /> : null}
      <label>
        Question
        <input name="question" defaultValue={faq?.question ?? ""} required maxLength={300} placeholder="Is there parking?" />
      </label>
      <label>
        Answer
        <textarea name="answer" defaultValue={faq?.answer ?? ""} required maxLength={2000} />
      </label>
      <div className="row">
        <label>
          Keywords <small className="muted">(comma-separated, include Patois words people use)</small>
          <input name="keywords" defaultValue={faq?.keywords.join(", ") ?? ""} maxLength={500} placeholder="parking, park, car" />
        </label>
        <label>
          Sort order
          <input name="sortOrder" type="number" min={0} max={1000} defaultValue={faq?.sortOrder ?? nextSort} required />
        </label>
        <label className="check">
          <input type="checkbox" name="active" defaultChecked={faq?.active ?? true} /> Active
        </label>
      </div>
      <div>
        <button type="submit">{faq ? "Save FAQ" : "Add FAQ"}</button>
      </div>
    </form>
  );
}

function PolicyForm({ policy, nextSort }: { policy?: Policy; nextSort: number }) {
  return (
    <form action={savePolicyAction} className="stack">
      {policy ? <input type="hidden" name="id" value={policy.id} /> : null}
      <div className="row">
        <label>
          Type
          <select name="kind" defaultValue={policy?.kind ?? "OTHER"}>
            {POLICY_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Title
          <input name="title" defaultValue={policy?.title ?? ""} required maxLength={120} placeholder="Cancellations" />
        </label>
        <label>
          Sort order
          <input name="sortOrder" type="number" min={0} max={1000} defaultValue={policy?.sortOrder ?? nextSort} required />
        </label>
      </div>
      <label>
        Policy text
        <textarea name="body" defaultValue={policy?.body ?? ""} required maxLength={2000} />
      </label>
      <div>
        <button type="submit">{policy ? "Save policy" : "Add policy"}</button>
      </div>
    </form>
  );
}

export default async function FaqsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { t } = await requireTenant(SETTINGS_ROLES);
  const [faqs, policies] = await Promise.all([
    t.faq.findMany({ orderBy: [{ sortOrder: "asc" }, { question: "asc" }] }),
    t.policy.findMany({ orderBy: [{ sortOrder: "asc" }, { title: "asc" }] }),
  ]);
  const nextFaq = faqs.reduce((m, f) => Math.max(m, f.sortOrder), -1) + 1;
  const nextPolicy = policies.reduce((m, p) => Math.max(m, p.sortOrder), -1) + 1;

  return (
    <>
      <h1>FAQs & policies</h1>
      <Flash searchParams={sp} />
      <p className="muted">
        The assistant answers only from these (plus your hours, services and prices). If a question isn&apos;t covered it says it isn&apos;t sure and
        takes a message, so add the questions customers really ask.
      </p>

      <h2>Frequently asked questions</h2>
      {faqs.length === 0 ? <p className="muted">No FAQs yet.</p> : null}
      {faqs.map((f) => (
        <details key={f.id} className="card">
          <summary className="row spread">
            <strong>{f.question}</strong>
            {!f.active ? <span className="badge danger">hidden</span> : null}
          </summary>
          <FaqForm faq={f} nextSort={nextFaq} />
          <form action={deleteFaqAction} className="inline" style={{ marginTop: "0.75rem" }}>
            <input type="hidden" name="id" value={f.id} />
            <button className="small danger">Delete</button>
          </form>
        </details>
      ))}
      <section className="card">
        <h3>Add an FAQ</h3>
        <FaqForm nextSort={nextFaq} />
      </section>

      <h2>Policies</h2>
      {policies.length === 0 ? <p className="muted">No policies yet.</p> : null}
      {policies.map((p) => (
        <details key={p.id} className="card">
          <summary className="row spread">
            <span>
              <strong>{p.title}</strong> <span className="badge">{KIND_LABEL[p.kind as (typeof POLICY_KINDS)[number]] ?? p.kind}</span>
            </span>
          </summary>
          <PolicyForm policy={p} nextSort={nextPolicy} />
          <form action={deletePolicyAction} className="inline" style={{ marginTop: "0.75rem" }}>
            <input type="hidden" name="id" value={p.id} />
            <button className="small danger">Delete</button>
          </form>
        </details>
      ))}
      <section className="card">
        <h3>Add a policy</h3>
        <PolicyForm nextSort={nextPolicy} />
      </section>
    </>
  );
}
