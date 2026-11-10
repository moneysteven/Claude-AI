import type { BusinessStatus, ObservedRule, Plan } from "@prisma/client";
import { audit } from "./audit";
import { billForBusiness, getPlans } from "./billing";
import { clearHolidayCache } from "./business";
import { db } from "./db";

/**
 * Super-admin operations (Steven Scale Solutions): every business, usage,
 * plans, status and the platform-wide holiday rules. Callers must have
 * checked requireSuperAdmin().
 */

export async function listBusinessesWithUsage(period: string) {
  const businesses = await db.business.findMany({
    orderBy: [{ status: "asc" }, { name: "asc" }],
    include: { users: { where: { role: "OWNER" }, select: { email: true, lastLoginAt: true }, take: 1 } },
  });
  return Promise.all(
    businesses.map(async (b) => {
      const { usage, bill } = await billForBusiness(b, period);
      return { business: b, owner: b.users[0] ?? null, usage, bill };
    }),
  );
}

export async function setBusinessStatus(businessId: string, status: BusinessStatus, actorUserId: string) {
  const current = await db.business.findUniqueOrThrow({ where: { id: businessId } });
  const updated = await db.business.update({
    where: { id: businessId },
    data: { status, ...(status === "ACTIVE" && !current.goLiveAt ? { goLiveAt: new Date() } : {}) },
  });
  if (status === "DISABLED") {
    // Sign business users out; the super admin keeps access.
    await db.session.deleteMany({ where: { user: { businessId, role: { not: "SUPER_ADMIN" } } } });
  }
  await audit({ businessId, userId: actorUserId, action: "business.status", entityType: "Business", entityId: businessId, details: { from: current.status, to: status } });
  return updated;
}

export async function setBusinessPlan(businessId: string, plan: Plan, actorUserId: string) {
  const current = await db.business.findUniqueOrThrow({ where: { id: businessId } });
  await db.business.update({ where: { id: businessId }, data: { plan } });
  await audit({ businessId, userId: actorUserId, action: "business.plan", entityType: "Business", entityId: businessId, details: { from: current.plan, to: plan } });
}

export async function setInternalNotes(businessId: string, notes: string, actorUserId: string) {
  await db.business.update({ where: { id: businessId }, data: { internalNotes: notes.trim() || null } });
  await audit({ businessId, userId: actorUserId, action: "business.notes", entityType: "Business", entityId: businessId });
}

export interface PlanValues {
  name: string;
  description: string | null;
  monthlyPriceCents: number;
  includedVoiceMinutes: number;
  voiceOveragePerMinuteCents: number;
  includedWhatsAppMessages: number;
  whatsappOveragePerMsgCents: number;
}

export async function updatePlan(code: Plan, values: PlanValues, actorUserId: string) {
  await getPlans(); // make sure the row exists
  await db.planDefinition.update({ where: { code }, data: values });
  await audit({ userId: actorUserId, action: "plan.update", entityType: "PlanDefinition", entityId: code, details: { ...values } });
}

// ------------------------------------------------------------ holiday rules

export interface HolidayRuleValues {
  name: string;
  observedRule: ObservedRule;
  active: boolean;
}

/** Edit a holiday's name, observed-day rule or switch it off (the date rule itself stays). */
export async function updateHolidayRule(key: string, values: HolidayRuleValues, actorUserId: string) {
  await db.holidayDefinition.update({ where: { key }, data: values });
  clearHolidayCache();
  await audit({ userId: actorUserId, action: "holiday.update", entityType: "HolidayDefinition", entityId: key, details: { ...values } });
}

/** Per-year correction when the government gazettes a different date. */
export async function setHolidayOverride(holidayKey: string, year: number, date: string, actorUserId: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number(date.slice(0, 4)) !== year) throw new Error("The date must be in the chosen year (YYYY-MM-DD)");
  await db.holidayDefinition.findUniqueOrThrow({ where: { key: holidayKey } });
  await db.holidayOverride.upsert({
    where: { holidayKey_year: { holidayKey, year } },
    create: { holidayKey, year, date },
    update: { date },
  });
  clearHolidayCache();
  await audit({ userId: actorUserId, action: "holiday.override", entityType: "HolidayOverride", entityId: `${holidayKey}:${year}`, details: { date } });
}

export async function removeHolidayOverride(holidayKey: string, year: number, actorUserId: string) {
  await db.holidayOverride.deleteMany({ where: { holidayKey, year } });
  clearHolidayCache();
  await audit({ userId: actorUserId, action: "holiday.override_remove", entityType: "HolidayOverride", entityId: `${holidayKey}:${year}` });
}
