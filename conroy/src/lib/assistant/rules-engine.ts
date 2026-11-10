import { detectIntent, normalizeForIntent } from "../intents";
import { describeOpenNow, describeWeeklyHours } from "../hours";
import { upcomingExceptions, type KnowledgeData } from "../knowledge";
import { priceLabel } from "../money";
import { usdRate } from "../business";
import { formatDateTimeSpoken } from "../time";
import { findUpcomingBookings } from "../booking/service";
import { executeTool, matchService, resolveDate, type ToolContext, type ToolEvent } from "./tools";
import { WEEKDAY_NAMES } from "../time";

/**
 * Keyword-only assistant used when no LLM is configured (LLM_PROVIDER=rules)
 * or the LLM is down. It answers hours/location/prices/policies/FAQs straight
 * from the knowledge base, shows real availability, takes messages and hands
 * off to staff. It never makes anything up.
 */

export interface RulesInput {
  text: string;
  knowledge: KnowledgeData;
  ctx: ToolContext;
  lastAssistantText?: string | null;
  now: Date;
}

export interface EngineResult {
  reply: string;
  events: ToolEvent[];
}

const CANCEL_MARKER = /Reply YES to cancel booking ([A-Z0-9]{2}-[A-Z0-9]{4})/;

function servicesMentioned(k: KnowledgeData, text: string) {
  const lower = text.toLowerCase();
  const direct = k.services.filter((s) =>
    s.name
      .toLowerCase()
      .split(/[\s&()/,-]+/)
      .filter((w) => w.length > 3)
      .some((w) => lower.includes(w.replace(/s$/, ""))),
  );
  if (direct.length) return direct;
  const { match } = matchService(k.services, text);
  return match ? [match] : [];
}

function dateMentioned(text: string, now: Date, tz: string) {
  const lower = text.toLowerCase();
  for (const word of ["today", "tideh", "tomorrow", "tumaro", ...WEEKDAY_NAMES.map((d) => d.toLowerCase())]) {
    if (lower.includes(word)) return resolveDate(word, now, tz);
  }
  const iso = lower.match(/\d{4}-\d{2}-\d{2}/);
  return iso ? resolveDate(iso[0], now, tz) : null;
}

const STOP_WORDS = new Set(["how", "the", "you", "and", "for", "can", "are", "what", "does", "with", "your", "have", "this", "that", "unnu", "yuh", "mi", "fi", "wah", "weh"]);

function contentWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
}

function faqMatch(k: KnowledgeData, text: string): { score: number; answer: string } | null {
  const words = new Set([...contentWords(text), ...contentWords(normalizeForIntent(text))]);
  let best: { score: number; answer: string } | null = null;
  for (const f of k.faqs) {
    const keys = new Set([...f.keywords.map((x) => x.toLowerCase()), ...contentWords(f.question)]);
    let score = 0;
    for (const w of keys) if (words.has(w)) score += f.keywords.includes(w) ? 2 : 1;
    if (score > 0 && (!best || score > best.score)) best = { score, answer: f.answer };
  }
  return best;
}

function faqAnswer(k: KnowledgeData, text: string): string | null {
  return faqMatch(k, text)?.answer ?? null;
}

/** Intents where a business-written FAQ that matches a keyword beats the generic answer. */
const FAQ_FIRST = new Set(["LOCATION", "PAYMENT", "POLICY", "UNKNOWN"]);

export async function rulesReply(input: RulesInput): Promise<EngineResult> {
  const { text, knowledge: k, ctx, now } = input;
  const b = k.business;
  const tz = b.timezone;
  const intent = detectIntent(text).intent;
  const events: ToolEvent[] = [];
  const rate = usdRate(b);

  // Two-step cancel ("C" -> confirm -> "YES").
  const pendingCancel = input.lastAssistantText?.match(CANCEL_MARKER)?.[1];
  if (pendingCancel && (intent === "CONFIRM" || /^y(es)?$/i.test(text.trim()))) {
    const out = await executeTool("cancel_booking", { reference: pendingCancel }, ctx);
    events.push(...out.events);
    return {
      reply: out.ok
        ? `Done - booking ${pendingCancel} is cancelled. Reply any time if you'd like to book again.`
        : String(out.result.message ?? "Sorry, I couldn't cancel that booking. I've let the team know."),
      events,
    };
  }

  if (FAQ_FIRST.has(intent)) {
    const faq = faqMatch(k, text);
    if (faq && faq.score >= 2) return { reply: faq.answer, events };
  }

  const isCancelShortcut = /^c$/i.test(text.trim());
  const isRescheduleShortcut = /^r$/i.test(text.trim());

  switch (true) {
    case intent === "HUMAN" || intent === "COMPLAINT": {
      const out = await executeTool("request_human", { reason: text.slice(0, 280), urgency: intent === "COMPLAINT" ? "HIGH" : "NORMAL" }, ctx);
      events.push(...out.events);
      return { reply: "No problem - I've let the team know and someone will reply here as soon as possible during opening hours.", events };
    }
    case intent === "CANCEL" || isCancelShortcut: {
      if (!ctx.trustedPhone) {
        return { reply: "I can help with that. Please send your booking reference and the phone number you booked with.", events };
      }
      const list = await findUpcomingBookings(ctx.businessId, { phone: ctx.trustedPhone, now });
      if (list.length === 0) return { reply: "I don't see any upcoming bookings for this number. Did you book with a different number?", events };
      const target = list[0];
      return {
        reply: `I found your ${target.service.name} on ${formatDateTimeSpoken(target.startAt, tz)} (ref ${target.reference}). Reply YES to cancel booking ${target.reference}.`,
        events,
      };
    }
    case intent === "RESCHEDULE" || isRescheduleShortcut: {
      const out = await executeTool(
        "capture_lead",
        { request: `Wants to reschedule: "${text.slice(0, 200)}"`, urgency: "NORMAL" },
        ctx,
      );
      events.push(...out.events);
      return { reply: "Sure! What day and time would suit you better? I've noted it and the team will confirm the new time with you.", events };
    }
    case intent === "BOOK" || intent === "AVAILABILITY": {
      const services = servicesMentioned(k, text);
      if (services.length === 0) {
        return {
          reply: `Happy to help you book! Which service would you like? We offer: ${k.services
            .filter((s) => s.bookable)
            .map((s) => s.name)
            .join(", ")}.`,
          events,
        };
      }
      const date = dateMentioned(text, now, tz);
      const out = await executeTool("check_availability", { service: services[0].name, ...(date ? { date } : {}) }, ctx);
      const options = (out.result.options as { spoken: string }[] | undefined) ?? [];
      if (options.length === 0) {
        return { reply: `Sorry, I don't see any open times for ${services[0].name} then. Would another day work?`, events };
      }
      const lead = await executeTool("capture_lead", { request: `Booking request: "${text.slice(0, 200)}"`, urgency: "NORMAL" }, ctx);
      events.push(...lead.events);
      return {
        reply:
          `Here are the next open times for ${services[0].name} (${out.result.price}):\n` +
          options.map((o) => `- ${o.spoken}`).join("\n") +
          `\nReply with your name and the time you want, and we'll confirm it for you.`,
        events,
      };
    }
    case intent === "PRICE" || intent === "SERVICES": {
      const services = servicesMentioned(k, text);
      if (services.length === 1) {
        const s = services[0];
        return {
          reply: `${s.name} is ${priceLabel(s.priceCents, { isFrom: s.priceIsFrom, usdRate: rate })} and takes about ${s.durationMin} minutes.${
            s.depositCents ? ` A ${priceLabel(s.depositCents)} deposit is needed to book.` : ""
          } Would you like me to check what times are free?`,
          events,
        };
      }
      const list = (services.length ? services : k.services).slice(0, 12);
      return {
        reply:
          (services.length ? "" : "Here's our price list (Jamaican dollars):\n") +
          list.map((s) => `- ${s.name}: ${priceLabel(s.priceCents, { isFrom: s.priceIsFrom, usdRate: rate })}`).join("\n"),
        events,
      };
    }
    case intent === "HOURS": {
      const exceptions = upcomingExceptions(k.rules, now, 21).slice(0, 2);
      return {
        reply: [describeOpenNow(k.rules, now), "Our hours:", ...describeWeeklyHours(k.rules.weekly), ...exceptions.map((e) => `Note: ${e}`)].join("\n"),
        events,
      };
    }
    case intent === "LOCATION": {
      const where = [b.addressLine, b.area, b.parish].filter(Boolean).join(", ");
      return { reply: [where ? `We're at ${where}.` : null, b.directions].filter(Boolean).join(" ") || "Let me get the team to send you directions.", events };
    }
    case intent === "POLICY": {
      const lower = text.toLowerCase();
      const relevant = k.policies.filter((p) => lower.includes(p.kind.toLowerCase().slice(0, 5)) || lower.includes(p.title.toLowerCase().split(" ")[0]));
      const list = relevant.length ? relevant : k.policies;
      return { reply: list.map((p) => `${p.title}: ${p.body}`).join("\n") || "Let me check with the team and get back to you.", events };
    }
    case intent === "PAYMENT": {
      const faq = faqAnswer(k, text);
      if (faq) return { reply: faq, events };
      return {
        reply: k.paymentLabels.length
          ? `You can pay in person, or we can send you a secure payment link (${k.paymentLabels.join(", ")}) by WhatsApp. We never ask for card details by chat.`
          : "Please pay in person at the shop. The team can tell you more if you need.",
        events,
      };
    }
    case intent === "THANKS":
      return { reply: b.tone === "LIGHT_PATOIS" ? "You're welcome! Bless up and walk good." : "You're welcome! Have a lovely day.", events };
    case intent === "GREETING":
      return {
        reply: `${b.tone === "LIGHT_PATOIS" ? "Wah gwaan! " : "Hi! "}I'm ${b.assistantName}, ${b.name}'s AI assistant. I can help with our hours, prices, location and bookings. What can I do for you?`,
        events,
      };
    default: {
      const faq = faqAnswer(k, text);
      if (faq) return { reply: faq, events };
      const out = await executeTool("capture_lead", { request: text.slice(0, 500), urgency: "NORMAL" }, ctx);
      events.push(...out.events);
      return { reply: "I'm not sure about that one, so I've passed your question to the team and someone will get back to you.", events };
    }
  }
}
