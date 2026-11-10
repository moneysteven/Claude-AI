import type { Business } from "@prisma/client";
import { firstDelivery } from "../http";
import { logger } from "../logger";
import { enqueue, JOB } from "../jobs/queue";
import { applyStatusUpdate, businessForPhoneNumberId } from "./inbound";
import { parseWhatsAppWebhook } from "./webhook";

/**
 * Shared by the Meta and 360dialog webhook routes: route each message to its
 * business, drop duplicates, and queue the (slower) assistant reply so the
 * webhook is acknowledged within Meta's time limit.
 */
export async function dispatchWhatsAppWebhook(body: unknown, fallbackBusiness?: Business | null) {
  const { messages, statuses } = parseWhatsAppWebhook(body);
  let queued = 0;
  for (const m of messages) {
    const business = (await businessForPhoneNumberId(m.phoneNumberId)) ?? fallbackBusiness ?? null;
    if (!business) {
      logger.warn({ phoneNumberId: m.phoneNumberId }, "WhatsApp message for an unknown number");
      continue;
    }
    if (!(await firstDelivery("whatsapp", m.providerMessageId))) continue;
    await enqueue(JOB.WHATSAPP_INBOUND, { ...m, businessId: business.id, timestamp: m.timestamp.toISOString() });
    queued++;
  }
  for (const s of statuses) await applyStatusUpdate(s);
  return { queued, statuses: statuses.length };
}
