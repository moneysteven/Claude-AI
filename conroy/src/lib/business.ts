import type { Business, Prisma } from "@prisma/client";
import { db } from "./db";
import { JAMAICA_HOLIDAY_DEFAULTS, type HolidayOverrideRule, type HolidayRule } from "./holidays";
import type { BusinessCalendarRules } from "./hours";
import { tenantDb } from "./tenant";

/** Public business lookup by slug (widget, privacy page). Disabled businesses are hidden. */
export async function getActiveBusinessBySlug(slug: string): Promise<Business | null> {
  const b = await db.business.findUnique({ where: { slug } });
  if (!b || b.status === "DISABLED") return null;
  return b;
}

export async function getBusiness(businessId: string): Promise<Business> {
  return db.business.findUniqueOrThrow({ where: { id: businessId } });
}

let holidayCache: { at: number; rules: HolidayRule[]; overrides: HolidayOverrideRule[] } | null = null;

/** Platform holiday rules (cached for 5 minutes; falls back to the built-in defaults). */
export async function loadHolidayRules(): Promise<{ rules: HolidayRule[]; overrides: HolidayOverrideRule[] }> {
  if (holidayCache && Date.now() - holidayCache.at < 5 * 60_000) return holidayCache;
  const [defs, overrides] = await Promise.all([
    db.holidayDefinition.findMany({ orderBy: { sortOrder: "asc" } }),
    db.holidayOverride.findMany(),
  ]);
  const rules: HolidayRule[] =
    defs.length > 0
      ? defs.map((d) => ({
          key: d.key,
          name: d.name,
          ruleType: d.ruleType,
          month: d.month,
          day: d.day,
          weekday: d.weekday,
          nth: d.nth,
          easterOffset: d.easterOffset,
          observedRule: d.observedRule,
          active: d.active,
        }))
      : JAMAICA_HOLIDAY_DEFAULTS;
  holidayCache = { at: Date.now(), rules, overrides: overrides.map((o) => ({ holidayKey: o.holidayKey, year: o.year, date: o.date })) };
  return holidayCache;
}

export function clearHolidayCache() {
  holidayCache = null;
}

/** Everything the hours/availability engine needs for one business. */
export async function loadCalendarRules(businessId: string): Promise<BusinessCalendarRules> {
  const t = tenantDb(businessId);
  const [business, hours, overrides, settings, holidays] = await Promise.all([
    t.business.findUniqueOrThrow({ where: { id: businessId }, select: { timezone: true } }),
    t.businessHours.findMany({}),
    t.dateOverride.findMany({}),
    t.businessHolidaySetting.findMany({}),
    loadHolidayRules(),
  ]);
  return {
    timezone: business.timezone,
    weekly: hours.map((h) => ({
      weekday: h.weekday,
      isClosed: h.isClosed,
      openTime: h.openTime,
      closeTime: h.closeTime,
      breakStart: h.breakStart,
      breakEnd: h.breakEnd,
    })),
    overrides: overrides.map((o) => ({ date: o.date, isClosed: o.isClosed, openTime: o.openTime, closeTime: o.closeTime, note: o.note })),
    holidayRules: holidays.rules,
    holidayOverrides: holidays.overrides,
    holidaySettings: settings.map((s) => ({ holidayKey: s.holidayKey, isOpen: s.isOpen, openTime: s.openTime, closeTime: s.closeTime })),
  };
}

export function usdRate(business: Pick<Business, "showUsd" | "usdRateJmdPerUsd">): number | null {
  if (!business.showUsd || !business.usdRateJmdPerUsd) return null;
  const rate = Number((business.usdRateJmdPerUsd as Prisma.Decimal).toString());
  return rate > 0 ? rate : null;
}

export function privacyUrl(business: Pick<Business, "slug" | "privacyNoticeUrl">, appUrl: string): string {
  return business.privacyNoticeUrl || `${appUrl}/p/${business.slug}/privacy`;
}
