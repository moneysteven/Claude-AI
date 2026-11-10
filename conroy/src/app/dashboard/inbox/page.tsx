import type { Metadata } from "next";
import Link from "next/link";
import { Flash } from "@/components/Flash";
import { requireTenant } from "@/lib/auth/session";
import { formatPhone } from "@/lib/phone";
import { formatDateTimeShort } from "@/lib/time";

export const metadata: Metadata = { title: "Inbox" };

const STATUS_LABEL = { BOT: ["Assistant", "ok"], HUMAN: ["Needs a person", "warn"], CLOSED: ["Closed", ""] } as const;

export default async function InboxPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { business, t } = await requireTenant();
  const filter = sp.filter === "human" ? ("HUMAN" as const) : null;
  const conversations = await t.conversation.findMany({
    where: filter ? { status: filter } : {},
    include: { contact: true, _count: { select: { messages: true } } },
    orderBy: [{ status: "desc" }, { lastMessageAt: "desc" }],
    take: 200,
  });
  return (
    <>
      <h1>Inbox</h1>
      <Flash searchParams={sp} />
      <p className="muted">
        WhatsApp and website chats. When a customer asks for a person, {business.assistantName} pauses and the chat shows as
        &quot;Needs a person&quot;. Reply here; resume the assistant when you&apos;re done.
      </p>
      <div className="row" style={{ marginBottom: "1rem" }}>
        <Link className="button secondary" href="/dashboard/inbox">
          All
        </Link>
        <Link className="button secondary" href="/dashboard/inbox?filter=human">
          Needs a person
        </Link>
      </div>
      {conversations.length === 0 ? (
        <p className="muted">No conversations yet.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Channel</th>
                <th>Status</th>
                <th>Last message</th>
                <th>Messages</th>
              </tr>
            </thead>
            <tbody>
              {conversations.map((c) => {
                const [label, tone] = STATUS_LABEL[c.status];
                const who = c.contact?.name ?? (c.channel === "WHATSAPP" ? formatPhone(c.externalId) : "Website visitor");
                return (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/dashboard/inbox/${c.id}`}>{who}</Link>
                      {c.unreadForStaff > 0 ? <span className="badge warn" style={{ marginLeft: 6 }}>{c.unreadForStaff} new</span> : null}
                      {c.handoffReason ? (
                        <>
                          <br />
                          <small className="muted">{c.handoffReason}</small>
                        </>
                      ) : null}
                    </td>
                    <td>{c.channel === "WHATSAPP" ? "WhatsApp" : "Website"}</td>
                    <td>
                      <span className={`badge ${tone}`}>{label}</span>
                    </td>
                    <td>{formatDateTimeShort(c.lastMessageAt, business.timezone)}</td>
                    <td>{c._count.messages}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
