import { generateReply } from "../assistant/engine";
import { privacyUrl } from "../business";
import { encrypt } from "../crypto";
import { db } from "../db";
import { env } from "../env";
import { detectIntent } from "../intents";
import { logger } from "../logger";
import { maskPhone } from "../phone";
import { tenantDb } from "../tenant";
import { recordUsage } from "../usage";
import { upsertContact } from "../contacts";
import { sendCustomerWhatsApp, whatsappConversation } from "./outbound";
import type { InboundWhatsAppMessage, WhatsAppStatusUpdate } from "./webhook";

/**
 * One inbound WhatsApp message, end to end:
 * store -> STOP/START -> paused-for-staff check -> assistant reply.
 */
export async function handleInboundWhatsApp(m: InboundWhatsAppMessage & { businessId: string }) {
  const now = new Date();
  const t = tenantDb(m.businessId);
  const business = await t.business.findUniqueOrThrow({ where: { id: m.businessId } });
  if (business.status === "DISABLED") return;

  const contact = await upsertContact(m.businessId, m.from, m.profileName);
  await t.contact.update({ where: { id: contact.id }, data: { lastInboundWhatsappAt: now } });
  const conversation = await whatsappConversation(m.businessId, m.from, contact.id);
  if (!conversation.contactId) await t.conversation.update({ where: { id: conversation.id }, data: { contactId: contact.id } });
  const isFirstContact = (await t.message.count({ where: { conversationId: conversation.id } })) === 0;

  // Store the inbound message (providerMessageId is unique: duplicates stop here).
  let inbound;
  try {
    inbound = await t.message.create({
      data: {
        businessId: m.businessId,
        conversationId: conversation.id,
        direction: "INBOUND",
        sender: "CUSTOMER",
        bodyEnc: encrypt(m.text ?? `[${m.type} message]`),
        providerMessageId: m.providerMessageId,
        status: "RECEIVED",
      },
    });
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      logger.info({ businessId: m.businessId }, "duplicate WhatsApp message ignored");
      return;
    }
    throw err;
  }
  await t.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: now, ...(conversation.status !== "BOT" ? { unreadForStaff: { increment: 1 } } : {}) },
  });
  await recordUsage(m.businessId, "WHATSAPP_INBOUND", 1, `wa-in:${m.providerMessageId}`);

  const reply = (text: string) => sendCustomerWhatsApp({ businessId: m.businessId, to: m.from, text, sender: "ASSISTANT", bypassOptOut: true, now });

  // Voice notes, photos, documents.
  if (!m.text) {
    if (conversation.status === "BOT") {
      await reply("Sorry, I can only read text messages for now. Please type your question, or type \"talk to a person\" and the team will get back to you.");
    }
    return;
  }

  const intent = detectIntent(m.text).intent;
  if (intent === "OPT_OUT") {
    await t.contact.update({ where: { id: contact.id }, data: { whatsappOptOut: true, whatsappOptOutAt: now } });
    await reply(`You've been unsubscribed from ${business.name} WhatsApp updates and reminders. Reply START at any time to subscribe again.`);
    return;
  }
  if (intent === "OPT_IN") {
    await t.contact.update({ where: { id: contact.id }, data: { whatsappOptOut: false, whatsappOptOutAt: null } });
    await reply(`Welcome back! You'll get booking confirmations and reminders from ${business.name} again.`);
    return;
  }

  // Bot paused: a person is handling this conversation.
  if (conversation.status === "HUMAN") return;
  if (conversation.status === "CLOSED") {
    await t.conversation.update({ where: { id: conversation.id }, data: { status: "BOT" } });
  }

  const result = await generateReply({
    businessId: m.businessId,
    channel: "WHATSAPP",
    conversationId: conversation.id,
    text: m.text,
    trustedPhone: m.from,
    currentMessageId: inbound.id,
    now,
  });

  const notice = isFirstContact
    ? `Hi! I'm ${business.assistantName}, ${business.name}'s AI assistant. Privacy notice: ${privacyUrl(business, env.APP_URL)} (reply STOP to opt out of updates).\n\n`
    : "";
  await reply(notice + result.reply);
  logger.info({ businessId: m.businessId, from: maskPhone(m.from), engine: result.engine, handoff: result.handoff }, "whatsapp reply sent");
}

/** Delivery receipts: sent / delivered / read / failed. */
export async function applyStatusUpdate(s: WhatsAppStatusUpdate) {
  // Receipts can arrive out of order: never downgrade (read -> delivered).
  const higher: Record<WhatsAppStatusUpdate["status"], ("DELIVERED" | "READ" | "FAILED")[]> = {
    SENT: ["DELIVERED", "READ", "FAILED"],
    DELIVERED: ["READ", "FAILED"],
    READ: ["FAILED"],
    FAILED: [],
  };
  await db.message.updateMany({
    where: { providerMessageId: s.providerMessageId, status: { notIn: higher[s.status] } },
    data: { status: s.status, ...(s.error ? { error: s.error.slice(0, 300) } : {}) },
  });
}

/** Map a Cloud API phone_number_id to the business that owns it. */
export async function businessForPhoneNumberId(phoneNumberId: string | null) {
  if (!phoneNumberId) return null;
  return db.business.findUnique({ where: { waPhoneNumberId: phoneNumberId } });
}
