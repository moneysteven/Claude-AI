import { execSync } from "node:child_process";
import type { Business } from "@prisma/client";
import { db } from "@/lib/db";
import { JAMAICA_HOLIDAY_DEFAULTS } from "@/lib/holidays";
import { addDays, todayLocal, weekdayOf, type LocalDate } from "@/lib/time";
import { clearHolidayCache } from "@/lib/business";
import { resetRateLimits } from "@/lib/ratelimit";

/** Apply migrations to the test database once per worker. */
let migrated: Promise<void> | null = null;
export function ensureTestDb(): Promise<void> {
  if (!process.env.DATABASE_URL?.includes("test")) {
    throw new Error("Refusing to run integration tests against a non-test database (DATABASE_URL must contain 'test').");
  }
  migrated ??= Promise.resolve().then(() => {
    execSync("npx prisma migrate deploy", { stdio: "ignore", env: { ...process.env } });
  });
  return migrated;
}

export async function resetDb() {
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length) {
    await db.$executeRawUnsafe(`TRUNCATE TABLE ${tables.map((t) => `"public"."${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  }
  clearHolidayCache();
  resetRateLimits();
}

/** Next date (>= 2 days from today, Jamaica time) that falls on a given weekday. */
export function nextWeekday(weekday: number, minDaysAhead = 2): LocalDate {
  let d = addDays(todayLocal(), minDaysAhead);
  while (weekdayOf(d) !== weekday) d = addDays(d, 1);
  return d;
}

export interface Fixture {
  business: Business;
  serviceId: string;
  depositServiceId: string;
  staff: { tasha: string; keisha: string };
}

/** A small salon: Mon-Sat 9-5, closed Sunday and public holidays, two stylists. */
export async function createSalon(slug: string, overrides: Partial<Business> = {}): Promise<Fixture> {
  const business = await db.business.create({
    data: {
      slug,
      name: overrides.name ?? `Salon ${slug}`,
      category: "SALON",
      phoneMain: "+18765550123",
      ownerWhatsapp: "+18765550100",
      handoffNumber: "+18765550101",
      whatsappProvider: "CONSOLE",
      waPhoneNumberId: overrides.waPhoneNumberId ?? `pnid-${slug}`,
      retellAgentId: overrides.retellAgentId ?? `agent-${slug}`,
      voiceNumber: overrides.voiceNumber ?? null,
      slotIntervalMin: 30,
      bookingLeadTimeMin: 60,
      widgetOrigins: overrides.widgetOrigins ?? [],
    },
  });
  const businessId = business.id;
  await db.businessHours.createMany({
    data: [0, 1, 2, 3, 4, 5, 6].map((weekday) =>
      weekday === 0 ? { businessId, weekday, isClosed: true } : { businessId, weekday, isClosed: false, openTime: "09:00", closeTime: "17:00" },
    ),
  });
  await db.businessHolidaySetting.createMany({ data: JAMAICA_HOLIDAY_DEFAULTS.map((h) => ({ businessId, holidayKey: h.key, isOpen: false })) });
  const service = await db.service.create({ data: { businessId, name: "Silk Press", durationMin: 90, priceCents: 650000 } });
  const braids = await db.service.create({ data: { businessId, name: "Box Braids", durationMin: 240, priceCents: 1500000, priceIsFrom: true, depositCents: 500000 } });
  const tasha = await db.staff.create({ data: { businessId, name: "Tasha" } });
  const keisha = await db.staff.create({ data: { businessId, name: "Keisha" } });
  await db.staffService.createMany({
    data: [
      { businessId, staffId: tasha.id, serviceId: service.id },
      { businessId, staffId: keisha.id, serviceId: service.id },
      { businessId, staffId: keisha.id, serviceId: braids.id },
    ],
  });
  await db.faq.create({ data: { businessId, question: "Is there parking?", answer: "Yes, free parking at the back.", keywords: ["parking"] } });
  await db.paymentLinkTemplate.create({
    data: { businessId, provider: "FYGARO", kind: "DEPOSIT", label: "Deposit", urlTemplate: "https://fygaro.com/en/pb/test/?amount={amount}&client_reference={reference}" },
  });
  return { business, serviceId: service.id, depositServiceId: braids.id, staff: { tasha: tasha.id, keisha: keisha.id } };
}
