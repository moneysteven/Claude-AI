import type { MessageSender, MessageStatus } from "@prisma/client";
import { encrypt } from "../crypto";
import { db } from "../db";
import { logger } from "../logger";
import { maskPhone } from "../phone";
import { tenantDb } from "../tenant";
import { recordUsage } from "../usage";
import { isWithinServiceWindow, whatsappFor } from "./providers";
import { renderTemplate, sanitizeParam, TEMPLATES, templateParamCount, type TemplateName } from "./templates";

export interface CustomerMessage {
  businessId: string;
  to: string; // E.164
  /** Free-form text (only allowed inside the 24h customer service window). */
  text?: string;
  /** Approved template, used outside the window or when no text is given. */
  template?: { name: TemplateName; params: string[] };
  sender: MessageSender;
  staffUserId?: string | null;
  /** Only for the STOP confirmation itself. */
  bypassOptOut?: boolean;
  now?: Date;
}

export interface SendOutcome {
  status: MessageStatus;
  messageId?: string;
  reason?: string;
}

/** Find or create the WhatsApp conversation for a customer number. */
export async function whatsappConversation(businessId: string, phone: string, contactId?: string | null) {
  const t = tenantDb(businessId);
  const existing = await t.conversation.findFirst({ where: { channel: "WHATSAPP", externalId: phone } });
  if (existing) return existing;
  try {
    return await t.conversation.create({
      data: { businessId, channel: "WHATSAPP", externalId: phone, contactId: contactId ?? null },
    });
  } catch {
    return t.conversation.findFirstOrThrow({ where: { channel: "WHATSAPP", externalId: phone } });
  }
}

/**
 * Send a WhatsApp message to a customer, respecting opt-out and the 24-hour
 * window, and record it in the inbox. Never throws for delivery problems.
 */
export async function sendCustomerWhatsApp(m: CustomerMessage): Promise<SendOutcome> {
  const now = m.now ?? new Date();
  const t = tenantDb(m.businessId);
  const business = await t.business.findUniqueOrThrow({ where: { id: m.businessId } });
  const contact = await t.contact.findFirst({ where: { phone: m.to } });
  const conversation = await whatsappConversation(m.businessId, m.to, contact?.id);

  const withinWindow = isWithinServiceWindow(contact?.lastInboundWhatsappAt, now);
  const useText = Boolean(m.text) && withinWindow;
  const template = m.template
    ? { name: m.template.name, params: m.template.params.map((p) => sanitizeParam(p)) }
    : undefined;
  if (template && template.params.length !== templateParamCount(template.name)) {
    throw new Error(`Template ${template.name} needs ${templateParamCount(template.name)} params, got ${template.params.length}`);
  }
  const body = useText ? m.text! : template ? renderTemplate(template.name, template.params) : (m.text ?? "");

  const record = async (status: MessageStatus, extra: { providerMessageId?: string | null; error?: string | null } = {}) => {
    const msg = await t.message.create({
      data: {
        businessId: m.businessId,
        conversationId: conversation.id,
        direction: "OUTBOUND",
        sender: m.sender,
        bodyEnc: encrypt(body),
        templateName: useText ? null : (template?.name ?? null),
        providerMessageId: extra.providerMessageId ?? null,
        status,
        error: extra.error ?? null,
        staffUserId: m.staffUserId ?? null,
      },
    });
    await t.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: now } });
    return msg;
  };

  if (contact?.whatsappOptOut && !m.bypassOptOut) {
    const msg = await record("SUPPRESSED", { error: "Customer opted out (STOP)" });
    return { status: "SUPPRESSED", messageId: msg.id, reason: "opted_out" };
  }
  if (!useText && !template) {
    const msg = await record("SUPPRESSED", { error: "Outside the 24-hour window: a template is required" });
    return { status: "SUPPRESSED", messageId: msg.id, reason: "outside_window" };
  }

  try {
    const provider = whatsappFor(business);
    const res = useText
      ? await provider.sendText(m.to, m.text!)
      : await provider.sendTemplate(m.to, template!.name, TEMPLATES[template!.name].language, template!.params);
    const msg = await record("SENT", { providerMessageId: res.providerMessageId });
    await recordUsage(m.businessId, useText ? "WHATSAPP_OUTBOUND_SESSION" : "WHATSAPP_OUTBOUND_TEMPLATE", 1, `wa-out:${msg.id}`);
    return { status: "SENT", messageId: msg.id };
  } catch (err) {
    logger.error({ err: (err as Error).message, businessId: m.businessId, to: maskPhone(m.to) }, "whatsapp send failed");
    const msg = await record("FAILED", { error: (err as Error).message.slice(0, 300) });
    return { status: "FAILED", messageId: msg.id, reason: (err as Error).message };
  }
}

/**
 * Template message to the owner or staff (call summaries, alerts). Not stored
 * in the customer inbox; metered and logged by id only.
 */
export async function sendStaffTemplate(businessId: string, to: string, name: TemplateName, params: string[]): Promise<SendOutcome> {
  const business = await db.business.findUniqueOrThrow({ where: { id: businessId } });
  const clean = params.map((p) => sanitizeParam(p));
  try {
    const res = await whatsappFor(business).sendTemplate(to, name, TEMPLATES[name].language, clean);
    await recordUsage(businessId, "WHATSAPP_OUTBOUND_TEMPLATE", 1, res.providerMessageId ? `wa-staff:${res.providerMessageId}` : undefined);
    return { status: "SENT" };
  } catch (err) {
    logger.error({ err: (err as Error).message, businessId, to: maskPhone(to), template: name }, "staff whatsapp send failed");
    return { status: "FAILED", reason: (err as Error).message };
  }
}
