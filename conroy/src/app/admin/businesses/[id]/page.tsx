import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Flash } from "@/components/Flash";
import { billForBusiness, periodOf } from "@/lib/billing";
import { connectionSummary } from "@/lib/connections";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { formatJmd } from "@/lib/money";
import { formatPhone } from "@/lib/phone";
import { retellConfigured } from "@/lib/retell/provision";
import { formatDateTimeShort } from "@/lib/time";
import { switchBusinessAction } from "../../actions";
import {
  importNumberAction,
  saveCalendarAction,
  saveNotesAction,
  saveWhatsAppAction,
  setPlanAction,
  setStatusAction,
  syncVoiceAction,
  testCalendarAction,
  testWhatsAppAction,
} from "./actions";

export const metadata: Metadata = { title: "Business" };

const STATUS_BADGE: Record<string, string> = { ACTIVE: "ok", ONBOARDING: "warn", DISABLED: "danger" };

export default async function AdminBusinessPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const business = await db.business.findUnique({ where: { id } });
  if (!business) notFound();
  const period = periodOf(new Date(), business.timezone);
  const [{ usage, bill }, users, audit, counts] = await Promise.all([
    billForBusiness(business, period),
    db.user.findMany({ where: { businessId: id }, orderBy: [{ role: "asc" }, { name: "asc" }] }),
    db.auditLog.findMany({ where: { businessId: id }, orderBy: { createdAt: "desc" }, take: 15 }),
    Promise.all([
      db.service.count({ where: { businessId: id, active: true } }),
      db.staff.count({ where: { businessId: id, active: true } }),
      db.faq.count({ where: { businessId: id, active: true } }),
      db.booking.count({ where: { businessId: id } }),
    ]),
  ]);
  const conn = connectionSummary(business);
  const tz = business.timezone;
  const hidden = <input type="hidden" name="businessId" value={business.id} />;

  return (
    <>
      <p>
        <Link href="/admin">&larr; Businesses</Link>
      </p>
      <div className="row spread">
        <h1 style={{ marginBottom: 0 }}>
          {business.name} <span className={`badge ${STATUS_BADGE[business.status]}`}>{business.status.toLowerCase()}</span>
        </h1>
        <div className="row">
          <form action={switchBusinessAction} className="inline">
            {hidden}
            <button className="small">Open dashboard</button>
          </form>
          <form action={switchBusinessAction} className="inline">
            {hidden}
            <input type="hidden" name="to" value="settings" />
            <button className="small secondary">Edit business settings</button>
          </form>
          <a className="button secondary small" href={`/demo/${business.slug}`} target="_blank" rel="noreferrer">
            Demo page
          </a>
        </div>
      </div>
      <p className="muted">
        /{business.slug} · {business.category.toLowerCase().replace("_", " ")} · {[business.area, business.parish].filter(Boolean).join(", ")} ·{" "}
        {counts[0]} services, {counts[1]} staff, {counts[2]} FAQs, {counts[3]} bookings · created {formatDateTimeShort(business.createdAt, tz)}
        {business.goLiveAt ? ` · live since ${formatDateTimeShort(business.goLiveAt, tz)}` : ""}
      </p>
      <Flash searchParams={sp} />

      <div className="grid">
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Status</h2>
          <form action={setStatusAction} className="inline">
            {hidden}
            <select name="status" defaultValue={business.status} aria-label="Status">
              <option value="ONBOARDING">Onboarding (set up, not live)</option>
              <option value="ACTIVE">Active (live)</option>
              <option value="DISABLED">Disabled (paused)</option>
            </select>
            <button className="small">Save</button>
          </form>
          <p className="muted">Disabled: calls get a short &quot;not available&quot; message, WhatsApp and the widget stop, reminders stop, and business users can&apos;t sign in. Data is kept.</p>
        </section>
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Plan</h2>
          <form action={setPlanAction} className="inline">
            {hidden}
            <select name="plan" defaultValue={business.plan} aria-label="Plan">
              <option value="LITE">Lite</option>
              <option value="STARTER">Starter</option>
              <option value="GROWTH">Growth</option>
            </select>
            <button className="small">Save</button>
          </form>
          <p className="muted">
            {bill.plan.name}: {formatJmd(bill.plan.monthlyPriceCents)}/month, {bill.plan.includedVoiceMinutes} minutes, {bill.plan.includedWhatsAppMessages}{" "}
            WhatsApp messages. <Link href="/admin/plans">Edit plans</Link>
          </p>
        </section>
      </div>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Usage this month ({period})</h2>
        <div className="grid">
          <div>
            <div className="muted">Call minutes</div>
            <div className="stat">
              {usage.voiceMinutes} <small className="muted">/ {bill.includedMinutes}</small>
            </div>
            <small className="muted">{usage.calls} calls{usage.telephonySeconds ? ` · carrier ${Math.ceil(usage.telephonySeconds / 60)} min` : ""}</small>
          </div>
          <div>
            <div className="muted">WhatsApp sent</div>
            <div className="stat">
              {usage.whatsappOutbound} <small className="muted">/ {bill.includedMessages}</small>
            </div>
            <small className="muted">
              {usage.whatsappOutboundTemplate} templates · {usage.whatsappInbound} received
            </small>
          </div>
          <div>
            <div className="muted">Web chat messages</div>
            <div className="stat">{usage.webChatMessages}</div>
            <small className="muted">
              LLM tokens {usage.llmInputTokens.toLocaleString()} in / {usage.llmOutputTokens.toLocaleString()} out
            </small>
          </div>
          <div>
            <div className="muted">Bill so far</div>
            <div className="stat">{formatJmd(bill.totalCents)}</div>
            <small className="muted">overage {formatJmd(bill.voiceOverageCents + bill.messageOverageCents)}</small>
          </div>
        </div>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Voice (Retell)</h2>
        <p>
          Agent: <code>{business.retellAgentId ?? "not created"}</code> · LLM: <code>{business.retellLlmId ?? "-"}</code> · Number:{" "}
          <strong>{business.voiceNumber ? formatPhone(business.voiceNumber) : "none"}</strong> · Live transfers to:{" "}
          {business.handoffNumber ? formatPhone(business.handoffNumber) : "not set (callers can only leave a message)"}
        </p>
        {!retellConfigured() ? <p className="flash error">RETELL_API_KEY isn&apos;t set on the server, so voice can&apos;t be provisioned yet.</p> : null}
        <div className="row">
          <form action={syncVoiceAction} className="inline">
            {hidden}
            <button className="small" disabled={!retellConfigured()}>
              {business.retellAgentId ? "Re-sync voice agent" : "Create voice agent"}
            </button>
          </form>
          <form action={importNumberAction} className="inline">
            {hidden}
            <label>
              <span className="visually-hidden">876 number</span>
              <input name="number" inputMode="tel" placeholder="+1 876 555 0123" defaultValue={business.voiceNumber ?? ""} required />
            </label>
            <button className="small secondary" disabled={!retellConfigured() || !business.retellAgentId}>
              Connect number from SIP trunk
            </button>
          </form>
        </div>
        <p className="muted">
          Re-sync after changing the handoff number or assistant name. Prices, hours and FAQs reach the agent on the next call automatically.
        </p>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>WhatsApp</h2>
        <form action={saveWhatsAppAction} className="stack">
          {hidden}
          <div className="row">
            <label>
              Provider
              <select name="provider" defaultValue={conn.whatsapp.provider}>
                <option value="CONSOLE">Not connected (log only)</option>
                <option value="META">Meta WhatsApp Cloud API</option>
                <option value="DIALOG360">360dialog</option>
              </select>
            </label>
            <label>
              Phone number ID
              <input name="phoneNumberId" defaultValue={conn.whatsapp.phoneNumberId ?? ""} maxLength={60} />
            </label>
          </div>
          <div className="row">
            <label>
              Meta access token (optional override)
              <input name="accessToken" type="password" autoComplete="off" placeholder={conn.whatsapp.hasOwnToken ? "saved - leave blank to keep" : "uses the platform token"} />
            </label>
            <label>
              360dialog API key
              <input name="apiKey" type="password" autoComplete="off" placeholder={conn.whatsapp.hasApiKey ? "saved - leave blank to keep" : ""} />
            </label>
          </div>
          <button className="small">Save WhatsApp</button>
        </form>
        <form action={testWhatsAppAction} className="inline" style={{ marginTop: 8 }}>
          {hidden}
          <button className="small secondary">Send test template to the owner</button>
        </form>
        <p className="muted">
          Meta webhook: <code>{env.APP_URL}/api/whatsapp/meta</code> · 360dialog webhook:{" "}
          <code>
            {env.APP_URL}/api/whatsapp/360dialog?token=…&amp;business={business.slug}
          </code>
        </p>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Calendar</h2>
        <form action={saveCalendarAction} className="stack">
          {hidden}
          <label>
            Calendar
            <select name="provider" defaultValue={conn.calendar.provider}>
              <option value="INTERNAL">Conroy built-in calendar</option>
              <option value="GOOGLE">Google Calendar</option>
              <option value="CALCOM">Cal.com</option>
            </select>
          </label>
          <label>
            Google calendar ID
            <input name="calendarId" defaultValue={conn.calendar.calendarId ?? ""} placeholder="owner@gmail.com" />
            <small className="muted">
              Shared with <code>{env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? "GOOGLE_SERVICE_ACCOUNT_EMAIL (not set)"}</code> with &quot;Make changes to events&quot;.
              Staff calendars are set per staff member in the business settings.
            </small>
          </label>
          <div className="row">
            <label>
              Cal.com API key
              <input name="apiKey" type="password" autoComplete="off" placeholder={conn.calendar.hasApiKey ? "saved - leave blank to keep" : ""} />
            </label>
            <label>
              Cal.com event type ID
              <input name="eventTypeId" inputMode="numeric" defaultValue={conn.calendar.eventTypeId ?? ""} />
            </label>
          </div>
          <button className="small">Save calendar</button>
        </form>
        <form action={testCalendarAction} className="inline" style={{ marginTop: 8 }}>
          {hidden}
          <button className="small secondary">Test calendar</button>
        </form>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>People with access</h2>
        {users.length === 0 ? (
          <p className="muted">No logins yet.</p>
        ) : (
          <ul>
            {users.map((u) => (
              <li key={u.id}>
                {u.name} &lt;{u.email}&gt; · {u.role.toLowerCase()}
                {!u.active ? " · deactivated" : ""}
                {u.mustChangePassword ? " · hasn't set a password yet" : ""} · last sign-in{" "}
                {u.lastLoginAt ? formatDateTimeShort(u.lastLoginAt, tz) : "never"}
              </li>
            ))}
          </ul>
        )}
        <p className="muted">Add people or reset passwords from the business dashboard: Open dashboard &rarr; Team.</p>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Internal notes (Steven only)</h2>
        <form action={saveNotesAction} className="stack">
          {hidden}
          <textarea name="notes" defaultValue={business.internalNotes ?? ""} maxLength={4000} placeholder="Contract dates, contacts, special arrangements..." />
          <button className="small">Save notes</button>
        </form>
      </section>

      <section>
        <h2>Recent activity</h2>
        {audit.length === 0 ? (
          <p className="muted">Nothing yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <tbody>
                {audit.map((a) => (
                  <tr key={a.id}>
                    <td>{formatDateTimeShort(a.createdAt, tz)}</td>
                    <td>{a.action}</td>
                    <td className="muted">{a.entityType ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
