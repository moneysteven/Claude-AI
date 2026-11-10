import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cancelBooking, createBooking, getAvailability, rescheduleBooking } from "@/lib/booking/service";
import { db } from "@/lib/db";
import { holidaysForYear } from "@/lib/holidays";
import { addDays, localToUtc, todayLocal } from "@/lib/time";
import { createSalon, ensureTestDb, nextWeekday, resetDb, type Fixture } from "./helpers";

describe("booking service", () => {
  let f: Fixture;
  beforeAll(ensureTestDb);
  beforeEach(async () => {
    await resetDb();
    f = await createSalon("booking-salon");
  });

  const book = (startAt: Date, staffId?: string, phone = "+18765550142") =>
    createBooking({
      businessId: f.business.id,
      serviceId: f.serviceId,
      staffId,
      startAt,
      customerName: "Shanice Brown",
      customerPhone: phone,
      actor: { channel: "WEB" },
    });

  it("books a free slot, assigns a stylist and sends a WhatsApp confirmation", async () => {
    const res = await book(localToUtc(nextWeekday(3), "10:00"));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.booking.reference).toMatch(/^[A-Z0-9]{1,2}-[A-Z0-9]{4}$/);
    expect(res.booking.staffId).not.toBeNull();
    const msg = await db.message.findFirst({ where: { businessId: f.business.id, direction: "OUTBOUND" } });
    expect(msg?.templateName).toBe("booking_confirmation"); // outside a 24h window -> template
    expect((await db.booking.findUniqueOrThrow({ where: { id: res.booking.id } })).confirmationSentAt).not.toBeNull();
  });

  it("refuses double booking the same stylist and offers alternatives", async () => {
    const at = localToUtc(nextWeekday(3), "10:00");
    expect((await book(at, f.staff.tasha)).ok).toBe(true);
    const clash = await book(at, f.staff.tasha, "+18765550143");
    expect(clash.ok).toBe(false);
    if (clash.ok) return;
    expect(clash.code).toBe("NOT_AVAILABLE");
    expect(clash.alternatives.length).toBeGreaterThan(0);
    // ...but another stylist can still take that time.
    expect((await book(at, f.staff.keisha, "+18765550144")).ok).toBe(true);
  });

  it("never double-books under concurrent requests", async () => {
    const at = localToUtc(nextWeekday(4), "11:00");
    const results = await Promise.all([1, 2, 3, 4].map((i) => book(at, f.staff.tasha, `+1876555015${i}`)));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await db.booking.count({ where: { staffId: f.staff.tasha, startAt: at, status: "CONFIRMED" } })).toBe(1);
  });

  it("rejects times outside opening hours, on Sundays and on public holidays", async () => {
    expect((await book(localToUtc(nextWeekday(3), "07:00"))).ok).toBe(false);
    expect((await book(localToUtc(nextWeekday(0), "10:00"))).ok).toBe(false);
    const year = Number(todayLocal().slice(0, 4)) + 1;
    const heroes = holidaysForYear(year).find((h) => h.key === "national_heroes_day")!.date;
    const fewDaysBefore = localToUtc(addDays(heroes, -5), "08:00");
    const res = await getAvailability({ businessId: f.business.id, serviceId: f.serviceId, fromDate: heroes, toDate: heroes, now: fewDaysBefore });
    expect(res?.slots).toHaveLength(0);
    // The day after (a normal Tuesday) is open.
    const after = await getAvailability({ businessId: f.business.id, serviceId: f.serviceId, fromDate: addDays(heroes, 1), toDate: addDays(heroes, 1), now: fewDaysBefore });
    expect(after?.slots.length).toBeGreaterThan(0);
  });

  it("reschedules and cancels, freeing the slot", async () => {
    const day = nextWeekday(5);
    const first = await book(localToUtc(day, "10:00"), f.staff.tasha);
    if (!first.ok) throw new Error(first.message);
    const moved = await rescheduleBooking({ businessId: f.business.id, bookingId: first.booking.id, newStartAt: localToUtc(day, "14:00"), actor: { channel: "WHATSAPP" } });
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(moved.booking.startAt.toISOString()).toBe(localToUtc(day, "14:00").toISOString());
    expect(moved.booking.reminder24SentAt).toBeNull();
    // Old slot is free again.
    expect((await book(localToUtc(day, "10:00"), f.staff.tasha, "+18765550160")).ok).toBe(true);
    const cancelled = await cancelBooking({ businessId: f.business.id, bookingId: first.booking.id, actor: { channel: "WHATSAPP" } });
    expect(cancelled.ok).toBe(true);
    expect((await book(localToUtc(day, "14:00"), f.staff.tasha, "+18765550161")).ok).toBe(true);
  });
});
