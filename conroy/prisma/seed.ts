import "../src/lib/env-bootstrap";

import { PrismaClient, type Prisma } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";
import { JAMAICA_HOLIDAY_DEFAULTS } from "../src/lib/holidays";

/**
 * Seed: Jamaican public holiday rules + the demo business
 * "Tasha's Beauty Salon, Half Way Tree, Kingston". Safe to re-run: the demo
 * business's catalogue is rebuilt, bookings and conversations are kept.
 * All phone numbers use the fictional 555-01xx range.
 */
const db = new PrismaClient();
const SLUG = "tashas-beauty-salon";

const J = (dollars: number) => dollars * 100; // J$ -> cents

async function seedHolidays() {
  for (const [i, h] of JAMAICA_HOLIDAY_DEFAULTS.entries()) {
    const data = {
      name: h.name,
      ruleType: h.ruleType,
      month: h.month ?? null,
      day: h.day ?? null,
      weekday: h.weekday ?? null,
      nth: h.nth ?? null,
      easterOffset: h.easterOffset ?? null,
      observedRule: h.observedRule,
      sortOrder: i,
    };
    await db.holidayDefinition.upsert({ where: { key: h.key }, create: { key: h.key, ...data }, update: {} });
  }
}

async function seedDemoBusiness() {
  const businessData = {
    name: "Tasha's Beauty Salon",
    category: "SALON" as const,
    status: "ACTIVE" as const,
    plan: "STARTER" as const,
    addressLine: "Shop 7, Demo Plaza, Half Way Tree Road",
    area: "Half Way Tree",
    parish: "Kingston & St. Andrew",
    directions:
      "We're in Demo Plaza on Half Way Tree Road, two minutes' walk from the Half Way Tree Transport Centre, upstairs above the pharmacy. Free parking at the back of the plaza.",
    phoneMain: "+18765550123",
    whatsappNumber: "+18765550123",
    ownerName: "Tasha Campbell",
    ownerWhatsapp: "+18765550100",
    handoffNumber: "+18765550101",
    email: "hello@tashas-salon.example",
    websiteUrl: "https://tashas-salon.example",
    websitePlatform: "WordPress",
    assistantName: "Conroy",
    tone: "JAMAICAN_ENGLISH" as const,
    extraKnowledge:
      "We use and sell professional products (Mizani, Design Essentials). Walk-ins are welcome when there is space, but appointments get priority. Wi-Fi is free for customers.",
    showUsd: false,
    usdRateJmdPerUsd: "158.0000",
    slotIntervalMin: 30,
    bookingLeadTimeMin: 60,
    maxDaysAhead: 60,
    retentionDays: 90,
    brandColor: "#8e2c6c",
    brandTextColor: "#ffffff",
    voiceNumber: "+18765550123",
    whatsappProvider: "CONSOLE" as const,
    waPhoneNumberId: "demo-phone-number-id",
    calendarProvider: "INTERNAL" as const,
  } satisfies Omit<Prisma.BusinessCreateInput, "slug">;

  const business = await db.business.upsert({
    where: { slug: SLUG },
    create: { slug: SLUG, ...businessData },
    update: businessData,
  });
  const businessId = business.id;

  // Rebuild the catalogue (bookings reference services, so services are upserted by name).
  await db.$transaction([
    db.businessHours.deleteMany({ where: { businessId } }),
    db.dateOverride.deleteMany({ where: { businessId } }),
    db.businessHolidaySetting.deleteMany({ where: { businessId } }),
    db.staffService.deleteMany({ where: { businessId } }),
    db.staffSchedule.deleteMany({ where: { businessId } }),
    db.faq.deleteMany({ where: { businessId } }),
    db.policy.deleteMany({ where: { businessId } }),
  ]);

  // Mon 10-6, Tue-Fri 9-6 with lunch 1:00-1:30, Sat 8-2 (half day), Sun closed.
  const lunch = { breakStart: "13:00", breakEnd: "13:30" };
  await db.businessHours.createMany({
    data: [
      { businessId, weekday: 0, isClosed: true },
      { businessId, weekday: 1, isClosed: false, openTime: "10:00", closeTime: "18:00" },
      { businessId, weekday: 2, isClosed: false, openTime: "09:00", closeTime: "18:00", ...lunch },
      { businessId, weekday: 3, isClosed: false, openTime: "09:00", closeTime: "18:00", ...lunch },
      { businessId, weekday: 4, isClosed: false, openTime: "09:00", closeTime: "18:00", ...lunch },
      { businessId, weekday: 5, isClosed: false, openTime: "09:00", closeTime: "19:00", ...lunch },
      { businessId, weekday: 6, isClosed: false, openTime: "08:00", closeTime: "14:00" },
    ],
  });
  await db.dateOverride.createMany({
    data: [
      { businessId, date: "2026-12-24", isClosed: false, openTime: "08:00", closeTime: "13:00", note: "Christmas Eve - half day" },
      { businessId, date: "2026-12-31", isClosed: false, openTime: "08:00", closeTime: "14:00", note: "Old Year's Day - closing early" },
    ],
  });
  // Closed on every public holiday except Ash Wednesday (normal hours).
  await db.businessHolidaySetting.createMany({
    data: JAMAICA_HOLIDAY_DEFAULTS.map((h) => ({ businessId, holidayKey: h.key, isOpen: h.key === "ash_wednesday" })),
  });

  const services: { name: string; durationMin: number; priceCents: number | null; priceIsFrom?: boolean; depositCents?: number; bufferMin?: number; description?: string }[] = [
    { name: "Wash & Set", durationMin: 60, priceCents: J(3500), description: "Shampoo, condition and roller set." },
    { name: "Silk Press", durationMin: 90, priceCents: J(6500), description: "Wash, deep condition, blow-dry and silk press." },
    { name: "Trim", durationMin: 30, priceCents: J(2000), description: "Ends trim (add to any service)." },
    { name: "Relaxer Touch-up", durationMin: 120, priceCents: J(7000), priceIsFrom: true, description: "Touch-up relaxer with treatment and style." },
    { name: "Box Braids (medium)", durationMin: 300, priceCents: J(15000), priceIsFrom: true, depositCents: J(5000), bufferMin: 15, description: "Mid-back length; hair extensions included." },
    { name: "Cornrows", durationMin: 90, priceCents: J(4500), priceIsFrom: true },
    { name: "Gel Manicure", durationMin: 60, priceCents: J(3000) },
    { name: "Spa Pedicure", durationMin: 75, priceCents: J(4000), bufferMin: 10 },
    { name: "Eyebrow Shaping", durationMin: 20, priceCents: J(1500), description: "Wax or threading." },
  ];
  const serviceIds: Record<string, string> = {};
  for (const [i, s] of services.entries()) {
    const existing = await db.service.findFirst({ where: { businessId, name: s.name } });
    const data = {
      durationMin: s.durationMin,
      priceCents: s.priceCents,
      priceIsFrom: s.priceIsFrom ?? false,
      depositCents: s.depositCents ?? null,
      bufferMin: s.bufferMin ?? 0,
      description: s.description ?? null,
      sortOrder: i,
      active: true,
      bookable: true,
    };
    const row = existing
      ? await db.service.update({ where: { id: existing.id }, data })
      : await db.service.create({ data: { businessId, name: s.name, ...data } });
    serviceIds[s.name] = row.id;
  }

  const staffDefs = [
    {
      name: "Tasha",
      title: "Owner & senior stylist",
      services: ["Wash & Set", "Silk Press", "Trim", "Relaxer Touch-up"],
      // Tue-Sat
      schedule: [2, 3, 4, 5, 6],
    },
    {
      name: "Keisha",
      title: "Braider & stylist",
      services: ["Box Braids (medium)", "Cornrows", "Wash & Set", "Trim"],
      schedule: [1, 2, 3, 4, 5, 6],
    },
    {
      name: "Shanice",
      title: "Nail & brow technician",
      services: ["Gel Manicure", "Spa Pedicure", "Eyebrow Shaping"],
      schedule: [3, 4, 5, 6],
    },
  ];
  for (const [i, s] of staffDefs.entries()) {
    const existing = await db.staff.findFirst({ where: { businessId, name: s.name } });
    const staff = existing
      ? await db.staff.update({ where: { id: existing.id }, data: { title: s.title, sortOrder: i, active: true, acceptsBookings: true } })
      : await db.staff.create({ data: { businessId, name: s.name, title: s.title, sortOrder: i } });
    await db.staffService.createMany({ data: s.services.map((name) => ({ businessId, staffId: staff.id, serviceId: serviceIds[name] })) });
    // Working days follow the business hours; days not listed are days off.
    await db.staffSchedule.createMany({
      data: [0, 1, 2, 3, 4, 5, 6].map((weekday) => {
        const works = s.schedule.includes(weekday);
        const hours =
          weekday === 1
            ? { startTime: "10:00", endTime: "18:00" }
            : weekday === 6
              ? { startTime: "08:00", endTime: "14:00" }
              : { startTime: "09:00", endTime: weekday === 5 ? "19:00" : "18:00" };
        return works ? { businessId, staffId: staff.id, weekday, isOff: false, ...hours } : { businessId, staffId: staff.id, weekday, isOff: true };
      }),
    });
  }

  await db.faq.createMany({
    data: [
      { question: "Do you take walk-ins?", answer: "Yes, when we have space, but appointments get priority. Booking ahead is best, especially on Fridays and Saturdays.", keywords: ["walk", "walkin", "walk-in"] },
      { question: "Is there parking?", answer: "Yes, free parking at the back of Demo Plaza.", keywords: ["parking", "park", "car"] },
      { question: "Do I need to bring my own hair for braids?", answer: "No, hair extensions are included in the box braids price. If you prefer a special brand, you're welcome to bring it.", keywords: ["hair", "extensions", "bring", "braids"] },
      { question: "Do you do children's hair?", answer: "Yes, for children 6 and up. Children under 12 must come with an adult.", keywords: ["children", "child", "kids", "pickney"] },
      { question: "How can I pay?", answer: "Cash, debit/credit card at the shop, bank transfer, or a secure Fygaro/WiPay payment link we send by WhatsApp.", keywords: ["pay", "payment", "card", "cash", "transfer"] },
      { question: "How long does a silk press last?", answer: "Usually about two weeks, depending on your hair and the weather. Wrap it at night and avoid humidity to make it last.", keywords: ["silk", "press", "last"] },
      { question: "Do you sell hair products?", answer: "Yes, we sell professional products (Mizani, Design Essentials) at the salon.", keywords: ["products", "sell", "buy"] },
      { question: "What should I do if I'm running late?", answer: "Send us a WhatsApp as soon as possible. If you're more than 15 minutes late we may need to shorten or move your appointment.", keywords: ["late", "running", "soon"] },
    ].map((f, i) => ({ ...f, businessId, sortOrder: i })),
  });
  await db.policy.createMany({
    data: [
      { kind: "CANCELLATION", title: "Cancellations", body: "Please give at least 24 hours' notice to cancel or reschedule. Deposits are non-refundable but can be moved to a new date once." },
      { kind: "DEPOSIT", title: "Deposits", body: "Box braids need a J$5,000 deposit to secure the booking. We send a secure payment link by WhatsApp." },
      { kind: "LATENESS", title: "Lateness", body: "We hold your appointment for 15 minutes. After that we may need to reschedule you." },
      { kind: "CHILDREN", title: "Children", body: "Children under 12 must be accompanied by an adult." },
    ].map((p, i) => ({ ...p, businessId, sortOrder: i })),
  });

  // Demo payment links: replace with the salon's real Fygaro/WiPay links in the dashboard.
  const templates = [
    { provider: "FYGARO" as const, kind: "DEPOSIT" as const, label: "Booking deposit (Fygaro)", urlTemplate: "https://fygaro.com/en/pb/demo-tashas-deposit/?amount={amount}&client_reference={reference}&client_note={description}" },
    { provider: "FYGARO" as const, kind: "FULL" as const, label: "Full payment (Fygaro)", urlTemplate: "https://fygaro.com/en/pb/demo-tashas-full/?amount={amount}&client_reference={reference}&client_note={description}" },
    // WiPay "pay me" links don't document pre-filled amounts: the WhatsApp message carries the amount and reference.
    { provider: "WIPAY" as const, kind: "INVOICE" as const, label: "Invoice (WiPay)", urlTemplate: "https://jm.wipayfinancial.com/to_me/demo_tashas" },
  ];
  for (const tpl of templates) {
    const existing = await db.paymentLinkTemplate.findFirst({ where: { businessId, provider: tpl.provider, kind: tpl.kind } });
    if (existing) await db.paymentLinkTemplate.update({ where: { id: existing.id }, data: tpl });
    else await db.paymentLinkTemplate.create({ data: { businessId, ...tpl } });
  }
  return business;
}

async function seedUsers(businessId: string) {
  const ownerEmail = (process.env.SEED_OWNER_EMAIL || "tasha@example.com").toLowerCase();
  const ownerPassword = process.env.SEED_OWNER_PASSWORD;
  if (!ownerPassword || ownerPassword.length < 10) throw new Error("Set SEED_OWNER_PASSWORD (10+ characters) in .env before seeding.");
  if (process.env.NODE_ENV === "production" && ownerPassword === "Demo-Salon-2026") throw new Error("Choose a real SEED_OWNER_PASSWORD in production.");
  await db.user.upsert({
    where: { email: ownerEmail },
    create: { email: ownerEmail, name: "Tasha Campbell", role: "OWNER", businessId, passwordHash: await hashPassword(ownerPassword) },
    update: { businessId, role: "OWNER", active: true, passwordHash: await hashPassword(ownerPassword) },
  });
  console.log(`Owner login: ${ownerEmail} (password from SEED_OWNER_PASSWORD)`);

  const adminEmail = process.env.SEED_SUPERADMIN_EMAIL?.toLowerCase();
  const adminPassword = process.env.SEED_SUPERADMIN_PASSWORD;
  if (adminEmail && adminPassword) {
    await db.user.upsert({
      where: { email: adminEmail },
      create: { email: adminEmail, name: "Steven Scale Solutions", role: "SUPER_ADMIN", passwordHash: await hashPassword(adminPassword) },
      update: { role: "SUPER_ADMIN", active: true, passwordHash: await hashPassword(adminPassword) },
    });
    console.log(`Super admin login: ${adminEmail}`);
  }
}

async function main() {
  await seedHolidays();
  const business = await seedDemoBusiness();
  await seedUsers(business.id);
  console.log(`Seeded ${business.name} (/${business.slug}).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
