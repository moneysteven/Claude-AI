"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireTenant } from "@/lib/auth/session";
import { encrypt } from "@/lib/crypto";
import { parseForm, redirectWith } from "@/lib/forms";
import { sendCustomerWhatsApp } from "@/lib/whatsapp/outbound";

const replySchema = z.object({ conversationId: z.string().min(1), text: z.string().min(1).max(2000) });

export async function replyAction(formData: FormData) {
  const { user, business, t } = await requireTenant();
  const d = parseForm(replySchema, formData, "/dashboard/inbox");
  const back = `/dashboard/inbox/${d.conversationId}`;
  const conv = await t.conversation.findFirst({ where: { id: d.conversationId } });
  if (!conv) redirectWith("/dashboard/inbox", "error", "Conversation not found");

  if (conv.channel === "WHATSAPP") {
    const res = await sendCustomerWhatsApp({ businessId: business.id, to: conv.externalId, text: d.text, sender: "STAFF", staffUserId: user.id });
    if (res.status === "SUPPRESSED") {
      redirectWith(
        back,
        "error",
        res.reason === "opted_out"
          ? "Not sent: this customer replied STOP."
          : "Not sent: it's been more than 24 hours since the customer's last message. WhatsApp only allows approved templates now - ask them to message you, or send a booking/payment message.",
      );
    }
    if (res.status === "FAILED") redirectWith(back, "error", "WhatsApp didn't accept the message. Check the WhatsApp connection.");
  } else {
    // Website chat: the widget picks staff replies up by polling.
    await t.message.create({
      data: { businessId: business.id, conversationId: conv.id, direction: "OUTBOUND", sender: "STAFF", bodyEnc: encrypt(d.text), status: "SENT", staffUserId: user.id },
    });
  }
  await t.conversation.update({
    where: { id: conv.id },
    data: { lastMessageAt: new Date(), unreadForStaff: 0, status: conv.status === "BOT" ? "HUMAN" : conv.status },
  });
  await audit({ businessId: business.id, userId: user.id, action: "inbox.reply", entityType: "Conversation", entityId: conv.id });
  revalidatePath(back);
  redirectWith(back, "ok", "Sent");
}

const statusSchema = z.object({ conversationId: z.string().min(1), status: z.enum(["BOT", "HUMAN", "CLOSED"]) });

export async function setConversationStatusAction(formData: FormData) {
  const { user, business, t } = await requireTenant();
  const d = parseForm(statusSchema, formData, "/dashboard/inbox");
  await t.conversation.update({
    where: { id: d.conversationId },
    data: { status: d.status, unreadForStaff: 0, ...(d.status === "BOT" ? { handoffReason: null } : {}) },
  });
  await audit({ businessId: business.id, userId: user.id, action: "inbox.status", entityType: "Conversation", entityId: d.conversationId, details: { status: d.status } });
  revalidatePath("/dashboard/inbox");
  const label = d.status === "BOT" ? "Assistant resumed" : d.status === "HUMAN" ? "Assistant paused - you're handling this chat" : "Conversation closed";
  redirectWith(`/dashboard/inbox/${d.conversationId}`, "ok", label);
}
