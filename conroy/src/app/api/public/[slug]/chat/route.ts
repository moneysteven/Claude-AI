import { z } from "zod";
import { generateReply } from "@/lib/assistant/engine";
import { decryptOptional, encrypt, randomToken, signValue, verifySignedValue } from "@/lib/crypto";
import { errorJson, parseJson, readRawBody } from "@/lib/http";
import { logger } from "@/lib/logger";
import { json, preflight, publicContext } from "@/lib/public-api";
import { rateLimit } from "@/lib/ratelimit";
import { tenantDb } from "@/lib/tenant";
import { recordUsage } from "@/lib/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

const bodySchema = z.object({
  message: z.string().trim().min(1).max(1000),
  token: z.string().max(200).optional().nullable(),
  timezone: z.string().max(60).optional().nullable(),
});

export function OPTIONS(req: Request, { params }: Params) {
  return params.then(({ slug }) => preflight(req, slug));
}

/** Website chat: one customer message in, one assistant reply out. */
export async function POST(req: Request, { params }: Params) {
  const { slug } = await params;
  const ctx = await publicContext(req, slug, { name: "chat", max: 20, windowMs: 60_000 });
  if (!ctx.ok) return ctx.response;
  const raw = await readRawBody(req, 10_000);
  if (raw === null) return errorJson(413, "Message too long", ctx.headers);
  const parsed = bodySchema.safeParse(parseJson(raw));
  if (!parsed.success) return errorJson(400, "Invalid message", ctx.headers);

  const t = tenantDb(ctx.business.id);
  const existingId = verifySignedValue(parsed.data.token);
  let conversation = existingId ? await t.conversation.findFirst({ where: { id: existingId, channel: "WEB" } }) : null;
  if (!conversation) {
    // Cap new conversations per IP so the widget can't be used to flood the inbox.
    const rl = rateLimit(`chat-new:${ctx.business.id}:${ctx.ip}`, 10, 60 * 60 * 1000);
    if (!rl.allowed) return errorJson(429, "Too many new chats, please try again later", ctx.headers);
    conversation = await t.conversation.create({ data: { businessId: ctx.business.id, channel: "WEB", externalId: `web_${randomToken(12)}` } });
  }
  const token = signValue(conversation.id);
  const now = new Date();
  const inbound = await t.message.create({
    data: {
      businessId: ctx.business.id,
      conversationId: conversation.id,
      direction: "INBOUND",
      sender: "CUSTOMER",
      bodyEnc: encrypt(parsed.data.message),
      status: "RECEIVED",
    },
  });
  await t.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: now, ...(conversation.status !== "BOT" ? { unreadForStaff: { increment: 1 } } : {}) },
  });
  await recordUsage(ctx.business.id, "WEB_CHAT_MESSAGE", 1);

  if (conversation.status === "HUMAN") {
    return json({ token, status: "HUMAN", reply: null, notice: "A team member will reply here soon." }, { headers: ctx.headers });
  }
  if (conversation.status === "CLOSED") await t.conversation.update({ where: { id: conversation.id }, data: { status: "BOT" } });

  try {
    const result = await generateReply({
      businessId: ctx.business.id,
      channel: "WEB",
      conversationId: conversation.id,
      text: parsed.data.message,
      visitorTimezone: parsed.data.timezone ?? null,
      currentMessageId: inbound.id,
      now,
    });
    await t.message.create({
      data: {
        businessId: ctx.business.id,
        conversationId: conversation.id,
        direction: "OUTBOUND",
        sender: "ASSISTANT",
        bodyEnc: encrypt(result.reply),
        status: "SENT",
      },
    });
    return json({ token, status: result.handoff ? "HUMAN" : "BOT", reply: result.reply }, { headers: ctx.headers });
  } catch (err) {
    logger.error({ err: (err as Error).message, businessId: ctx.business.id }, "web chat reply failed");
    return json(
      { token, status: "BOT", reply: "Sorry, something went wrong on our side. Please try again, or message us on WhatsApp." },
      { headers: ctx.headers },
    );
  }
}

/** Polling for staff replies while a person is handling the chat. */
export async function GET(req: Request, { params }: Params) {
  const { slug } = await params;
  const ctx = await publicContext(req, slug, { name: "chat-poll", max: 30, windowMs: 60_000 });
  if (!ctx.ok) return ctx.response;
  const url = new URL(req.url);
  const conversationId = verifySignedValue(url.searchParams.get("token"));
  if (!conversationId) return errorJson(401, "Invalid token", ctx.headers);
  const after = new Date(Number(url.searchParams.get("after") ?? 0) || 0);
  const t = tenantDb(ctx.business.id);
  const conversation = await t.conversation.findFirst({ where: { id: conversationId, channel: "WEB" } });
  if (!conversation) return errorJson(404, "Conversation not found", ctx.headers);
  const messages = await t.message.findMany({
    where: { conversationId, direction: "OUTBOUND", sender: "STAFF", createdAt: { gt: after } },
    orderBy: { createdAt: "asc" },
    take: 20,
  });
  return json(
    {
      status: conversation.status,
      messages: messages.map((m) => ({ text: decryptOptional(m.bodyEnc) ?? "", at: m.createdAt.getTime(), from: "staff" })),
    },
    { headers: ctx.headers },
  );
}
