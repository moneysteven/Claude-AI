import type { Business, Faq, Policy, Service, Staff } from "@prisma/client";
import { loadCalendarRules, privacyUrl, usdRate } from "./business";
import { env } from "./env";
import { holidaysForYear } from "./holidays";
import { businessDay, describeWeeklyHours, type BusinessCalendarRules } from "./hours";
import { priceLabel } from "./money";
import { formatPhone } from "./phone";
import { addDays, formatLocalTime, minutesToTime, todayLocal } from "./time";
import { tenantDb } from "./tenant";
import { DateTime } from "luxon";

/**
 * The business knowledge base: everything the assistant may say, generated
 * from the dashboard data. Voice (via Retell dynamic variables) and chat use
 * the exact same text, so answers never drift between channels.
 */

const CATEGORY_LABEL: Record<string, string> = {
  SALON: "hair and beauty salon",
  BARBER: "barber shop",
  AUTO_SHOP: "auto repair shop",
  RESTAURANT: "restaurant",
  CLINIC: "medical clinic",
  GYM: "gym",
  BOUTIQUE: "boutique",
  TOUR_OPERATOR: "tour operator",
  GUESTHOUSE: "guesthouse",
  OTHER: "business",
};

export interface KnowledgeData {
  business: Business;
  services: (Service & { staff: { staff: Staff }[] })[];
  staff: Staff[];
  faqs: Faq[];
  policies: Policy[];
  paymentLabels: string[];
  rules: BusinessCalendarRules;
}

export async function loadKnowledge(businessId: string): Promise<KnowledgeData> {
  const t = tenantDb(businessId);
  const [business, services, staff, faqs, policies, templates, rules] = await Promise.all([
    t.business.findUniqueOrThrow({ where: { id: businessId } }),
    t.service.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { staff: { include: { staff: true } } },
    }),
    t.staff.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    t.faq.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    t.policy.findMany({ orderBy: { sortOrder: "asc" } }),
    t.paymentLinkTemplate.findMany({ where: { active: true } }),
    loadCalendarRules(businessId),
  ]);
  const paymentLabels = [...new Set(templates.map((p) => `${p.provider === "FYGARO" ? "Fygaro" : "WiPay"} (${p.kind.toLowerCase()})`))];
  return { business, services, staff, faqs, policies, paymentLabels, rules };
}

export function categoryLabel(category: string): string {
  return CATEGORY_LABEL[category] ?? "business";
}

function durationLabel(min: number): string {
  if (min < 60) return `${min} minutes`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h} hour${h > 1 ? "s" : ""}${m ? ` ${m} minutes` : ""}`;
}

/** Closures, holidays and special hours in the next `days` days. */
export function upcomingExceptions(rules: BusinessCalendarRules, now: Date, days = 45): string[] {
  const out: string[] = [];
  const today = todayLocal(now, rules.timezone);
  const years = new Set([Number(today.slice(0, 4)), Number(addDays(today, days).slice(0, 4))]);
  const holidayDates = new Set<string>();
  for (const y of years) for (const h of holidaysForYear(y, rules.holidayRules, rules.holidayOverrides)) {
    holidayDates.add(h.date);
    if (h.observedDate) holidayDates.add(h.observedDate);
  }
  for (let i = 0; i <= days; i++) {
    const date = addDays(today, i);
    const day = businessDay(rules, date);
    if (day.source === "regular") continue;
    if (day.source === "holiday" && !holidayDates.has(date)) continue;
    const label = DateTime.fromISO(date).toFormat("cccc d LLLL");
    const what = day.holiday ? `${day.holiday.name}` : (day.note ?? "Special hours");
    if (!day.isOpen) out.push(`${label} (${what}): CLOSED`);
    else
      out.push(
        `${label} (${what}): open ${day.windows.map((w) => `${formatLocalTime(minutesToTime(w.start))} - ${formatLocalTime(minutesToTime(w.end))}`).join(", ")}`,
      );
  }
  return out;
}

export function buildKnowledgeText(k: KnowledgeData, now: Date = new Date()): string {
  const b = k.business;
  const rate = usdRate(b);
  const lines: string[] = [];
  lines.push(`BUSINESS: ${b.name} (${categoryLabel(b.category)})`);
  const where = [b.addressLine, b.area, b.parish].filter(Boolean).join(", ");
  if (where) lines.push(`LOCATION: ${where}, Jamaica`);
  if (b.directions) lines.push(`DIRECTIONS: ${b.directions}`);
  const phones = [
    b.phoneMain ? `Phone: ${formatPhone(b.phoneMain)}` : null,
    b.whatsappNumber ? `WhatsApp: ${formatPhone(b.whatsappNumber)}` : null,
    b.email ? `Email: ${b.email}` : null,
    b.websiteUrl ? `Website: ${b.websiteUrl}` : null,
  ].filter(Boolean);
  if (phones.length) lines.push(`CONTACT: ${phones.join(" | ")}`);

  lines.push("", "OPENING HOURS (Jamaica time):", ...describeWeeklyHours(k.rules.weekly).map((l) => `- ${l}`));
  const exceptions = upcomingExceptions(k.rules, now);
  if (exceptions.length) lines.push("", "UPCOMING HOLIDAYS / SPECIAL HOURS:", ...exceptions.map((l) => `- ${l}`));

  if (k.services.length) {
    lines.push("", `SERVICES AND PRICES (Jamaican dollars${rate ? `; US$ shown at J$${rate} = US$1` : ""}):`);
    for (const s of k.services) {
      const who = s.staff.map((l) => l.staff.name);
      const parts = [
        `${s.name}: ${priceLabel(s.priceCents, { isFrom: s.priceIsFrom, usdRate: rate })}`,
        `takes about ${durationLabel(s.durationMin)}`,
        s.depositCents ? `deposit ${priceLabel(s.depositCents)} required to book` : null,
        who.length ? `done by ${who.join(", ")}` : null,
        s.bookable ? null : "not bookable online - take a message",
        s.description ? s.description : null,
      ].filter(Boolean);
      lines.push(`- ${parts.join("; ")}`);
    }
  }

  if (k.staff.length) {
    lines.push("", "TEAM:", ...k.staff.map((s) => `- ${s.name}${s.title ? ` (${s.title})` : ""}`));
  }
  if (k.policies.length) {
    lines.push("", "POLICIES:", ...k.policies.map((p) => `- ${p.title}: ${p.body}`));
  }
  if (k.paymentLabels.length) {
    lines.push("", `PAYMENT LINKS AVAILABLE: ${k.paymentLabels.join(", ")}. Links are sent by WhatsApp; never take card numbers by phone or chat.`);
  }
  if (k.faqs.length) {
    lines.push("", "FREQUENTLY ASKED QUESTIONS:");
    for (const f of k.faqs) lines.push(`Q: ${f.question}`, `A: ${f.answer}`);
  }
  if (b.extraKnowledge) lines.push("", "OTHER INFORMATION:", b.extraKnowledge);
  lines.push("", `PRIVACY NOTICE: ${privacyUrl(b, env.APP_URL)}`);
  return lines.join("\n");
}

export async function knowledgeTextFor(businessId: string, now: Date = new Date()): Promise<string> {
  return buildKnowledgeText(await loadKnowledge(businessId), now);
}
