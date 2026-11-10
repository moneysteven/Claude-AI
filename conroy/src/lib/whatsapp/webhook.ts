import { z } from "zod";
import { toE164 } from "../phone";

/**
 * Parser for WhatsApp Cloud API webhooks (Meta and 360dialog v2 send the same
 * shape). Produces provider-neutral inbound messages and delivery statuses.
 */

const messageSchema = z
  .object({
    from: z.string(),
    id: z.string(),
    timestamp: z.string().optional(),
    type: z.string(),
    text: z.object({ body: z.string() }).optional(),
    button: z.object({ text: z.string().optional(), payload: z.string().optional() }).optional(),
    interactive: z
      .object({
        button_reply: z.object({ id: z.string(), title: z.string() }).optional(),
        list_reply: z.object({ id: z.string(), title: z.string() }).optional(),
      })
      .optional(),
  })
  .passthrough();

const statusSchema = z
  .object({
    id: z.string(),
    status: z.string(),
    timestamp: z.string().optional(),
    recipient_id: z.string().optional(),
    errors: z.array(z.object({ code: z.number().optional(), title: z.string().optional() }).passthrough()).optional(),
  })
  .passthrough();

const payloadSchema = z.object({
  object: z.string().optional(),
  entry: z
    .array(
      z.object({
        id: z.string().optional(),
        changes: z.array(
          z.object({
            field: z.string().optional(),
            value: z
              .object({
                metadata: z.object({ phone_number_id: z.string(), display_phone_number: z.string().optional() }).optional(),
                contacts: z.array(z.object({ wa_id: z.string().optional(), profile: z.object({ name: z.string().optional() }).optional() })).optional(),
                messages: z.array(messageSchema).optional(),
                statuses: z.array(statusSchema).optional(),
              })
              .passthrough(),
          }),
        ),
      }),
    )
    .default([]),
});

export interface InboundWhatsAppMessage {
  phoneNumberId: string | null;
  from: string; // E.164
  profileName: string | null;
  providerMessageId: string;
  timestamp: Date;
  /** Text content, or null for media/unsupported types. */
  text: string | null;
  type: string;
}

export interface WhatsAppStatusUpdate {
  phoneNumberId: string | null;
  providerMessageId: string;
  status: "SENT" | "DELIVERED" | "READ" | "FAILED";
  error: string | null;
}

export function parseWhatsAppWebhook(body: unknown): { messages: InboundWhatsAppMessage[]; statuses: WhatsAppStatusUpdate[] } {
  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) return { messages: [], statuses: [] };
  const messages: InboundWhatsAppMessage[] = [];
  const statuses: WhatsAppStatusUpdate[] = [];

  for (const entry of parsed.data.entry) {
    for (const change of entry.changes) {
      const v = change.value;
      const phoneNumberId = v.metadata?.phone_number_id ?? null;
      for (const m of v.messages ?? []) {
        const from = toE164(`+${m.from.replace(/^\+/, "")}`);
        if (!from) continue;
        const profile = v.contacts?.find((c) => c.wa_id === m.from)?.profile?.name ?? v.contacts?.[0]?.profile?.name ?? null;
        const text =
          m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? null;
        messages.push({
          phoneNumberId,
          from,
          profileName: profile,
          providerMessageId: m.id,
          timestamp: m.timestamp ? new Date(Number(m.timestamp) * 1000) : new Date(),
          text,
          type: m.type,
        });
      }
      for (const s of v.statuses ?? []) {
        const map: Record<string, WhatsAppStatusUpdate["status"]> = { sent: "SENT", delivered: "DELIVERED", read: "READ", failed: "FAILED" };
        const status = map[s.status];
        if (!status) continue;
        statuses.push({
          phoneNumberId,
          providerMessageId: s.id,
          status,
          error: s.errors?.[0] ? `${s.errors[0].code ?? ""} ${s.errors[0].title ?? ""}`.trim() : null,
        });
      }
    }
  }
  return { messages, statuses };
}
