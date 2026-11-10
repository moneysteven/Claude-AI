import { Prisma, type Business, type Plan, type PlanDefinition } from "@prisma/client";
import { db } from "./db";
import { env } from "./env";
import { logger } from "./logger";
import { formatJmd } from "./money";
import { enqueue, JOB } from "./jobs/queue";
import { JAMAICA_TZ, localToUtc, toLocal } from "./time";

/**
 * Plans, usage and overage. Usage comes from UsageEvent (metered at the
 * source: call_ended, every WhatsApp send/receive, every web chat message).
 * Billing periods are calendar months in Jamaica time.
 *
 * The default prices below are starting points for Steven Scale Solutions to
 * tune in /admin/plans; nothing here charges anyone automatically.
 */
export const DEFAULT_PLANS: Record<Plan, Omit<PlanDefinition, "code" | "updatedAt">> = {
  LITE: {
    name: "Lite",
    description: "Website chat + WhatsApp, light phone answering",
    monthlyPriceCents: 7_500_00,
    includedVoiceMinutes: 60,
    voiceOveragePerMinuteCents: 40_00,
    includedWhatsAppMessages: 500,
    whatsappOveragePerMsgCents: 4_00,
  },
  STARTER: {
    name: "Starter",
    description: "24/7 phone answering for a busy small business",
    monthlyPriceCents: 15_000_00,
    includedVoiceMinutes: 200,
    voiceOveragePerMinuteCents: 35_00,
    includedWhatsAppMessages: 1500,
    whatsappOveragePerMsgCents: 3_00,
  },
  GROWTH: {
    name: "Growth",
    description: "High call volume, several staff, payment follow-ups",
    monthlyPriceCents: 30_000_00,
    includedVoiceMinutes: 600,
    voiceOveragePerMinuteCents: 30_00,
    includedWhatsAppMessages: 4000,
    whatsappOveragePerMsgCents: 3_00,
  },
};

export async function getPlans(): Promise<Record<Plan, PlanDefinition>> {
  let rows = await db.planDefinition.findMany();
  if (rows.length < Object.keys(DEFAULT_PLANS).length) {
    for (const [code, def] of Object.entries(DEFAULT_PLANS) as [Plan, (typeof DEFAULT_PLANS)[Plan]][]) {
      await db.planDefinition.upsert({ where: { code }, create: { code, ...def }, update: {} });
    }
    rows = await db.planDefinition.findMany();
  }
  return Object.fromEntries(rows.map((r) => [r.code, r])) as Record<Plan, PlanDefinition>;
}

// ------------------------------------------------------------ periods

/** "2026-11" for a date, in Jamaica time. */
export function periodOf(at: Date = new Date(), tz = JAMAICA_TZ): string {
  return toLocal(at, tz).toFormat("yyyy-MM");
}

export function isPeriod(v: string | undefined | null): v is string {
  return Boolean(v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v));
}

export function periodBounds(period: string, tz = JAMAICA_TZ): { from: Date; to: Date } {
  const [y, m] = period.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return { from: localToUtc(`${period}-01`, "00:00", tz), to: localToUtc(`${next}-01`, "00:00", tz) };
}

export function shiftPeriod(period: string, months: number): string {
  const [y, m] = period.split("-").map(Number);
  const idx = y * 12 + (m - 1) + months;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

// ------------------------------------------------------------ usage

export interface PeriodUsage {
  period: string;
  calls: number;
  voiceSeconds: number;
  /** Each call rounded up to the next minute, as carriers bill. */
  voiceMinutes: number;
  telephonySeconds: number;
  whatsappInbound: number;
  whatsappOutboundSession: number;
  whatsappOutboundTemplate: number;
  /** Outbound messages (what Meta charges for / what plans include). */
  whatsappOutbound: number;
  webChatMessages: number;
  llmInputTokens: number;
  llmOutputTokens: number;
}

export async function usageForPeriod(businessId: string, period: string): Promise<PeriodUsage> {
  const { from, to } = periodBounds(period);
  const [voice] = await db.$queryRaw<{ calls: number; seconds: number; minutes: number }[]>(Prisma.sql`
    SELECT COUNT(*)::int AS calls,
           COALESCE(SUM(quantity), 0)::int AS seconds,
           COALESCE(SUM(CEIL(quantity / 60.0)), 0)::int AS minutes
    FROM "UsageEvent"
    WHERE "businessId" = ${businessId} AND kind = 'VOICE_SECONDS'::"UsageKind"
      AND "occurredAt" >= ${from} AND "occurredAt" < ${to}`);
  const rows = await db.usageEvent.groupBy({
    by: ["kind"],
    where: { businessId, occurredAt: { gte: from, lt: to } },
    _sum: { quantity: true },
  });
  const sum = (k: string) => rows.find((r) => r.kind === k)?._sum.quantity ?? 0;
  const session = sum("WHATSAPP_OUTBOUND_SESSION");
  const template = sum("WHATSAPP_OUTBOUND_TEMPLATE");
  return {
    period,
    calls: voice?.calls ?? 0,
    voiceSeconds: voice?.seconds ?? 0,
    voiceMinutes: voice?.minutes ?? 0,
    telephonySeconds: sum("TELEPHONY_SECONDS"),
    whatsappInbound: sum("WHATSAPP_INBOUND"),
    whatsappOutboundSession: session,
    whatsappOutboundTemplate: template,
    whatsappOutbound: session + template,
    webChatMessages: sum("WEB_CHAT_MESSAGE"),
    llmInputTokens: sum("LLM_INPUT_TOKENS"),
    llmOutputTokens: sum("LLM_OUTPUT_TOKENS"),
  };
}

export interface Bill {
  plan: PlanDefinition;
  includedMinutes: number;
  usedMinutes: number;
  overageMinutes: number;
  voiceOverageCents: number;
  includedMessages: number;
  usedMessages: number;
  overageMessages: number;
  messageOverageCents: number;
  baseCents: number;
  totalCents: number;
  minutesPercent: number;
  messagesPercent: number;
}

export function computeBill(plan: PlanDefinition, usage: Pick<PeriodUsage, "voiceMinutes" | "whatsappOutbound">): Bill {
  const overageMinutes = Math.max(0, usage.voiceMinutes - plan.includedVoiceMinutes);
  const overageMessages = Math.max(0, usage.whatsappOutbound - plan.includedWhatsAppMessages);
  const voiceOverageCents = overageMinutes * plan.voiceOveragePerMinuteCents;
  const messageOverageCents = overageMessages * plan.whatsappOveragePerMsgCents;
  const pct = (used: number, included: number) => (included > 0 ? Math.round((used / included) * 100) : used > 0 ? 100 : 0);
  return {
    plan,
    includedMinutes: plan.includedVoiceMinutes,
    usedMinutes: usage.voiceMinutes,
    overageMinutes,
    voiceOverageCents,
    includedMessages: plan.includedWhatsAppMessages,
    usedMessages: usage.whatsappOutbound,
    overageMessages,
    messageOverageCents,
    baseCents: plan.monthlyPriceCents,
    totalCents: plan.monthlyPriceCents + voiceOverageCents + messageOverageCents,
    minutesPercent: pct(usage.voiceMinutes, plan.includedVoiceMinutes),
    messagesPercent: pct(usage.whatsappOutbound, plan.includedWhatsAppMessages),
  };
}

export async function billForBusiness(business: Pick<Business, "id" | "plan">, period: string) {
  const [plans, usage] = await Promise.all([getPlans(), usageForPeriod(business.id, period)]);
  return { usage, bill: computeBill(plans[business.plan], usage) };
}

// ------------------------------------------------------------ alerts

const THRESHOLDS = [80, 100] as const;

/**
 * Hourly: tell Steven (email) and the owner (WhatsApp) when a business passes
 * 80% and 100% of its included minutes or messages. Each alert fires once
 * per period (UsageAlert unique key).
 */
export async function checkUsageAlerts(business: Business, now: Date = new Date()) {
  const period = periodOf(now, business.timezone);
  const { bill } = await billForBusiness(business, period);
  const fired: string[] = [];
  const metrics = [
    { metric: "VOICE_MINUTES", percent: bill.minutesPercent, label: `${bill.usedMinutes} of ${bill.includedMinutes} included call minutes` },
    { metric: "WHATSAPP_MESSAGES", percent: bill.messagesPercent, label: `${bill.usedMessages} of ${bill.includedMessages} included WhatsApp messages` },
  ];
  for (const m of metrics) {
    for (const threshold of THRESHOLDS) {
      if (m.percent < threshold) continue;
      try {
        await db.usageAlert.create({ data: { businessId: business.id, period, metric: m.metric, threshold } });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue; // already sent
        throw err;
      }
      fired.push(`${m.metric}:${threshold}`);
      const over =
        threshold >= 100
          ? ` Extra usage is billed at ${m.metric === "VOICE_MINUTES" ? `${formatJmd(bill.plan.voiceOveragePerMinuteCents)} per minute` : `${formatJmd(bill.plan.whatsappOveragePerMsgCents)} per message`}.`
          : "";
      await enqueue(JOB.ADMIN_ALERT, {
        subject: `${business.name}: ${threshold}% of ${m.metric === "VOICE_MINUTES" ? "minutes" : "WhatsApp messages"} used`,
        message: `${business.name} (${business.plan}) has used ${m.label} for ${period}.${over}`,
        businessId: business.id,
      });
      if (business.ownerWhatsapp) {
        await enqueue(JOB.STAFF_ALERT, {
          businessId: business.id,
          title: `Usage notice (${threshold}%)`,
          summary: `This month you've used ${m.label}.${over}`,
          customer: "-",
          link: `${env.APP_URL}/dashboard/report?month=${period}`,
        });
      }
    }
  }
  if (fired.length) logger.info({ businessId: business.id, fired }, "usage alerts sent");
  return fired;
}

export async function runUsageAlertScan(now: Date = new Date()) {
  const businesses = await db.business.findMany({ where: { status: { not: "DISABLED" } } });
  let fired = 0;
  for (const b of businesses) {
    fired += (await checkUsageAlerts(b, now).catch((err) => {
      logger.error({ err: (err as Error).message, businessId: b.id }, "usage alert check failed");
      return [];
    })).length;
  }
  return { businesses: businesses.length, fired };
}
