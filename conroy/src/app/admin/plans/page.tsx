import type { Metadata } from "next";
import { Flash } from "@/components/Flash";
import { requireSuperAdmin } from "@/lib/auth/session";
import { getPlans } from "@/lib/billing";
import { db } from "@/lib/db";
import { formatJmd } from "@/lib/money";
import { updatePlanAction } from "./actions";

export const metadata: Metadata = { title: "Plans" };

const ORDER = ["LITE", "STARTER", "GROWTH"] as const;

/** Plain number for an input field ("15000", "35.50"). */
function amountInput(cents: number): string {
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

export default async function PlansPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  await requireSuperAdmin();
  const [plans, counts] = await Promise.all([
    getPlans(),
    db.business.groupBy({ by: ["plan"], where: { status: { not: "DISABLED" } }, _count: { _all: true } }),
  ]);
  const businessesOn = (code: string) => counts.find((c) => c.plan === code)?._count._all ?? 0;

  return (
    <>
      <h1>Plans</h1>
      <Flash searchParams={sp} />
      <p className="muted">
        These are your prices to tune as you learn real costs per business. They drive the usage page, the monthly bill estimate and the
        80% / 100% usage alerts. Nothing is charged automatically: you invoice clients yourself.
      </p>

      <div className="grid">
        {ORDER.map((code) => {
          const p = plans[code];
          return (
            <div key={code} className="card">
              <div className="muted">{p.name}</div>
              <div className="stat">{formatJmd(p.monthlyPriceCents)}</div>
              <small>
                {p.includedVoiceMinutes} call minutes, {p.includedWhatsAppMessages} WhatsApp messages per month
                <br />
                {businessesOn(code)} active business{businessesOn(code) === 1 ? "" : "es"}
              </small>
            </div>
          );
        })}
      </div>

      {ORDER.map((code) => {
        const p = plans[code];
        return (
          <section key={code}>
            <h2>
              {p.name} <span className="badge">{code}</span>
            </h2>
            <form action={updatePlanAction} className="stack card">
              <input type="hidden" name="code" value={code} />
              <div className="row">
                <label>
                  Name
                  <input name="name" defaultValue={p.name} required maxLength={40} />
                </label>
                <label>
                  Monthly price (J$)
                  <input name="monthlyPrice" defaultValue={amountInput(p.monthlyPriceCents)} required inputMode="decimal" maxLength={20} />
                </label>
              </div>
              <label>
                Description
                <input name="description" defaultValue={p.description ?? ""} maxLength={200} />
              </label>
              <div className="row">
                <label>
                  Included call minutes / month
                  <input name="includedVoiceMinutes" type="number" min={0} defaultValue={p.includedVoiceMinutes} required />
                </label>
                <label>
                  Extra minutes (J$ per minute)
                  <input name="voiceOveragePerMinute" defaultValue={amountInput(p.voiceOveragePerMinuteCents)} required inputMode="decimal" maxLength={20} />
                </label>
              </div>
              <div className="row">
                <label>
                  Included WhatsApp messages / month
                  <input name="includedWhatsAppMessages" type="number" min={0} defaultValue={p.includedWhatsAppMessages} required />
                </label>
                <label>
                  Extra messages (J$ per message)
                  <input name="whatsappOveragePerMsg" defaultValue={amountInput(p.whatsappOveragePerMsgCents)} required inputMode="decimal" maxLength={20} />
                </label>
              </div>
              <small className="muted">
                Call minutes are counted per call, rounded up to the next minute. WhatsApp messages are the ones sent by the business (replies,
                confirmations, reminders, payment links); incoming messages are not counted.
              </small>
              <button type="submit">Save {p.name}</button>
            </form>
          </section>
        );
      })}
    </>
  );
}
