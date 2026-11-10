import { Prisma, type Business } from "@prisma/client";
import { audit } from "./audit";
import { billForBusiness, periodOf, shiftPeriod } from "./billing";
import { decryptOptional } from "./crypto";
import { db } from "./db";
import { logger } from "./logger";
import { formatPhone } from "./phone";
import { queueRetellCleanup, type ScheduleRetellCleanup } from "./privacy/retention";
import { hasRetellWork, type RetellCleanup } from "./retell/cleanup";
import { tenantDb } from "./tenant";

/**
 * When a client leaves (Data Protection Act 2020: the business is the data
 * controller, Steven Scale Solutions the processor): hand back everything
 * held for the business, then delete it.
 *
 * - exportBusinessData: one JSON document with every record, decrypted.
 *   Provider credentials and password hashes are never included.
 * - deleteBusiness: only for a DISABLED business, confirmed by typing its
 *   slug. Deletes every row, then queues deletion of Retell's copies (calls,
 *   agent, LLM, number import). One audit entry without personal data remains.
 */

export const EXPORT_FORMAT = "conroy-business-export";
export const EXPORT_VERSION = 1;

const num = (d: Prisma.Decimal | null | undefined) => (d === null || d === undefined ? null : Number(d));

export async function exportBusinessData(businessId: string) {
  const t = tenantDb(businessId);
  const business = await t.business.findUniqueOrThrow({ where: { id: businessId } });
  const [
    hours,
    dateOverrides,
    holidaySettings,
    services,
    staff,
    faqs,
    policies,
    users,
    contacts,
    conversations,
    calls,
    bookings,
    leads,
    paymentTemplates,
    paymentRequests,
    usageByMonth,
    auditLog,
  ] = await Promise.all([
    t.businessHours.findMany({ orderBy: { weekday: "asc" } }),
    t.dateOverride.findMany({ orderBy: { date: "asc" } }),
    t.businessHolidaySetting.findMany({ orderBy: { holidayKey: "asc" } }),
    t.service.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    t.staff.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { schedules: { orderBy: { weekday: "asc" } }, timeOff: { orderBy: { startAt: "asc" } }, services: { select: { serviceId: true } } },
    }),
    t.faq.findMany({ orderBy: { sortOrder: "asc" } }),
    t.policy.findMany({ orderBy: { sortOrder: "asc" } }),
    db.user.findMany({ where: { businessId }, orderBy: { createdAt: "asc" } }),
    t.contact.findMany({ orderBy: { createdAt: "asc" } }),
    t.conversation.findMany({ orderBy: { createdAt: "asc" }, include: { messages: { orderBy: { createdAt: "asc" } } } }),
    t.callLog.findMany({ orderBy: { createdAt: "asc" } }),
    t.booking.findMany({ orderBy: { startAt: "asc" } }),
    t.lead.findMany({ orderBy: { createdAt: "asc" } }),
    t.paymentLinkTemplate.findMany(),
    t.paymentRequest.findMany({ orderBy: { createdAt: "asc" } }),
    db.$queryRaw<{ month: string; kind: string; quantity: number }[]>(Prisma.sql`
      SELECT to_char("occurredAt" AT TIME ZONE ${business.timezone}, 'YYYY-MM') AS month, kind::text AS kind, SUM(quantity)::int AS quantity
      FROM "UsageEvent" WHERE "businessId" = ${businessId}
      GROUP BY 1, 2 ORDER BY 1, 2`),
    db.auditLog.findMany({ where: { businessId }, orderBy: { createdAt: "asc" } }),
  ]);

  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    notes: [
      "All times are UTC (ISO 8601). Money is in cents of the stated currency (J$ unless shown otherwise).",
      "Recording links point to the voice provider and stop working once the data is deleted there; download any recordings you need first.",
      "Text that was already deleted under the retention period (transcripts, chat messages) shows as null.",
    ],
    business: {
      id: business.id,
      slug: business.slug,
      name: business.name,
      category: business.category,
      status: business.status,
      plan: business.plan,
      addressLine: business.addressLine,
      area: business.area,
      parish: business.parish,
      directions: business.directions,
      phoneMain: business.phoneMain,
      whatsappNumber: business.whatsappNumber,
      ownerName: business.ownerName,
      ownerWhatsapp: business.ownerWhatsapp,
      handoffNumber: business.handoffNumber,
      email: business.email,
      websiteUrl: business.websiteUrl,
      privacyNoticeUrl: business.privacyNoticeUrl,
      assistantName: business.assistantName,
      greeting: business.greeting,
      tone: business.tone,
      extraKnowledge: business.extraKnowledge,
      timezone: business.timezone,
      currency: business.currency,
      slotIntervalMin: business.slotIntervalMin,
      bookingLeadTimeMin: business.bookingLeadTimeMin,
      maxDaysAhead: business.maxDaysAhead,
      retentionDays: business.retentionDays,
      customerRetentionMonths: business.customerRetentionMonths,
      voiceNumber: business.voiceNumber,
      whatsappProvider: business.whatsappProvider,
      calendarProvider: business.calendarProvider,
      createdAt: business.createdAt,
      goLiveAt: business.goLiveAt,
    },
    openingHours: hours.map(({ businessId: _b, id: _i, ...h }) => h),
    dateOverrides: dateOverrides.map(({ businessId: _b, id: _i, ...d }) => d),
    holidaySettings: holidaySettings.map(({ businessId: _b, id: _i, ...h }) => h),
    services: services.map(({ businessId: _b, ...s }) => s),
    staff: staff.map(({ businessId: _b, schedules, timeOff, services: offered, ...s }) => ({
      ...s,
      serviceIds: offered.map((o) => o.serviceId),
      schedule: schedules.map(({ businessId: _x, staffId: _y, id: _z, ...r }) => r),
      timeOff: timeOff.map(({ businessId: _x, staffId: _y, id: _z, ...r }) => r),
    })),
    faqs: faqs.map(({ businessId: _b, ...f }) => f),
    policies: policies.map(({ businessId: _b, ...p }) => p),
    users: users.map((u) => ({ name: u.name, email: u.email, role: u.role, active: u.active, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt })),
    contacts: contacts.map(({ businessId: _b, ...c }) => c),
    conversations: conversations.map((c) => ({
      id: c.id,
      channel: c.channel,
      externalId: c.externalId,
      contactId: c.contactId,
      status: c.status,
      handoffReason: c.handoffReason,
      createdAt: c.createdAt,
      lastMessageAt: c.lastMessageAt,
      messages: c.messages.map((m) => ({
        at: m.createdAt,
        direction: m.direction,
        sender: m.sender,
        text: decryptOptional(m.bodyEnc),
        template: m.templateName,
        status: m.status,
      })),
    })),
    calls: calls.map((c) => ({
      id: c.id,
      contactId: c.contactId,
      from: c.fromNumber,
      to: c.toNumber,
      direction: c.direction,
      startedAt: c.startedAt,
      endedAt: c.endedAt,
      durationSec: c.durationSec,
      afterHours: c.afterHours,
      outcome: c.outcome,
      reason: c.reason,
      sentiment: c.sentiment,
      transferred: c.transferred,
      bookingId: c.bookingId,
      leadId: c.leadId,
      summary: decryptOptional(c.summaryEnc),
      transcript: decryptOptional(c.transcriptEnc),
      recordingUrl: decryptOptional(c.recordingUrlEnc),
      providerCostUsdCents: num(c.costUsdCents),
    })),
    bookings: bookings.map(({ businessId: _b, ...b }) => b),
    leads: leads.map(({ businessId: _b, ...l }) => l),
    paymentLinks: paymentTemplates.map(({ businessId: _b, ...p }) => p),
    paymentRequests: paymentRequests.map(({ businessId: _b, markedPaidById: _m, ...p }) => p),
    usageByMonth,
    auditLog: auditLog.map((a) => ({ at: a.createdAt, action: a.action, entityType: a.entityType, entityId: a.entityId, details: a.details })),
  };
}

export type BusinessExport = Awaited<ReturnType<typeof exportBusinessData>>;

// ------------------------------------------------------------ delete

export class OffboardingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OffboardingError";
  }
}

/** Things outside Conroy's database that someone has to do by hand. */
export function manualOffboardingSteps(business: Pick<Business, "voiceNumber" | "phoneMain" | "whatsappProvider" | "calendarProvider" | "websiteUrl">): string[] {
  const steps: string[] = [];
  if (business.voiceNumber) {
    steps.push(`Release the number ${formatPhone(business.voiceNumber)} at your carrier (Telnyx or Twilio), or keep it for another client. Retell's link to it is removed automatically.`);
    steps.push(
      `Ask the client to turn off call forwarding on ${business.phoneMain ? formatPhone(business.phoneMain) : "their Digicel or Flow line"}: dial ##002# and press call.`,
    );
  }
  if (business.whatsappProvider === "META") steps.push("Remove the WhatsApp number from your Meta WhatsApp Business Account, or hand the account back to the client.");
  if (business.whatsappProvider === "DIALOG360") steps.push("Cancel or hand over the client's 360dialog channel.");
  if (business.calendarProvider === "GOOGLE") steps.push("Ask the client to stop sharing their Google Calendar with Conroy's service account.");
  if (business.calendarProvider === "CALCOM") steps.push("Ask the client to delete the Cal.com API key they gave you.");
  steps.push(`Ask the client to remove the Conroy chat widget script from ${business.websiteUrl ?? "their website"}.`);
  steps.push("Database backups on the server still contain this business until they rotate out (14 days by default), and so do any off-server copies you keep.");
  return steps;
}

export interface DeleteBusinessResult {
  name: string;
  slug: string;
  deleted: Record<string, number>;
  retellCalls: number;
  manualSteps: string[];
}

export async function deleteBusiness(
  businessId: string,
  confirmation: string,
  actorUserId: string,
  opts: { scheduleRetellCleanup?: ScheduleRetellCleanup; now?: Date } = {},
): Promise<DeleteBusinessResult> {
  const business = await db.business.findUnique({ where: { id: businessId } });
  if (!business) throw new OffboardingError("That business doesn't exist (it may already be deleted)");
  if (business.status !== "DISABLED") throw new OffboardingError("Disable the business first, so its assistant, widget and logins are already off");
  if (confirmation.trim().toLowerCase() !== business.slug) throw new OffboardingError(`To confirm, type the business's short name exactly: ${business.slug}`);

  const now = opts.now ?? new Date();
  const t = tenantDb(businessId);
  const [contacts, conversations, messages, calls, bookings, leads, paymentRequests, users, lastExport] = await Promise.all([
    t.contact.count(),
    t.conversation.count(),
    t.message.count(),
    t.callLog.findMany({ select: { retellCallId: true } }),
    t.booking.count(),
    t.lead.count(),
    t.paymentRequest.count(),
    db.user.count({ where: { businessId } }),
    db.auditLog.findFirst({ where: { businessId, action: "business.export" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);
  const period = periodOf(now, business.timezone);
  const bills = await Promise.all(
    [shiftPeriod(period, -1), period].map(async (p) => {
      const { usage, bill } = await billForBusiness(business, p);
      return { period: p, voiceMinutes: usage.voiceMinutes, whatsappSent: usage.whatsappOutbound, billCents: bill.totalCents };
    }),
  );
  const deleted = { contacts, conversations, messages, calls: calls.length, bookings, leads, paymentRequests, users };

  await db.$transaction(
    async (tx) => {
      // Rows that point at catalogue rows with ON DELETE RESTRICT go first; the
      // rest (and the business's users and their sessions) cascade from Business.
      await tx.paymentRequest.deleteMany({ where: { businessId } });
      await tx.booking.deleteMany({ where: { businessId } });
      await tx.auditLog.deleteMany({ where: { businessId } });
      // A super admin is never tied to a business, but never delete one by accident.
      await tx.user.updateMany({ where: { businessId, role: "SUPER_ADMIN" }, data: { businessId: null } });
      await tx.business.delete({ where: { id: businessId } });
    },
    { timeout: 120_000, maxWait: 10_000 },
  );

  const manualSteps = manualOffboardingSteps(business);
  await audit({
    businessId: null,
    userId: actorUserId,
    action: "business.delete",
    entityType: "Business",
    entityId: businessId,
    details: {
      name: business.name,
      slug: business.slug,
      plan: business.plan,
      deleted,
      lastExportAt: lastExport?.createdAt.toISOString() ?? null,
      finalUsage: bills,
      manualSteps,
    },
  });

  const job: RetellCleanup = {
    reason: "business_deleted",
    businessSlug: business.slug,
    callIds: calls.map((c) => c.retellCallId),
    agentId: business.retellAgentId,
    llmId: business.retellLlmId,
    phoneNumber: business.voiceNumber,
  };
  if (hasRetellWork(job)) {
    try {
      await (opts.scheduleRetellCleanup ?? queueRetellCleanup)(job);
    } catch (err) {
      // The database part is done; say what's left rather than failing the whole action.
      logger.error({ err: (err as Error).message, business: business.slug }, "could not queue Retell clean-up");
      manualSteps.unshift("Retell clean-up could not be queued: delete this business's agent, LLM, number and calls in the Retell dashboard.");
    }
  }
  logger.info({ business: business.slug, deleted }, "business deleted");
  return { name: business.name, slug: business.slug, deleted, retellCalls: calls.length, manualSteps };
}

/** Deleted businesses whose manual follow-ups are still worth showing (last 30 days). */
export async function recentDeletions(now: Date = new Date()) {
  const rows = await db.auditLog.findMany({
    where: { action: "business.delete", createdAt: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return rows.map((r) => {
    const d = (r.details ?? {}) as { name?: string; slug?: string; manualSteps?: string[] };
    return { at: r.createdAt, name: d.name ?? "(unknown)", slug: d.slug ?? "", manualSteps: Array.isArray(d.manualSteps) ? d.manualSteps : [] };
  });
}
