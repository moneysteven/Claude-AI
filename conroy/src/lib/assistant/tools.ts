import type { PaymentKind, Service, Staff, Urgency } from "@prisma/client";
import { z } from "zod";
import { spreadSlots, type Slot } from "../availability";
import {
  cancelBooking,
  checkTime,
  createBooking,
  findUpcomingBookings,
  getAvailability,
  rescheduleBooking,
  type BookingWithRelations,
} from "../booking/service";
import { upsertContact } from "../contacts";
import { env } from "../env";
import { logger } from "../logger";
import { formatJmd, priceLabel } from "../money";
import { alertStaff } from "../notify";
import { createAndSendPaymentRequest, findTemplate } from "../payments/service";
import { formatPhone, toE164 } from "../phone";
import { tenantDb } from "../tenant";
import { usdRate } from "../business";
import {
  addDays,
  describeForVisitor,
  formatDateTimeSpoken,
  isLocalDate,
  localDateOf,
  localToUtc,
  parseLocalDateTime,
  toLocal,
  todayLocal,
  WEEKDAY_NAMES,
  type LocalDate,
  type LocalTime,
} from "../time";

/**
 * The assistant's tools. The phone agent (Retell custom functions) and the
 * chat bot (WhatsApp + web widget) call exactly these functions, so booking
 * rules, identity checks and wording are identical on every channel.
 */

export type AssistantChannel = "VOICE" | "WHATSAPP" | "WEB";

export interface ToolContext {
  businessId: string;
  channel: AssistantChannel;
  /** Trusted number: caller ID on calls, sender on WhatsApp. Never taken from the model. */
  trustedPhone?: string | null;
  conversationId?: string | null;
  callLogId?: string | null;
  visitorTimezone?: string | null;
  now?: Date;
}

export type ToolEvent =
  | { type: "booking_created"; bookingId: string; reference: string }
  | { type: "booking_rescheduled"; bookingId: string; reference: string }
  | { type: "booking_cancelled"; bookingId: string; reference: string }
  | { type: "lead_captured"; leadId: string; urgency: Urgency }
  | { type: "handoff"; reason: string; urgency: Urgency }
  | { type: "payment_link_sent"; paymentRequestId: string };

export interface ToolOutcome {
  ok: boolean;
  result: Record<string, unknown>;
  events: ToolEvent[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties: false;
  };
}

// ------------------------------------------------------------ definitions

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "check_availability",
    description:
      "Look up real open appointment times for a service. Always call this before offering or promising any time. " +
      "Use the Jamaica date (YYYY-MM-DD) worked out from today's date; if the customer named a time, pass it as preferred_time.",
    parameters: {
      type: "object",
      properties: {
        service: { type: "string", description: "Service the customer wants, in their words (e.g. 'silk press', 'trim')." },
        date: { type: "string", description: "Jamaica date YYYY-MM-DD. Omit for the next available days." },
        preferred_time: { type: "string", description: "Customer's preferred time, 24h HH:mm (e.g. 14:30). Optional." },
        time_of_day: { type: "string", enum: ["morning", "afternoon", "evening", "any"], description: "Optional part of day." },
        staff: { type: "string", description: "Preferred staff member's name, if the customer asked for someone." },
      },
      required: ["service"],
      additionalProperties: false,
    },
  },
  {
    name: "book_appointment",
    description:
      "Book an appointment at a time returned by check_availability, after the customer has agreed to the service, date and time and given their name. " +
      "Only tell the customer it is booked if this returns booked=true.",
    parameters: {
      type: "object",
      properties: {
        service: { type: "string", description: "Service name." },
        start: { type: "string", description: "Start in Jamaica time, YYYY-MM-DDTHH:mm, exactly as returned by check_availability." },
        customer_name: { type: "string", description: "Customer's name." },
        customer_phone: {
          type: "string",
          description: "Customer's phone/WhatsApp number. Needed on the website chat; on calls and WhatsApp the customer's own number is used if omitted.",
        },
        staff: { type: "string", description: "Staff member's name if the customer chose one." },
        notes: { type: "string", description: "Short notes for the team (e.g. hair length, car model). No sensitive health details." },
      },
      required: ["service", "start", "customer_name"],
      additionalProperties: false,
    },
  },
  {
    name: "find_bookings",
    description: "Find the customer's upcoming bookings (needed before rescheduling or cancelling).",
    parameters: {
      type: "object",
      properties: {
        reference: { type: "string", description: "Booking reference like TB-7K4P, if the customer has it." },
        phone: { type: "string", description: "Phone number the booking was made with (website chat only)." },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: "reschedule_booking",
    description: "Move an existing booking to a new time the customer agreed to (check availability first).",
    parameters: {
      type: "object",
      properties: {
        reference: { type: "string", description: "Booking reference." },
        new_start: { type: "string", description: "New start in Jamaica time, YYYY-MM-DDTHH:mm." },
        phone: { type: "string", description: "Phone number on the booking (website chat only)." },
        staff: { type: "string", description: "Different staff member, only if the customer asked." },
      },
      required: ["reference", "new_start"],
      additionalProperties: false,
    },
  },
  {
    name: "cancel_booking",
    description: "Cancel an existing booking after the customer clearly confirms they want to cancel.",
    parameters: {
      type: "object",
      properties: {
        reference: { type: "string", description: "Booking reference." },
        reason: { type: "string", description: "Short reason, if given." },
        phone: { type: "string", description: "Phone number on the booking (website chat only)." },
      },
      required: ["reference"],
      additionalProperties: false,
    },
  },
  {
    name: "capture_lead",
    description:
      "Take a message / lead for the team when you can't fully help, the customer wants a call back, or a request is outside what you can book. " +
      "Collect only what is needed.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Customer's name." },
        phone: { type: "string", description: "Best contact number (defaults to the customer's own number)." },
        request: { type: "string", description: "What they want, in one or two sentences." },
        preferred_time: { type: "string", description: "When they'd like the service or a call back." },
        urgency: { type: "string", enum: ["LOW", "NORMAL", "HIGH", "URGENT"], description: "How urgent it is." },
      },
      required: ["request"],
      additionalProperties: false,
    },
  },
  {
    name: "request_human",
    description:
      "Hand the conversation to a staff member: when the customer asks for a person, is upset, describes an emergency, or the topic is outside what you can handle.",
    parameters: {
      type: "object",
      properties: {
        reason: { type: "string", description: "Why a person is needed, in one sentence." },
        urgency: { type: "string", enum: ["NORMAL", "HIGH", "URGENT"], description: "URGENT for safety or health concerns." },
      },
      required: ["reason"],
      additionalProperties: false,
    },
  },
  {
    name: "send_payment_link",
    description:
      "Send the customer a secure Fygaro/WiPay payment link by WhatsApp (deposit, full payment or invoice). Never ask for card details.",
    parameters: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["DEPOSIT", "FULL", "INVOICE"], description: "What the payment is for." },
        booking_reference: { type: "string", description: "Booking reference, if it is for a booking." },
        amount_jmd: { type: "number", description: "Amount in Jamaican dollars, only if staff gave a specific amount." },
      },
      required: ["kind"],
      additionalProperties: false,
    },
  },
];

// ------------------------------------------------------------ helpers

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(\w+?)s\b/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** Fuzzy service match: exact > contains > shared words. */
export function matchService<T extends Pick<Service, "name" | "description">>(services: T[], query: string): { match: T | null; candidates: T[] } {
  const q = normalize(query);
  if (!q) return { match: null, candidates: services };
  const scored = services
    .map((s) => {
      const name = normalize(s.name);
      const desc = normalize(s.description ?? "");
      let score = 0;
      if (name === q) score = 100;
      else if (name.includes(q) || q.includes(name)) score = 60;
      const qWords = q.split(" ").filter((w) => w.length > 2);
      const nameWords = new Set(name.split(" "));
      const shared = qWords.filter((w) => nameWords.has(w)).length;
      score += shared * 15 + qWords.filter((w) => desc.includes(w)).length * 3;
      return { s, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  if (scored.length === 0) return { match: null, candidates: [] };
  const [top, second] = scored;
  if (!second || top.score >= 60 || top.score - second.score >= 15) return { match: top.s, candidates: scored.map((x) => x.s) };
  return { match: null, candidates: scored.slice(0, 4).map((x) => x.s) };
}

export function matchStaff<T extends Pick<Staff, "name">>(staff: T[], query: string | undefined | null): T | null {
  if (!query) return null;
  const q = query.toLowerCase().trim();
  return staff.find((s) => s.name.toLowerCase() === q) ?? staff.find((s) => s.name.toLowerCase().split(" ")[0] === q.split(" ")[0]) ?? null;
}

/** "today", "tomorrow", "saturday", "2026-11-14" -> Jamaica date. */
export function resolveDate(input: string | undefined | null, now: Date, tz: string): LocalDate | null {
  const today = todayLocal(now, tz);
  if (!input) return null;
  const v = input.trim().toLowerCase();
  if (isLocalDate(v)) return v;
  if (["today", "tideh", "tiday"].includes(v)) return today;
  if (["tomorrow", "tumaro", "tomorow"].includes(v)) return addDays(today, 1);
  const idx = WEEKDAY_NAMES.findIndex((d) => d.toLowerCase() === v || d.toLowerCase().slice(0, 3) === v.slice(0, 3));
  if (idx >= 0) {
    const todayIdx = toLocal(now, tz).weekday % 7;
    return addDays(today, (idx - todayIdx + 7) % 7);
  }
  return null;
}

/** "14:30", "2:30pm", "2 pm", "2" -> "14:30" (bare hours 1-6 are read as PM, salon-style). */
export function resolveTime(input: string | undefined | null): LocalTime | null {
  if (!input) return null;
  const m = input.trim().toLowerCase().match(/^(\d{1,2})(?::?(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const mer = m[3]?.replace(/\./g, "");
  if (mer === "pm" && h < 12) h += 12;
  if (mer === "am" && h === 12) h = 0;
  if (!mer && h >= 1 && h <= 6) h += 12;
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

const PART_OF_DAY: Record<string, { from?: LocalTime; to?: LocalTime }> = {
  morning: { to: "11:59" },
  afternoon: { from: "12:00", to: "16:59" },
  evening: { from: "17:00" },
  any: {},
};

function slotOption(slot: Slot, tz: string, staffNames: Map<string, string>, visitorTz?: string | null) {
  return {
    start: `${slot.localDate}T${slot.localTime}`,
    spoken: formatDateTimeSpoken(slot.startAt, tz),
    ...(visitorTz ? { for_visitor: describeForVisitor(slot.startAt, visitorTz, tz) } : {}),
    staff: slot.staffIds.map((id) => staffNames.get(id) ?? id),
  };
}

function bookingSummary(b: BookingWithRelations, tz: string) {
  return {
    reference: b.reference,
    service: b.service.name,
    when: formatDateTimeSpoken(b.startAt, tz),
    start: `${localDateOf(b.startAt, tz)}T${toLocal(b.startAt, tz).toFormat("HH:mm")}`,
    staff: b.staff?.name ?? null,
  };
}

/** Phone numbers the model gives are normalised; on calls/WhatsApp the trusted number wins. */
function customerPhone(ctx: ToolContext, given?: string | null): string | null {
  const parsed = given ? toE164(given, env.DEFAULT_AREA_CODE) : null;
  return parsed ?? ctx.trustedPhone ?? null;
}

/**
 * Who may change a booking: the number it was made with must match the
 * caller ID / WhatsApp sender, or (website chat) the phone the visitor typed.
 */
async function authorizeBooking(ctx: ToolContext, reference: string, phoneArg?: string | null) {
  const [booking] = await findUpcomingBookings(ctx.businessId, { reference, now: ctx.now });
  if (!booking) return { error: "I couldn't find an upcoming booking with that reference." } as const;
  const candidates = [ctx.trustedPhone, phoneArg ? toE164(phoneArg, env.DEFAULT_AREA_CODE) : null].filter(Boolean);
  if (!booking.customerPhone || !candidates.includes(booking.customerPhone)) {
    return {
      error:
        ctx.channel === "WEB"
          ? "For security, please give the phone number the booking was made with."
          : "That booking was made with a different phone number, so I can't change it from here. I can take a message for the team instead.",
    } as const;
  }
  return { booking } as const;
}

function fail(result: Record<string, unknown>): ToolOutcome {
  return { ok: false, result, events: [] };
}

// ------------------------------------------------------------ argument schemas

const schemas = {
  check_availability: z.object({
    service: z.string().min(1).max(100),
    date: z.string().max(20).optional(),
    preferred_time: z.string().max(20).optional(),
    time_of_day: z.enum(["morning", "afternoon", "evening", "any"]).optional(),
    staff: z.string().max(60).optional(),
  }),
  book_appointment: z.object({
    service: z.string().min(1).max(100),
    start: z.string().min(10).max(30),
    customer_name: z.string().min(1).max(120),
    customer_phone: z.string().max(30).optional(),
    staff: z.string().max(60).optional(),
    notes: z.string().max(500).optional(),
  }),
  find_bookings: z.object({ reference: z.string().max(20).optional(), phone: z.string().max(30).optional() }),
  reschedule_booking: z.object({
    reference: z.string().min(3).max(20),
    new_start: z.string().min(10).max(30),
    phone: z.string().max(30).optional(),
    staff: z.string().max(60).optional(),
  }),
  cancel_booking: z.object({ reference: z.string().min(3).max(20), reason: z.string().max(300).optional(), phone: z.string().max(30).optional() }),
  capture_lead: z.object({
    name: z.string().max(120).optional(),
    phone: z.string().max(30).optional(),
    request: z.string().min(1).max(1000),
    preferred_time: z.string().max(120).optional(),
    urgency: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
  }),
  request_human: z.object({ reason: z.string().min(1).max(300), urgency: z.enum(["NORMAL", "HIGH", "URGENT"]).optional() }),
  send_payment_link: z.object({
    kind: z.enum(["DEPOSIT", "FULL", "INVOICE"]),
    booking_reference: z.string().max(20).optional(),
    amount_jmd: z.number().positive().max(10_000_000).optional(),
  }),
} as const;

export type ToolName = keyof typeof schemas;

export function isToolName(name: string): name is ToolName {
  return name in schemas;
}

// ------------------------------------------------------------ executor

export async function executeTool(name: string, rawArgs: unknown, ctx: ToolContext): Promise<ToolOutcome> {
  if (!isToolName(name)) return fail({ error: `Unknown tool ${name}` });
  const parsed = schemas[name].safeParse(rawArgs ?? {});
  if (!parsed.success) {
    return fail({ error: "Invalid arguments", details: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).slice(0, 5) });
  }
  try {
    switch (name) {
      case "check_availability":
        return await checkAvailabilityTool(parsed.data as z.infer<typeof schemas.check_availability>, ctx);
      case "book_appointment":
        return await bookTool(parsed.data as z.infer<typeof schemas.book_appointment>, ctx);
      case "find_bookings":
        return await findBookingsTool(parsed.data as z.infer<typeof schemas.find_bookings>, ctx);
      case "reschedule_booking":
        return await rescheduleTool(parsed.data as z.infer<typeof schemas.reschedule_booking>, ctx);
      case "cancel_booking":
        return await cancelTool(parsed.data as z.infer<typeof schemas.cancel_booking>, ctx);
      case "capture_lead":
        return await captureLeadTool(parsed.data as z.infer<typeof schemas.capture_lead>, ctx);
      case "request_human":
        return await requestHumanTool(parsed.data as z.infer<typeof schemas.request_human>, ctx);
      case "send_payment_link":
        return await paymentLinkTool(parsed.data as z.infer<typeof schemas.send_payment_link>, ctx);
    }
  } catch (err) {
    logger.error({ err: (err as Error).message, tool: name, businessId: ctx.businessId }, "tool failed");
    return fail({ error: "Something went wrong on our side. Apologise, and offer to take a message for the team." });
  }
}

async function loadCatalogue(businessId: string) {
  const t = tenantDb(businessId);
  const [business, services, staff] = await Promise.all([
    t.business.findUniqueOrThrow({ where: { id: businessId } }),
    t.service.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    t.staff.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  return { business, services, staff };
}

async function checkAvailabilityTool(args: z.infer<typeof schemas.check_availability>, ctx: ToolContext): Promise<ToolOutcome> {
  const now = ctx.now ?? new Date();
  const { business, services, staff } = await loadCatalogue(ctx.businessId);
  const tz = business.timezone;
  const { match: service, candidates } = matchService(services, args.service);
  if (!service) {
    return fail({
      needs_clarification: true,
      message: candidates.length ? "Ask which of these services they mean." : "We don't offer that service. Tell the customer what we do offer.",
      options: (candidates.length ? candidates : services).slice(0, 8).map((s) => s.name),
    });
  }
  if (!service.bookable) {
    return fail({ service: service.name, message: "This service can't be booked automatically. Offer to take a message (capture_lead) so the team can arrange it." });
  }
  const chosenStaff = matchStaff(staff, args.staff);
  if (args.staff && !chosenStaff) {
    return fail({ message: `We don't have a team member called ${args.staff}.`, team: staff.map((s) => s.name) });
  }
  const staffNames = new Map(staff.map((s) => [s.id, s.name]));
  const date = resolveDate(args.date, now, tz);
  if (args.date && !date) return fail({ error: "Could not understand the date. Use YYYY-MM-DD." });
  const part = PART_OF_DAY[args.time_of_day ?? "any"];
  const rate = usdRate(business);
  const base = {
    service: service.name,
    duration_minutes: service.durationMin,
    price: priceLabel(service.priceCents, { isFrom: service.priceIsFrom, usdRate: rate }),
    ...(service.depositCents ? { deposit_required: formatJmd(service.depositCents) } : {}),
    timezone_note: "All times are Jamaica time.",
  };

  let requested: Record<string, unknown> | undefined;
  const time = resolveTime(args.preferred_time);
  if (args.preferred_time && !time) return fail({ error: "Could not understand the time. Use HH:mm." });
  if (time) {
    const day = date ?? todayLocal(now, tz);
    const startAt = localToUtc(day, time, tz);
    const free = await checkTime(ctx.businessId, service.id, startAt, chosenStaff?.id, now);
    requested = {
      start: `${day}T${time}`,
      spoken: formatDateTimeSpoken(startAt, tz),
      available: free !== null,
      ...(free ? { staff: free.map((id) => staffNames.get(id) ?? id) } : {}),
    };
  }

  // Search the requested day, or the next 7 days, until we have options.
  const from = date ?? todayLocal(now, tz);
  const to = date ? date : addDays(from, 6);
  let res = await getAvailability({
    businessId: ctx.businessId,
    serviceId: service.id,
    fromDate: from,
    toDate: to,
    staffId: chosenStaff?.id,
    earliestTime: part.from,
    latestTime: part.to,
    now,
  });
  let searchedFurther = false;
  if (res && res.slots.length === 0 && date) {
    res = await getAvailability({
      businessId: ctx.businessId,
      serviceId: service.id,
      fromDate: addDays(date, 1),
      toDate: addDays(date, 7),
      staffId: chosenStaff?.id,
      earliestTime: part.from,
      latestTime: part.to,
      now,
    });
    searchedFurther = true;
  }
  const slots = res?.slots ?? [];
  // Options from the first day that has space, spread across that day.
  const firstDay = slots[0]?.localDate;
  const dayOptions = spreadSlots(
    slots.filter((s) => s.localDate === firstDay),
    ctx.channel === "VOICE" ? 3 : 4,
  );
  return {
    ok: true,
    events: [],
    result: {
      ...base,
      ...(requested ? { requested_time: requested } : {}),
      ...(searchedFurther ? { note: `Nothing free on ${date}; these are the next available times.` } : {}),
      options: dayOptions.map((s) => slotOption(s, tz, staffNames, ctx.visitorTimezone)),
      ...(slots.length === 0 ? { message: "No availability in that period. Offer another week or take a message." } : {}),
    },
  };
}

async function bookTool(args: z.infer<typeof schemas.book_appointment>, ctx: ToolContext): Promise<ToolOutcome> {
  const now = ctx.now ?? new Date();
  const { business, services, staff } = await loadCatalogue(ctx.businessId);
  const tz = business.timezone;
  const { match: service } = matchService(services, args.service);
  if (!service) return fail({ booked: false, error: "Unknown service; check availability first.", options: services.map((s) => s.name) });
  const startAt = parseLocalDateTime(args.start, tz);
  if (!startAt) return fail({ booked: false, error: "Start must be YYYY-MM-DDTHH:mm in Jamaica time." });
  const phone = customerPhone(ctx, args.customer_phone);
  if (!phone) {
    return fail({ booked: false, error: "Ask for the customer's phone or WhatsApp number (we send the confirmation there)." });
  }
  const chosenStaff = matchStaff(staff, args.staff);
  const result = await createBooking({
    businessId: ctx.businessId,
    serviceId: service.id,
    staffId: chosenStaff?.id ?? null,
    startAt,
    customerName: args.customer_name,
    customerPhone: phone,
    notes: args.notes,
    actor: { channel: ctx.channel },
    now,
  });
  if (!result.ok) {
    const names = new Map(staff.map((s) => [s.id, s.name]));
    return fail({
      booked: false,
      reason: result.message,
      alternatives: result.alternatives.map((s) => slotOption(s, tz, names, ctx.visitorTimezone)),
    });
  }
  const b = result.booking;
  const events: ToolEvent[] = [{ type: "booking_created", bookingId: b.id, reference: b.reference }];
  let deposit: Record<string, unknown> | undefined;
  if (service.depositCents) {
    deposit = await sendDepositIfPossible(ctx, b, service.depositCents, events);
  }
  return {
    ok: true,
    events,
    result: {
      booked: true,
      ...bookingSummary(b, tz),
      price: priceLabel(service.priceCents, { isFrom: service.priceIsFrom }),
      confirmation: `A WhatsApp confirmation is being sent to ${formatPhone(phone)}.`,
      ...(deposit ?? {}),
    },
  };
}

async function sendDepositIfPossible(ctx: ToolContext, b: BookingWithRelations, depositCents: number, events: ToolEvent[]) {
  const template = await findTemplate(ctx.businessId, "DEPOSIT");
  if (!template || !b.customerPhone) return { deposit_required: formatJmd(depositCents), deposit_note: "Staff will send the deposit link." };
  const { request, outcome } = await createAndSendPaymentRequest({
    businessId: ctx.businessId,
    templateId: template.id,
    customerPhone: b.customerPhone,
    customerName: b.customerName,
    amountCents: depositCents,
    description: `${b.service.name} deposit`,
    bookingId: b.id,
  });
  events.push({ type: "payment_link_sent", paymentRequestId: request.id });
  return {
    deposit_required: formatJmd(depositCents),
    deposit_link: outcome.status === "SENT" ? "Deposit payment link sent by WhatsApp." : "Deposit link could not be sent yet; staff will follow up.",
  };
}

async function findBookingsTool(args: z.infer<typeof schemas.find_bookings>, ctx: ToolContext): Promise<ToolOutcome> {
  const business = await tenantDb(ctx.businessId).business.findUniqueOrThrow({ where: { id: ctx.businessId } });
  const tz = business.timezone;
  if (args.reference) {
    const auth = await authorizeBooking(ctx, args.reference, args.phone);
    if ("error" in auth) return fail({ found: false, message: auth.error });
    return { ok: true, events: [], result: { found: true, bookings: [bookingSummary(auth.booking, tz)] } };
  }
  if (!ctx.trustedPhone) {
    return fail({ found: false, message: "Ask for the booking reference and the phone number used to book." });
  }
  const list = await findUpcomingBookings(ctx.businessId, { phone: ctx.trustedPhone, now: ctx.now });
  return {
    ok: true,
    events: [],
    result: list.length
      ? { found: true, bookings: list.map((b) => bookingSummary(b, tz)) }
      : { found: false, message: "No upcoming bookings for this number. Ask if they booked with another number or have a reference." },
  };
}

async function rescheduleTool(args: z.infer<typeof schemas.reschedule_booking>, ctx: ToolContext): Promise<ToolOutcome> {
  const { business, staff } = await loadCatalogue(ctx.businessId);
  const tz = business.timezone;
  const auth = await authorizeBooking(ctx, args.reference, args.phone);
  if ("error" in auth) return fail({ rescheduled: false, message: auth.error });
  const newStart = parseLocalDateTime(args.new_start, tz);
  if (!newStart) return fail({ rescheduled: false, error: "new_start must be YYYY-MM-DDTHH:mm in Jamaica time." });
  const chosenStaff = args.staff ? matchStaff(staff, args.staff) : undefined;
  const result = await rescheduleBooking({
    businessId: ctx.businessId,
    bookingId: auth.booking.id,
    newStartAt: newStart,
    staffId: chosenStaff === undefined ? undefined : (chosenStaff?.id ?? null),
    actor: { channel: ctx.channel },
    now: ctx.now,
  });
  if (!result.ok) {
    const names = new Map(staff.map((s) => [s.id, s.name]));
    return fail({ rescheduled: false, reason: result.message, alternatives: result.alternatives.map((s) => slotOption(s, tz, names, ctx.visitorTimezone)) });
  }
  return {
    ok: true,
    events: [{ type: "booking_rescheduled", bookingId: result.booking.id, reference: result.booking.reference }],
    result: { rescheduled: true, ...bookingSummary(result.booking, tz) },
  };
}

async function cancelTool(args: z.infer<typeof schemas.cancel_booking>, ctx: ToolContext): Promise<ToolOutcome> {
  const auth = await authorizeBooking(ctx, args.reference, args.phone);
  if ("error" in auth) return fail({ cancelled: false, message: auth.error });
  const res = await cancelBooking({ businessId: ctx.businessId, bookingId: auth.booking.id, reason: args.reason, actor: { channel: ctx.channel } });
  if (!res.ok) return fail({ cancelled: false, message: res.message });
  return {
    ok: true,
    events: [{ type: "booking_cancelled", bookingId: res.booking.id, reference: res.booking.reference }],
    result: { cancelled: true, reference: res.booking.reference, message: "Cancelled. Mention the cancellation policy only if relevant." },
  };
}

async function captureLeadTool(args: z.infer<typeof schemas.capture_lead>, ctx: ToolContext): Promise<ToolOutcome> {
  const t = tenantDb(ctx.businessId);
  const phone = customerPhone(ctx, args.phone);
  const contact = phone ? await upsertContact(ctx.businessId, phone, args.name) : null;
  const urgency = (args.urgency ?? "NORMAL") as Urgency;
  const lead = await t.lead.create({
    data: {
      businessId: ctx.businessId,
      contactId: contact?.id ?? null,
      name: args.name?.trim() || contact?.name || null,
      phone,
      request: args.request.trim(),
      preferredTime: args.preferred_time ?? null,
      urgency,
      channel: ctx.channel,
    },
  });
  if (urgency === "HIGH" || urgency === "URGENT") {
    await alertStaff(ctx.businessId, {
      title: urgency === "URGENT" ? "URGENT message" : "Priority message",
      summary: args.request,
      customer: [lead.name, phone ? formatPhone(phone) : null].filter(Boolean).join(" ") || "Unknown",
      link: `${env.APP_URL}/dashboard/leads`,
    });
  }
  return {
    ok: true,
    events: [{ type: "lead_captured", leadId: lead.id, urgency }],
    result: { saved: true, message: "Message saved for the team. Tell the customer someone will get back to them, during opening hours." },
  };
}

async function requestHumanTool(args: z.infer<typeof schemas.request_human>, ctx: ToolContext): Promise<ToolOutcome> {
  const urgency = (args.urgency ?? "NORMAL") as Urgency;
  const t = tenantDb(ctx.businessId);
  const business = await t.business.findUniqueOrThrow({ where: { id: ctx.businessId } });
  const events: ToolEvent[] = [{ type: "handoff", reason: args.reason, urgency }];
  if (ctx.channel === "VOICE") {
    return {
      ok: true,
      events,
      result: business.handoffNumber
        ? {
            transfer: true,
            instruction:
              "Tell the caller you are connecting them to a team member now, then use the transfer_to_staff tool. " +
              "If the transfer fails or nobody answers, apologise and take a message with capture_lead.",
          }
        : { transfer: false, instruction: "No one is available to take transfers. Take a message with capture_lead instead." },
    };
  }
  if (ctx.conversationId) {
    await t.conversation.update({
      where: { id: ctx.conversationId },
      data: { status: "HUMAN", handoffReason: args.reason.slice(0, 300), handoffAt: new Date(), unreadForStaff: { increment: 1 } },
    });
  }
  await alertStaff(ctx.businessId, {
    title: urgency === "URGENT" ? "URGENT: customer needs a person" : "Customer wants a person",
    summary: args.reason,
    customer: ctx.trustedPhone ? formatPhone(ctx.trustedPhone) : "Website visitor",
    link: `${env.APP_URL}/dashboard/inbox${ctx.conversationId ? `/${ctx.conversationId}` : ""}`,
  });
  return {
    ok: true,
    events,
    result: {
      handed_off: true,
      instruction: "Tell the customer a team member has been alerted and will reply here as soon as possible (during opening hours). Do not keep answering.",
    },
  };
}

async function paymentLinkTool(args: z.infer<typeof schemas.send_payment_link>, ctx: ToolContext): Promise<ToolOutcome> {
  const t = tenantDb(ctx.businessId);
  let booking: BookingWithRelations | null = null;
  if (args.booking_reference) {
    const auth = await authorizeBooking(ctx, args.booking_reference, null);
    if ("error" in auth) return fail({ sent: false, message: auth.error });
    booking = auth.booking;
  }
  const phone = booking?.customerPhone ?? ctx.trustedPhone ?? null;
  if (!phone) return fail({ sent: false, message: "Payment links go by WhatsApp; ask for the customer's WhatsApp number and booking reference." });
  const template = await findTemplate(ctx.businessId, args.kind as PaymentKind);
  if (!template) return fail({ sent: false, message: "This business hasn't set up online payment links. Explain how to pay in person or take a message." });
  let amountCents: number | null = args.amount_jmd ? Math.round(args.amount_jmd * 100) : null;
  if (!amountCents && booking) amountCents = args.kind === "DEPOSIT" ? booking.service.depositCents : booking.service.priceCents;
  if (!amountCents) amountCents = template.defaultAmountCents;
  if (!amountCents) return fail({ sent: false, message: "I don't know the amount. Take a message so staff can send the link." });
  const contact = await t.contact.findFirst({ where: { phone } });
  const { request, outcome } = await createAndSendPaymentRequest({
    businessId: ctx.businessId,
    templateId: template.id,
    customerPhone: phone,
    customerName: booking?.customerName ?? contact?.name ?? null,
    amountCents,
    description: booking ? `${booking.service.name} ${args.kind === "DEPOSIT" ? "deposit" : "payment"}` : template.label,
    bookingId: booking?.id ?? null,
  });
  return {
    ok: outcome.status === "SENT",
    events: [{ type: "payment_link_sent", paymentRequestId: request.id }],
    result:
      outcome.status === "SENT"
        ? { sent: true, amount: formatJmd(amountCents), reference: request.reference, via: "WhatsApp" }
        : { sent: false, message: "The link couldn't be sent by WhatsApp right now; staff will follow up." },
  };
}
