import type { Business, UserRole } from "@prisma/client";
import { audit } from "../audit";
import { hashPassword } from "../auth/password";
import { encryptJson } from "../crypto";
import { db } from "../db";
import { env } from "../env";
import { JAMAICA_HOLIDAY_DEFAULTS } from "../holidays";
import { dayHoursProblem } from "../hours";
import { parseJmdToCents } from "../money";
import { validatePaymentTemplate } from "../payments/service";
import { toE164 } from "../phone";
import { generateTempPassword } from "../users";
import { WEEKDAY_NAMES } from "../time";
import { onboardingSchema, type FieldErrors, type OnboardingInput } from "./schema";

/**
 * Turns a completed onboarding form into a working tenant in one
 * transaction: business, hours, holidays, staff + schedules, services,
 * FAQs, policies, payment links, calendar settings and the owner's login.
 * The knowledge base is generated from these rows on every call/chat, so
 * there is nothing else to build. Voice agent creation happens after.
 */

export class OnboardingError extends Error {
  constructor(readonly fieldErrors: FieldErrors) {
    super(Object.values(fieldErrors)[0] ?? "Please check the form");
    this.name = "OnboardingError";
  }
}

export function slugify(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/['’]/g, "")
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      .replace(/-+$/g, "") || "business"
  );
}

export async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name);
  for (let i = 1; i < 100; i++) {
    const candidate = i === 1 ? base : `${base}-${i}`;
    if (!(await db.business.findUnique({ where: { slug: candidate }, select: { id: true } }))) return candidate;
  }
  throw new Error("Could not find a free web address for this business");
}

interface Normalised {
  input: OnboardingInput;
  phones: Record<keyof OnboardingInput["phones"], string | null>;
  services: (OnboardingInput["services"][number] & { priceCents: number | null; depositCents: number | null })[];
  payments: (OnboardingInput["payments"][number] & { defaultAmountCents: number | null })[];
}

/** Validate and normalise everything; collects all problems so the wizard can show them at once. */
export async function validateOnboarding(raw: unknown): Promise<Normalised> {
  const parsed = onboardingSchema.safeParse(raw);
  if (!parsed.success) {
    const errors: FieldErrors = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".");
      errors[key] ??= issue.message;
    }
    throw new OnboardingError(errors);
  }
  const input = parsed.data;
  const errors: FieldErrors = {};

  const phones = {} as Normalised["phones"];
  for (const [key, value] of Object.entries(input.phones) as [keyof OnboardingInput["phones"], string][]) {
    if (!value) {
      phones[key] = null;
      continue;
    }
    const e164 = toE164(value, env.DEFAULT_AREA_CODE);
    if (!e164) errors[`phones.${key}`] = "That number doesn't look right (e.g. 876-555-1234)";
    phones[key] = e164;
  }
  if (!phones.ownerWhatsapp) errors["phones.ownerWhatsapp"] ??= "The owner's WhatsApp number is needed for call summaries and alerts";
  if (phones.voiceNumber) {
    const taken = await db.business.findFirst({ where: { voiceNumber: phones.voiceNumber }, select: { name: true } });
    if (taken) errors["phones.voiceNumber"] = `That number is already used by ${taken.name}`;
  }

  input.hours.forEach((h, i) => {
    if (h.isClosed) return;
    const problem = dayHoursProblem(h.openTime, h.closeTime, h.breakStart || null, h.breakEnd || null);
    if (problem) errors[`hours.${i}`] = `${WEEKDAY_NAMES[h.weekday]}: ${problem}`;
  });
  if (input.hours.every((h) => h.isClosed)) errors["hours.0"] ??= "The business must be open at least one day";
  const validHolidayKeys = new Set(JAMAICA_HOLIDAY_DEFAULTS.map((h) => h.key));
  input.holidaysOpen.forEach((k, i) => {
    if (!validHolidayKeys.has(k)) errors[`holidaysOpen.${i}`] = "Unknown holiday";
  });

  const staffNames = new Set<string>();
  input.staff.forEach((s, i) => {
    const key = s.name.toLowerCase();
    if (staffNames.has(key)) errors[`staff.${i}.name`] = "Two staff members have the same name; add a surname or initial";
    staffNames.add(key);
    if (s.workDays.length === 0) errors[`staff.${i}.workDays`] = "Pick at least one working day";
  });

  const serviceNames = new Set<string>();
  const services = input.services.map((s, i) => {
    const key = s.name.toLowerCase();
    if (serviceNames.has(key)) errors[`services.${i}.name`] = "This service is listed twice";
    serviceNames.add(key);
    const priceCents = s.price ? parseJmdToCents(s.price) : null;
    if (s.price && priceCents === null) errors[`services.${i}.price`] = "Enter the price in J$, e.g. 4500";
    const depositCents = s.deposit ? parseJmdToCents(s.deposit) : null;
    if (s.deposit && depositCents === null) errors[`services.${i}.deposit`] = "Enter the deposit in J$, e.g. 2000";
    if (priceCents !== null && depositCents !== null && depositCents > priceCents && !s.priceIsFrom) {
      errors[`services.${i}.deposit`] = "The deposit can't be more than the price";
    }
    for (const n of s.staffNames) {
      if (!staffNames.has(n.toLowerCase())) errors[`services.${i}.staffNames`] = `${n} isn't in the staff list`;
    }
    return { ...s, priceCents, depositCents };
  });

  const payments = input.payments.map((p, i) => {
    const problem = validatePaymentTemplate(p.urlTemplate);
    if (problem) errors[`payments.${i}.urlTemplate`] = `Link problem: ${problem}`;
    const defaultAmountCents = p.defaultAmount ? parseJmdToCents(p.defaultAmount) : null;
    if (p.defaultAmount && defaultAmountCents === null) errors[`payments.${i}.defaultAmount`] = "Enter the amount in J$";
    return { ...p, defaultAmountCents };
  });
  if (input.calendar.provider === "GOOGLE" && !input.calendar.googleCalendarId) {
    errors["calendar.googleCalendarId"] = "Enter the Google calendar ID (usually the owner's Gmail address)";
  }
  if (input.calendar.provider === "CALCOM") {
    if (!input.calendar.calcomApiKey) errors["calendar.calcomApiKey"] = "Enter the Cal.com API key";
    if (input.calendar.calcomEventTypeId && !/^\d+$/.test(input.calendar.calcomEventTypeId)) {
      errors["calendar.calcomEventTypeId"] = "The event type ID is a number";
    }
  }

  const ownerEmail = input.owner.email.toLowerCase();
  if (await db.user.findUnique({ where: { email: ownerEmail }, select: { id: true } })) {
    errors["owner.email"] = "There is already an account with this email";
  }

  if (Object.keys(errors).length) throw new OnboardingError(errors);
  return { input, phones, services, payments };
}

export interface OnboardingResult {
  business: Business;
  owner: { email: string; tempPassword: string };
}

export async function createTenantFromOnboarding(raw: unknown, actor: { id: string; role: UserRole }): Promise<OnboardingResult> {
  if (actor.role !== "SUPER_ADMIN") throw new Error("Only Steven Scale Solutions can onboard a new business");
  const { input, phones, services, payments } = await validateOnboarding(raw);
  const slug = await uniqueSlug(input.business.name);
  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  const b = input.business;
  const a = input.assistant;

  const calendarConfig =
    input.calendar.provider === "GOOGLE"
      ? { calendarId: input.calendar.googleCalendarId }
      : input.calendar.provider === "CALCOM"
        ? { apiKey: input.calendar.calcomApiKey, ...(input.calendar.calcomEventTypeId ? { eventTypeId: input.calendar.calcomEventTypeId } : {}) }
        : null;

  const business = await db.$transaction(async (tx) => {
    const created = await tx.business.create({
      data: {
        slug,
        name: b.name,
        category: b.category,
        status: input.options.goLive ? "ACTIVE" : "ONBOARDING",
        goLiveAt: input.options.goLive ? new Date() : null,
        plan: input.plan,
        addressLine: b.addressLine || null,
        area: b.area || null,
        parish: b.parish,
        directions: b.directions || null,
        email: b.email || null,
        websiteUrl: b.websiteUrl || null,
        websitePlatform: b.websitePlatform,
        phoneMain: phones.phoneMain,
        whatsappNumber: phones.whatsappNumber,
        ownerName: input.owner.name,
        ownerWhatsapp: phones.ownerWhatsapp,
        handoffNumber: phones.handoffNumber,
        voiceNumber: phones.voiceNumber,
        assistantName: a.assistantName,
        tone: a.tone,
        greeting: a.greeting || null,
        extraKnowledge: a.extraKnowledge || null,
        whatsappProvider: env.WHATSAPP_PROVIDER === "meta" ? "META" : env.WHATSAPP_PROVIDER === "360dialog" ? "DIALOG360" : "CONSOLE",
        calendarProvider: input.calendar.provider,
        calendarConfigEnc: calendarConfig ? encryptJson(calendarConfig) : null,
      },
    });
    const businessId = created.id;

    await tx.businessHours.createMany({
      data: input.hours.map((h) =>
        h.isClosed
          ? { businessId, weekday: h.weekday, isClosed: true }
          : {
              businessId,
              weekday: h.weekday,
              isClosed: false,
              openTime: h.openTime,
              closeTime: h.closeTime,
              breakStart: h.breakStart || null,
              breakEnd: h.breakEnd || null,
            },
      ),
    });
    await tx.businessHolidaySetting.createMany({
      data: JAMAICA_HOLIDAY_DEFAULTS.map((h) => ({ businessId, holidayKey: h.key, isOpen: input.holidaysOpen.includes(h.key) })),
    });

    // Staff: days they work follow the business hours; other days are off.
    const staffIds = new Map<string, string>();
    for (const [i, s] of input.staff.entries()) {
      const row = await tx.staff.create({ data: { businessId, name: s.name, title: s.title || null, sortOrder: i } });
      staffIds.set(s.name.toLowerCase(), row.id);
      const openDays = input.hours.filter((h) => !h.isClosed).map((h) => h.weekday);
      const worksEveryOpenDay = openDays.every((d) => s.workDays.includes(d));
      if (!worksEveryOpenDay) {
        await tx.staffSchedule.createMany({
          data: input.hours.map((h) =>
            !h.isClosed && s.workDays.includes(h.weekday)
              ? {
                  businessId,
                  staffId: row.id,
                  weekday: h.weekday,
                  isOff: false,
                  startTime: h.openTime,
                  endTime: h.closeTime,
                  breakStart: h.breakStart || null,
                  breakEnd: h.breakEnd || null,
                }
              : { businessId, staffId: row.id, weekday: h.weekday, isOff: true },
          ),
        });
      }
    }

    for (const [i, s] of services.entries()) {
      const svc = await tx.service.create({
        data: {
          businessId,
          name: s.name,
          description: s.description || null,
          durationMin: s.durationMin,
          priceCents: s.priceCents,
          priceIsFrom: s.priceIsFrom,
          depositCents: s.depositCents,
          sortOrder: i,
        },
      });
      const links = s.staffNames.map((n) => staffIds.get(n.toLowerCase())).filter((x): x is string => Boolean(x));
      if (links.length) await tx.staffService.createMany({ data: links.map((staffId) => ({ businessId, staffId, serviceId: svc.id })) });
    }

    if (input.faqs.length) {
      await tx.faq.createMany({ data: input.faqs.map((f, i) => ({ businessId, question: f.question, answer: f.answer, sortOrder: i })) });
    }
    if (input.policies.length) {
      await tx.policy.createMany({ data: input.policies.map((p, i) => ({ businessId, kind: p.kind, title: p.title, body: p.body, sortOrder: i })) });
    }
    if (payments.length) {
      await tx.paymentLinkTemplate.createMany({
        data: payments.map((p) => ({
          businessId,
          provider: p.provider,
          kind: p.kind,
          label: p.label,
          urlTemplate: p.urlTemplate,
          defaultAmountCents: p.defaultAmountCents,
        })),
      });
    }

    await tx.user.create({
      data: {
        email: input.owner.email.toLowerCase(),
        name: input.owner.name,
        role: "OWNER",
        businessId,
        passwordHash,
        mustChangePassword: true,
      },
    });
    return created;
  });

  await audit({
    businessId: business.id,
    userId: actor.id,
    action: "business.onboard",
    entityType: "Business",
    entityId: business.id,
    details: { plan: input.plan, services: services.length, staff: input.staff.length, goLive: input.options.goLive },
  });
  return { business, owner: { email: input.owner.email.toLowerCase(), tempPassword } };
}
