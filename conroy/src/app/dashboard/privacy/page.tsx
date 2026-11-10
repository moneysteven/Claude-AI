import type { Metadata } from "next";
import { Flash } from "@/components/Flash";
import { requireTenant, SETTINGS_ROLES } from "@/lib/auth/session";
import { erasePersonAction } from "./actions";

export const metadata: Metadata = { title: "Privacy requests" };

export default async function PrivacyPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { business, t } = await requireTenant(SETTINGS_ROLES);
  const optedOut = await t.contact.count({ where: { whatsappOptOut: true } });

  return (
    <>
      <h1>Privacy requests</h1>
      <Flash searchParams={sp} />

      <section className="card">
        <h2>How long data is kept</h2>
        <p>
          Call recording links, transcripts, call summaries and WhatsApp/website chat text are deleted automatically after{" "}
          <strong>{business.retentionDays} days</strong>. A job runs every night at 03:15 Jamaica time.
        </p>
        <p>
          A customer&apos;s details (contact, enquiries, chats, and the name and number on their bookings and payments) are removed after{" "}
          <strong>{business.customerRetentionMonths} months</strong> without any contact from them. Their past bookings and payments stay for
          your records, marked &quot;Past customer&quot;. Someone who replied STOP keeps their number on file only so they are never messaged
          again. Change both periods under Business &amp; assistant.
        </p>
        <p className="muted">
          Under the Jamaica Data Protection Act 2020, a person can ask what data you hold about them and ask for it to be deleted. Use the tools
          below, keep a note of the request, and respond within the legal time limit. {optedOut} customer(s) have opted out of WhatsApp updates
          (STOP); Conroy no longer sends them reminders or follow-ups.
        </p>
      </section>

      <section className="card">
        <h2>Export a person&apos;s data</h2>
        <p>Downloads everything held about a phone number (contact, bookings, leads, messages, call summaries and transcripts) as a JSON file.</p>
        <form action="/dashboard/privacy/export" method="get" className="inline">
          <label>
            Phone number
            <input name="phone" inputMode="tel" required maxLength={30} placeholder="876-555-1234" />
          </label>
          <button type="submit">Download export</button>
        </form>
        <p className="muted">Check the person&apos;s identity before sending them their data. Every export is recorded in the audit log.</p>
      </section>

      <section className="card">
        <h2>Erase a person&apos;s data</h2>
        <p>
          Deletes the contact, their conversations, leads and call transcripts (also the voice provider&apos;s copies), and cancels unpaid payment
          requests. Their bookings and paid payments are kept but the name and phone number are removed. <strong>This cannot be undone.</strong>
        </p>
        <form action={erasePersonAction} className="stack">
          <label>
            Phone number
            <input name="phone" inputMode="tel" required maxLength={30} placeholder="876-555-1234" />
          </label>
          <label className="check">
            <input type="checkbox" name="confirm" required /> I have checked who is asking and want to permanently erase this person&apos;s data
          </label>
          <div>
            <button type="submit" className="danger">
              Erase data
            </button>
          </div>
        </form>
      </section>
    </>
  );
}
