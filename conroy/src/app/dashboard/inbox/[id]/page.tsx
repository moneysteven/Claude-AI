import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Flash } from "@/components/Flash";
import { requireTenant } from "@/lib/auth/session";
import { decryptOptional } from "@/lib/crypto";
import { formatPhone } from "@/lib/phone";
import { formatDateTimeShort } from "@/lib/time";
import { isWithinServiceWindow } from "@/lib/whatsapp/providers";
import { replyAction, setConversationStatusAction } from "../actions";

export const metadata: Metadata = { title: "Conversation" };

export default async function ConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { business, t } = await requireTenant();
  const conv = await t.conversation.findFirst({
    where: { id },
    include: { contact: true, messages: { orderBy: { createdAt: "asc" }, take: 300 } },
  });
  if (!conv) notFound();
  if (conv.unreadForStaff > 0) await t.conversation.update({ where: { id: conv.id }, data: { unreadForStaff: 0 } });

  const tz = business.timezone;
  const isWhatsApp = conv.channel === "WHATSAPP";
  const windowOpen = isWhatsApp ? isWithinServiceWindow(conv.contact?.lastInboundWhatsappAt) : true;
  const who = conv.contact?.name ?? (isWhatsApp ? formatPhone(conv.externalId) : "Website visitor");
  const customerPhone = conv.contact?.phone ?? (isWhatsApp ? conv.externalId : null);

  return (
    <>
      <p>
        <Link href="/dashboard/inbox">&larr; Inbox</Link>
      </p>
      <h1>{who}</h1>
      <Flash searchParams={sp} />
      <div className="card row spread">
        <div>
          {isWhatsApp ? (
            <>
              WhatsApp <a href={`tel:${conv.externalId}`}>{formatPhone(conv.externalId)}</a>
            </>
          ) : (
            <>
              Website chat
              {customerPhone ? (
                <>
                  {" "}
                  · <a href={`tel:${customerPhone}`}>{formatPhone(customerPhone)}</a>
                </>
              ) : null}
            </>
          )}
          {conv.contact?.whatsappOptOut ? <span className="badge danger" style={{ marginLeft: 6 }}>opted out (STOP)</span> : null}
          <br />
          <small className="muted">
            {conv.status === "BOT"
              ? `${business.assistantName} is answering automatically.`
              : conv.status === "HUMAN"
                ? `${business.assistantName} is paused: a person is handling this chat.`
                : "Closed. A new customer message re-opens it with the assistant."}
          </small>
        </div>
        <div className="row">
          {conv.status !== "BOT" ? (
            <form action={setConversationStatusAction} className="inline">
              <input type="hidden" name="conversationId" value={conv.id} />
              <input type="hidden" name="status" value="BOT" />
              <button className="small">Resume assistant</button>
            </form>
          ) : (
            <form action={setConversationStatusAction} className="inline">
              <input type="hidden" name="conversationId" value={conv.id} />
              <input type="hidden" name="status" value="HUMAN" />
              <button className="small secondary">Pause assistant</button>
            </form>
          )}
          {conv.status !== "CLOSED" ? (
            <form action={setConversationStatusAction} className="inline">
              <input type="hidden" name="conversationId" value={conv.id} />
              <input type="hidden" name="status" value="CLOSED" />
              <button className="small secondary">Close</button>
            </form>
          ) : null}
        </div>
      </div>

      <div className="thread" aria-live="polite">
        {conv.messages.map((m) => {
          const text = decryptOptional(m.bodyEnc) ?? "(message deleted under the retention policy)";
          const cls = m.direction === "INBOUND" ? "in" : m.sender === "STAFF" ? "staff" : "out";
          const who = m.direction === "INBOUND" ? "Customer" : m.sender === "STAFF" ? "Staff" : m.sender === "SYSTEM" ? "Automatic" : business.assistantName;
          return (
            <div key={m.id} className={`bubble ${cls}`}>
              {text}
              <span className="meta">
                {who} · {formatDateTimeShort(m.createdAt, tz)}
                {m.templateName ? ` · template ${m.templateName}` : ""}
                {m.direction === "OUTBOUND" ? ` · ${m.status.toLowerCase()}` : ""}
                {m.error ? ` · ${m.error}` : ""}
              </span>
            </div>
          );
        })}
      </div>

      <form action={replyAction} className="stack card">
        <input type="hidden" name="conversationId" value={conv.id} />
        <label>
          Reply as staff
          <textarea name="text" required maxLength={2000} disabled={!windowOpen} />
        </label>
        {!windowOpen ? (
          <p className="flash warn">
            {conv.contact?.lastInboundWhatsappAt
              ? `${who} last messaged you on WhatsApp on ${formatDateTimeShort(conv.contact.lastInboundWhatsappAt, tz)}. After 24 hours, WhatsApp doesn't allow free-typed replies until they message again.`
              : `${who} hasn't messaged you on WhatsApp yet (they used your website or phone line), so WhatsApp doesn't allow free-typed replies until they do.`}{" "}
            Booking confirmations, reminders and payment links still go out automatically.
            {customerPhone ? (
              <>
                {" "}
                To talk to them now, call <a href={`tel:${customerPhone}`}>{formatPhone(customerPhone)}</a>.
              </>
            ) : null}
          </p>
        ) : null}
        <button type="submit" disabled={!windowOpen}>
          Send
        </button>
        <small className="muted">Sending a reply pauses the assistant for this chat until you resume it.</small>
      </form>
    </>
  );
}
