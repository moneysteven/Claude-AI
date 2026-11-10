import { Prisma, type Booking, type Channel, type Service, type Staff } from "@prisma/client";
import { checkSlot, findSlots, type BusyInterval, type Slot, type StaffAvailabilityInput } from "../availability";
import { getBusiness, loadCalendarRules } from "../business";
import { calendarFor } from "../calendar";
import { randomCode } from "../crypto";
import { logger } from "../logger";
import { addDays, addMinutes, formatDateTimeSpoken, localDateOf, localToUtc, todayLocal, type LocalDate, type LocalTime } from "../time";
import { tenantDb, type TenantDb } from "../tenant";
import { upsertContact } from "../contacts";
import { audit } from "../audit";
import { enqueue, JOB } from "../jobs/queue";

export type BookingWithRelations = Booking & { service: Service; staff: Staff | null };

export type BookingFailureCode = "NOT_AVAILABLE" | "INVALID" | "NOT_FOUND" | "IN_PAST";

export type BookingResult =
  | { ok: true; booking: BookingWithRelations }
  | { ok: false; code: BookingFailureCode; message: string; alternatives: Slot[] };

export interface Actor {
  channel: Channel;
  userId?: string | null;
}

const ACTIVE_STATUSES = ["CONFIRMED"] as const;

interface AvailabilityContext {
  service: Service;
  staff: (Staff & { schedules: Prisma.StaffScheduleGetPayload<object>[]; timeOff: Prisma.StaffTimeOffGetPayload<object>[] })[];
  staffInputs: StaffAvailabilityInput[];
  busy: BusyInterval[];
  rules: Awaited<ReturnType<typeof loadCalendarRules>>;
  business: Awaited<ReturnType<typeof getBusiness>>;
}

/** Staff who can perform a service. No explicit links = every bookable staff member. */
async function qualifiedStaff(businessId: string, serviceId: string) {
  const t = tenantDb(businessId);
  const all = await t.staff.findMany({
    where: { active: true, acceptsBookings: true },
    include: { services: true, schedules: true, timeOff: true },
    orderBy: { sortOrder: "asc" },
  });
  const linked = all.filter((s) => s.services.some((l) => l.serviceId === serviceId));
  const anyLinksForService = all.some((s) => s.services.some((l) => l.serviceId === serviceId));
  return anyLinksForService ? linked : all;
}

async function loadContext(
  businessId: string,
  serviceId: string,
  from: Date,
  to: Date,
  excludeBookingId?: string,
): Promise<AvailabilityContext | null> {
  const t = tenantDb(businessId);
  const service = await t.service.findFirst({ where: { id: serviceId, active: true, bookable: true } });
  if (!service) return null;
  const [business, rules, staff, bookings] = await Promise.all([
    getBusiness(businessId),
    loadCalendarRules(businessId),
    qualifiedStaff(businessId, serviceId),
    t.booking.findMany({
      where: {
        status: { in: [...ACTIVE_STATUSES] },
        startAt: { lt: to },
        endAt: { gt: from },
        ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
      },
      select: { staffId: true, startAt: true, endAt: true },
    }),
  ]);

  const busy: BusyInterval[] = bookings.map((b) => ({ staffId: b.staffId, startAt: b.startAt, endAt: b.endAt }));

  // External calendar busy time (owner blocked a morning in Google Calendar, etc.).
  try {
    const { provider, defaultCalendarId } = calendarFor(business);
    if (provider.type !== "INTERNAL") {
      const calendarToStaff = new Map<string, string | null>();
      for (const s of staff) if (s.calendarId) calendarToStaff.set(s.calendarId, s.id);
      if (defaultCalendarId && !calendarToStaff.has(defaultCalendarId)) calendarToStaff.set(defaultCalendarId, null);
      const external = await provider.listBusy({ calendarIds: [...calendarToStaff.keys()], from, to });
      for (const e of external) busy.push({ staffId: calendarToStaff.get(e.calendarId) ?? null, startAt: e.startAt, endAt: e.endAt });
    }
  } catch (err) {
    // Degrade to Conroy's own bookings rather than failing a live call; the alert tells Steven.
    logger.error({ err: (err as Error).message, businessId }, "calendar busy lookup failed");
    void enqueue(JOB.ADMIN_ALERT, { subject: "Calendar lookup failed", message: (err as Error).message, businessId }).catch(() => {});
  }

  const staffInputs: StaffAvailabilityInput[] = staff.map((s) => ({
    id: s.id,
    name: s.name,
    schedule: s.schedules.map((r) => ({
      weekday: r.weekday,
      isOff: r.isOff,
      startTime: r.startTime,
      endTime: r.endTime,
      breakStart: r.breakStart,
      breakEnd: r.breakEnd,
    })),
    timeOff: s.timeOff.map((o) => ({ startAt: o.startAt, endAt: o.endAt })),
  }));

  return { service, staff, staffInputs, busy, rules, business };
}

export interface AvailabilityParams {
  businessId: string;
  serviceId: string;
  fromDate: LocalDate;
  toDate: LocalDate;
  staffId?: string | null;
  earliestTime?: LocalTime;
  latestTime?: LocalTime;
  limit?: number;
  now?: Date;
  excludeBookingId?: string;
}

export async function getAvailability(p: AvailabilityParams) {
  const tzFrom = localToUtc(p.fromDate, "00:00");
  const tzTo = localToUtc(addDays(p.toDate, 1), "00:00");
  const ctx = await loadContext(p.businessId, p.serviceId, addMinutes(tzFrom, -24 * 60), addMinutes(tzTo, 24 * 60), p.excludeBookingId);
  if (!ctx) return null;
  const staffInputs = p.staffId ? ctx.staffInputs.filter((s) => s.id === p.staffId) : ctx.staffInputs;
  const slots = findSlots({
    rules: ctx.rules,
    fromDate: p.fromDate,
    toDate: p.toDate,
    now: p.now ?? new Date(),
    slotIntervalMin: ctx.business.slotIntervalMin,
    leadTimeMin: ctx.business.bookingLeadTimeMin,
    maxDaysAhead: ctx.business.maxDaysAhead,
    durationMin: ctx.service.durationMin,
    bufferMin: ctx.service.bufferMin,
    staff: staffInputs,
    busy: ctx.busy,
    earliestTime: p.earliestTime,
    latestTime: p.latestTime,
    limit: p.limit,
  });
  return { slots, service: ctx.service, staff: ctx.staff.map((s) => ({ id: s.id, name: s.name })) };
}

/** Is one exact start time free? Returns the free staff ids ([] = free, business has no staff) or null. */
export async function checkTime(businessId: string, serviceId: string, startAt: Date, staffId?: string | null, now: Date = new Date()) {
  const ctx = await loadContext(businessId, serviceId, addMinutes(startAt, -24 * 60), addMinutes(startAt, 24 * 60));
  if (!ctx) return null;
  return checkSlot(
    {
      rules: ctx.rules,
      now,
      slotIntervalMin: ctx.business.slotIntervalMin,
      leadTimeMin: ctx.business.bookingLeadTimeMin,
      maxDaysAhead: ctx.business.maxDaysAhead,
      durationMin: ctx.service.durationMin,
      bufferMin: ctx.service.bufferMin,
      staff: ctx.staffInputs,
      busy: ctx.busy,
    },
    startAt,
    staffId ?? null,
  );
}

/** Next few free slots from a date onwards (used for "that time is taken, how about..."). */
export async function suggestAlternatives(businessId: string, serviceId: string, fromDate: LocalDate, staffId?: string | null, count = 3) {
  const res = await getAvailability({ businessId, serviceId, fromDate, toDate: addDays(fromDate, 6), staffId, limit: count * 4 });
  if (!res) return [];
  return res.slots.slice(0, count);
}

function referencePrefix(name: string): string {
  const letters = name
    .replace(/'s\b/gi, "")
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z]/gi, "")[0])
    .filter(Boolean)
    .join("")
    .toUpperCase();
  return (letters || "CR").slice(0, 2);
}

/** Least-booked free staff member that day (spreads the work fairly). */
async function pickStaff(businessId: string, candidates: string[], day: LocalDate): Promise<string> {
  if (candidates.length === 1) return candidates[0];
  const t = tenantDb(businessId);
  const from = localToUtc(day, "00:00");
  const to = localToUtc(addDays(day, 1), "00:00");
  const counts = await t.booking.groupBy({
    by: ["staffId"],
    where: { staffId: { in: candidates }, status: "CONFIRMED", startAt: { gte: from, lt: to } },
    _count: { _all: true },
  });
  const countOf = (id: string) => counts.find((c) => c.staffId === id)?._count._all ?? 0;
  return [...candidates].sort((a, b) => countOf(a) - countOf(b))[0];
}

type Tx = Parameters<Parameters<TenantDb["$transaction"]>[0]>[0];

async function lockAndCheckConflict(
  tx: Tx,
  businessId: string,
  staffId: string | null,
  startAt: Date,
  endAt: Date,
  excludeBookingId?: string,
): Promise<boolean> {
  // Serialise bookings per resource so two callers cannot take the same slot.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`booking:${businessId}:${staffId ?? "business"}`}))`;
  const clash = await tx.booking.findFirst({
    where: {
      businessId,
      status: "CONFIRMED",
      startAt: { lt: endAt },
      endAt: { gt: startAt },
      ...(staffId ? { staffId } : {}),
      ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
    },
    select: { id: true },
  });
  return Boolean(clash);
}

export interface CreateBookingParams {
  businessId: string;
  serviceId: string;
  staffId?: string | null;
  startAt: Date;
  customerName: string;
  customerPhone?: string | null;
  notes?: string | null;
  actor: Actor;
  now?: Date;
}

export async function createBooking(p: CreateBookingParams): Promise<BookingResult> {
  const now = p.now ?? new Date();
  const day = localDateOf(p.startAt);
  if (p.startAt.getTime() <= now.getTime()) {
    return { ok: false, code: "IN_PAST", message: "That time has already passed.", alternatives: [] };
  }
  const name = p.customerName.trim();
  if (name.length < 1 || name.length > 120) {
    return { ok: false, code: "INVALID", message: "A customer name is required.", alternatives: [] };
  }

  const ctx = await loadContext(p.businessId, p.serviceId, addMinutes(p.startAt, -24 * 60), addMinutes(p.startAt, 24 * 60));
  if (!ctx) return { ok: false, code: "INVALID", message: "That service isn't available for booking.", alternatives: [] };

  const free = checkSlot(
    {
      rules: ctx.rules,
      now,
      slotIntervalMin: ctx.business.slotIntervalMin,
      leadTimeMin: ctx.business.bookingLeadTimeMin,
      maxDaysAhead: ctx.business.maxDaysAhead,
      durationMin: ctx.service.durationMin,
      bufferMin: ctx.service.bufferMin,
      staff: ctx.staffInputs,
      busy: ctx.busy,
    },
    p.startAt,
    p.staffId ?? null,
  );
  if (free === null) {
    return {
      ok: false,
      code: "NOT_AVAILABLE",
      message: "That time isn't available.",
      alternatives: await suggestAlternatives(p.businessId, p.serviceId, day, p.staffId, 3),
    };
  }

  const hasStaff = ctx.staffInputs.length > 0;
  const staffId = hasStaff ? (p.staffId ?? (await pickStaff(p.businessId, free, day))) : null;
  const endAt = addMinutes(p.startAt, ctx.service.durationMin + ctx.service.bufferMin);
  const contact = p.customerPhone ? await upsertContact(p.businessId, p.customerPhone, name) : null;
  const prefix = referencePrefix(ctx.business.name);

  const t = tenantDb(p.businessId);
  let booking: BookingWithRelations | null = null;
  for (let attempt = 0; attempt < 5 && !booking; attempt++) {
    try {
      booking = await t.$transaction(async (tx) => {
        if (await lockAndCheckConflict(tx, p.businessId, staffId, p.startAt, endAt)) return null;
        return tx.booking.create({
          data: {
            businessId: p.businessId,
            reference: `${prefix}-${randomCode(4)}`,
            serviceId: ctx.service.id,
            staffId,
            contactId: contact?.id ?? null,
            startAt: p.startAt,
            endAt,
            channel: p.actor.channel,
            customerName: name,
            customerPhone: p.customerPhone ?? null,
            notes: p.notes?.slice(0, 1000) ?? null,
          },
          include: { service: true, staff: true },
        });
      });
      if (!booking) {
        return {
          ok: false,
          code: "NOT_AVAILABLE",
          message: "Someone just took that time.",
          alternatives: await suggestAlternatives(p.businessId, p.serviceId, day, p.staffId, 3),
        };
      }
    } catch (err) {
      // Reference collision: try a new code.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
      throw err;
    }
  }
  if (!booking) throw new Error("Could not allocate a booking reference");

  await mirrorToCalendar(p.businessId, booking, "create");
  await audit({ businessId: p.businessId, userId: p.actor.userId, action: "booking.create", entityType: "Booking", entityId: booking.id, details: { channel: p.actor.channel } });
  await enqueue(JOB.BOOKING_NOTIFY, { businessId: p.businessId, bookingId: booking.id, kind: "confirmed" });
  return { ok: true, booking };
}

export interface RescheduleParams {
  businessId: string;
  bookingId: string;
  newStartAt: Date;
  staffId?: string | null;
  actor: Actor;
  now?: Date;
}

export async function rescheduleBooking(p: RescheduleParams): Promise<BookingResult> {
  const now = p.now ?? new Date();
  const t = tenantDb(p.businessId);
  const existing = await t.booking.findFirst({ where: { id: p.bookingId }, include: { service: true, staff: true } });
  if (!existing || existing.status !== "CONFIRMED") {
    return { ok: false, code: "NOT_FOUND", message: "I couldn't find an active booking to change.", alternatives: [] };
  }
  if (p.newStartAt.getTime() <= now.getTime()) {
    return { ok: false, code: "IN_PAST", message: "That time has already passed.", alternatives: [] };
  }
  const day = localDateOf(p.newStartAt);
  const ctx = await loadContext(
    p.businessId,
    existing.serviceId,
    addMinutes(p.newStartAt, -24 * 60),
    addMinutes(p.newStartAt, 24 * 60),
    existing.id,
  );
  if (!ctx) return { ok: false, code: "INVALID", message: "That service can no longer be booked.", alternatives: [] };
  const wantedStaff = p.staffId === undefined ? existing.staffId : p.staffId;
  const free = checkSlot(
    {
      rules: ctx.rules,
      now,
      slotIntervalMin: ctx.business.slotIntervalMin,
      leadTimeMin: ctx.business.bookingLeadTimeMin,
      maxDaysAhead: ctx.business.maxDaysAhead,
      durationMin: ctx.service.durationMin,
      bufferMin: ctx.service.bufferMin,
      staff: ctx.staffInputs,
      busy: ctx.busy,
    },
    p.newStartAt,
    wantedStaff,
  );
  // If the same stylist is busy, accept anyone free unless a specific person was asked for.
  let staffId: string | null = wantedStaff ?? null;
  let freeIds = free;
  if (freeIds === null && p.staffId === undefined && existing.staffId) {
    freeIds = checkSlot(
      {
        rules: ctx.rules,
        now,
        slotIntervalMin: ctx.business.slotIntervalMin,
        leadTimeMin: ctx.business.bookingLeadTimeMin,
        maxDaysAhead: ctx.business.maxDaysAhead,
        durationMin: ctx.service.durationMin,
        bufferMin: ctx.service.bufferMin,
        staff: ctx.staffInputs,
        busy: ctx.busy,
      },
      p.newStartAt,
      null,
    );
    staffId = freeIds && freeIds.length > 0 ? await pickStaff(p.businessId, freeIds, day) : null;
  }
  if (freeIds === null) {
    return {
      ok: false,
      code: "NOT_AVAILABLE",
      message: "That time isn't available.",
      alternatives: await suggestAlternatives(p.businessId, existing.serviceId, day, wantedStaff, 3),
    };
  }
  if (ctx.staffInputs.length > 0 && !staffId) staffId = await pickStaff(p.businessId, freeIds, day);

  const endAt = addMinutes(p.newStartAt, ctx.service.durationMin + ctx.service.bufferMin);
  const updated = await t.$transaction(async (tx) => {
    if (await lockAndCheckConflict(tx, p.businessId, staffId, p.newStartAt, endAt, existing.id)) return null;
    return tx.booking.update({
      where: { id: existing.id },
      data: { startAt: p.newStartAt, endAt, staffId, reminder24SentAt: null, reminder2SentAt: null },
      include: { service: true, staff: true },
    });
  });
  if (!updated) {
    return {
      ok: false,
      code: "NOT_AVAILABLE",
      message: "Someone just took that time.",
      alternatives: await suggestAlternatives(p.businessId, existing.serviceId, day, wantedStaff, 3),
    };
  }
  await mirrorToCalendar(p.businessId, updated, "update");
  await audit({
    businessId: p.businessId,
    userId: p.actor.userId,
    action: "booking.reschedule",
    entityType: "Booking",
    entityId: updated.id,
    details: { channel: p.actor.channel, from: existing.startAt.toISOString(), to: updated.startAt.toISOString() },
  });
  await enqueue(JOB.BOOKING_NOTIFY, { businessId: p.businessId, bookingId: updated.id, kind: "rescheduled" });
  return { ok: true, booking: updated };
}

export async function cancelBooking(p: { businessId: string; bookingId: string; reason?: string | null; actor: Actor; notifyCustomer?: boolean }) {
  const t = tenantDb(p.businessId);
  const existing = await t.booking.findFirst({ where: { id: p.bookingId } });
  if (!existing || existing.status !== "CONFIRMED") return { ok: false as const, message: "I couldn't find an active booking to cancel." };
  const updated = await t.booking.update({
    where: { id: existing.id },
    data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: p.reason?.slice(0, 500) ?? null },
    include: { service: true, staff: true },
  });
  await mirrorToCalendar(p.businessId, updated, "delete");
  await audit({ businessId: p.businessId, userId: p.actor.userId, action: "booking.cancel", entityType: "Booking", entityId: updated.id, details: { channel: p.actor.channel } });
  if (p.notifyCustomer !== false) await enqueue(JOB.BOOKING_NOTIFY, { businessId: p.businessId, bookingId: updated.id, kind: "cancelled" });
  return { ok: true as const, booking: updated };
}

/** Upcoming active bookings for a phone number and/or reference. */
export async function findUpcomingBookings(businessId: string, q: { phone?: string | null; reference?: string | null; now?: Date }) {
  if (!q.phone && !q.reference) return [];
  const t = tenantDb(businessId);
  return t.booking.findMany({
    where: {
      status: "CONFIRMED",
      startAt: { gte: q.now ?? new Date() },
      ...(q.reference ? { reference: q.reference.trim().toUpperCase() } : {}),
      ...(q.phone ? { customerPhone: q.phone } : {}),
    },
    include: { service: true, staff: true },
    orderBy: { startAt: "asc" },
    take: 5,
  });
}

/** Mirror a booking change to the external calendar. Failures never undo the booking. */
async function mirrorToCalendar(businessId: string, booking: BookingWithRelations, action: "create" | "update" | "delete") {
  try {
    const business = await getBusiness(businessId);
    const { provider, defaultCalendarId } = calendarFor(business);
    if (provider.type === "INTERNAL") return;
    const calendarId = booking.staff?.calendarId ?? defaultCalendarId;
    if (!calendarId) return;
    const input = {
      calendarId,
      bookingId: booking.id,
      reference: booking.reference,
      title: `${booking.service.name} - ${booking.customerName}`,
      description: [
        `Booked by ${business.assistantName} (${booking.channel.toLowerCase()})`,
        `Ref: ${booking.reference}`,
        booking.customerPhone ? `Phone: ${booking.customerPhone}` : null,
        booking.staff ? `With: ${booking.staff.name}` : null,
        booking.notes ? `Notes: ${booking.notes}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
      startAt: booking.startAt,
      endAt: booking.endAt,
      timezone: business.timezone,
      attendeeName: booking.customerName,
      attendeePhone: booking.customerPhone,
    };
    const t = tenantDb(businessId);
    if (action === "create") {
      const externalId = await provider.createEvent(input);
      if (externalId) await t.booking.update({ where: { id: booking.id }, data: { externalEventId: externalId } });
    } else if (action === "update" && booking.externalEventId) {
      const externalId = await provider.updateEvent(booking.externalEventId, input);
      if (externalId && externalId !== booking.externalEventId) {
        await t.booking.update({ where: { id: booking.id }, data: { externalEventId: externalId } });
      }
    } else if (action === "update") {
      const externalId = await provider.createEvent(input);
      if (externalId) await t.booking.update({ where: { id: booking.id }, data: { externalEventId: externalId } });
    } else if (action === "delete" && booking.externalEventId) {
      await provider.deleteEvent(booking.externalEventId, calendarId, booking.cancelReason ?? undefined);
    }
  } catch (err) {
    logger.error({ err: (err as Error).message, businessId, bookingId: booking.id, action }, "calendar mirror failed");
    void enqueue(JOB.ADMIN_ALERT, {
      subject: "Calendar sync failed",
      message: `Booking ${booking.reference} (${action}) was saved in Conroy but not synced to the calendar: ${(err as Error).message}`,
      businessId,
    }).catch(() => {});
  }
}

export function describeBooking(b: BookingWithRelations, tz: string): string {
  return `${b.service.name}${b.staff ? ` with ${b.staff.name}` : ""} on ${formatDateTimeSpoken(b.startAt, tz)} (ref ${b.reference})`;
}

export function todayFor(tz: string) {
  return todayLocal(new Date(), tz);
}
