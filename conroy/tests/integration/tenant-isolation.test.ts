import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { executeTool } from "@/lib/assistant/tools";
import { createBooking } from "@/lib/booking/service";
import { encrypt } from "@/lib/crypto";
import { db } from "@/lib/db";
import { tenantDb, TenantViolationError } from "@/lib/tenant";
import { localToUtc } from "@/lib/time";
import { GET as availabilityGET } from "@/app/api/public/[slug]/availability/route";
import { createSalon, ensureTestDb, nextWeekday, resetDb, type Fixture } from "./helpers";

describe("tenant isolation", () => {
  let a: Fixture;
  let b: Fixture;
  let bBookingId: string;
  let bReference: string;

  beforeAll(ensureTestDb);
  beforeEach(async () => {
    await resetDb();
    a = await createSalon("salon-a");
    b = await createSalon("salon-b");
    const day = nextWeekday(2);
    const res = await createBooking({
      businessId: b.business.id,
      serviceId: b.serviceId,
      startAt: localToUtc(day, "10:00"),
      customerName: "Bea Brown",
      customerPhone: "+18765550199",
      actor: { channel: "DASHBOARD" },
    });
    if (!res.ok) throw new Error(res.message);
    bBookingId = res.booking.id;
    bReference = res.booking.reference;
    // The booking confirmation already opened B's WhatsApp conversation with this customer.
    const conv = await db.conversation.findFirstOrThrow({ where: { businessId: b.business.id, channel: "WHATSAPP", externalId: "+18765550199" } });
    await db.message.create({
      data: { businessId: b.business.id, conversationId: conv.id, direction: "INBOUND", sender: "CUSTOMER", bodyEnc: encrypt("secret B message") },
    });
  });

  it("never returns another business's rows from list queries", async () => {
    const ta = tenantDb(a.business.id);
    expect(await ta.booking.findMany({})).toHaveLength(0);
    expect(await ta.message.findMany({})).toHaveLength(0);
    expect(await ta.conversation.count({})).toBe(0);
    expect(await ta.contact.findMany({})).toHaveLength(0);
    expect(await ta.service.count({})).toBe(2); // only A's own services
  });

  it("cannot read another business's row even by its id", async () => {
    const ta = tenantDb(a.business.id);
    expect(await ta.booking.findFirst({ where: { id: bBookingId } })).toBeNull();
    expect(await ta.booking.findUnique({ where: { id: bBookingId } })).toBeNull();
    expect(await ta.business.findFirst({ where: { id: b.business.id } })).toBeNull();
  });

  it("cannot update or delete another business's rows", async () => {
    const ta = tenantDb(a.business.id);
    await expect(ta.booking.update({ where: { id: bBookingId }, data: { status: "CANCELLED" } })).rejects.toThrow();
    const res = await ta.booking.updateMany({ where: { id: bBookingId }, data: { status: "CANCELLED" } });
    expect(res.count).toBe(0);
    const del = await ta.message.deleteMany({});
    expect(del.count).toBe(0);
    expect((await db.booking.findUniqueOrThrow({ where: { id: bBookingId } })).status).toBe("CONFIRMED");
    expect(await db.message.count({ where: { businessId: b.business.id } })).toBe(2); // confirmation + customer message
  });

  it("cannot create rows for another business", async () => {
    const ta = tenantDb(a.business.id);
    await expect(
      ta.lead.create({ data: { businessId: b.business.id, request: "sneaky", channel: "WEB" } }),
    ).rejects.toBeInstanceOf(TenantViolationError);
    const lead = await ta.lead.create({ data: { businessId: a.business.id, request: "legit", channel: "WEB" } });
    expect(lead.businessId).toBe(a.business.id);
  });

  it("assistant tools for business A can't see or change business B's booking", async () => {
    const ctx = { businessId: a.business.id, channel: "WHATSAPP" as const, trustedPhone: "+18765550199" };
    const found = await executeTool("find_bookings", { reference: bReference }, ctx);
    expect(found.ok).toBe(false);
    const cancel = await executeTool("cancel_booking", { reference: bReference }, ctx);
    expect(cancel.ok).toBe(false);
    expect((await db.booking.findUniqueOrThrow({ where: { id: bBookingId } })).status).toBe("CONFIRMED");
  });

  it("the public API of business A rejects business B's service id", async () => {
    const url = `http://localhost/api/public/salon-a/availability?serviceId=${b.serviceId}&date=${nextWeekday(3)}`;
    const res = await availabilityGET(new Request(url), { params: Promise.resolve({ slug: "salon-a" }) });
    expect(res.status).toBe(404);
  });
});
