import type { Business, CallOutcome } from "@prisma/client";
import { loadCalendarRules } from "../business";
import { upsertContact } from "../contacts";
import { encryptOptional } from "../crypto";
import { isAfterHours } from "../hours";
import { logger } from "../logger";
import { toE164 } from "../phone";
import { tenantDb } from "../tenant";
import { recordUsage } from "../usage";
import { enqueue, JOB } from "../jobs/queue";
import type { ToolEvent } from "../assistant/tools";
import type { RetellCall } from "./voice";

/**
 * Call log lifecycle from Retell events:
 *   call_started  -> row created (after-hours flag computed in Jamaica time)
 *   (functions)   -> booking / lead / transfer linked to the row
 *   call_ended    -> duration, transcript, recording; minutes metered; summary scheduled
 *   call_analyzed -> AI summary + sentiment; owner WhatsApp summary sent
 */

const OWNER_SUMMARY_FALLBACK_SECONDS = 4 * 60;

/** Retell's charge for the call (US cents), when the event carries it. */
export function callCostUsdCents(call: Pick<RetellCall, "call_cost">): number | undefined {
  const cost = call.call_cost?.combined_cost;
  return typeof cost === "number" && Number.isFinite(cost) && cost >= 0 ? Math.round(cost * 10_000) / 10_000 : undefined;
}

export async function ensureCallLog(business: Business, call: Partial<RetellCall> & { call_id: string }) {
  const t = tenantDb(business.id);
  const existing = await t.callLog.findFirst({ where: { retellCallId: call.call_id } });
  if (existing) return existing;
  const startedAt = call.start_timestamp ? new Date(call.start_timestamp) : new Date();
  const from = toE164(call.from_number ?? null);
  const contact = from ? await upsertContact(business.id, from) : null;
  const rules = await loadCalendarRules(business.id);
  try {
    return await t.callLog.create({
      data: {
        businessId: business.id,
        retellCallId: call.call_id,
        fromNumber: from,
        toNumber: toE164(call.to_number ?? null),
        direction: call.direction ?? "inbound",
        status: "ongoing",
        startedAt,
        afterHours: isAfterHours(rules, startedAt),
        contactId: contact?.id ?? null,
      },
    });
  } catch {
    return t.callLog.findFirstOrThrow({ where: { retellCallId: call.call_id } });
  }
}

/** Link what happened during the call (bookings, leads, handoffs) to its log. */
export async function recordCallEvents(businessId: string, callLogId: string, events: ToolEvent[]) {
  if (events.length === 0) return;
  const t = tenantDb(businessId);
  const data: { bookingId?: string; leadId?: string; outcome?: CallOutcome } = {};
  for (const e of events) {
    if (e.type === "booking_created") Object.assign(data, { bookingId: e.bookingId, outcome: "BOOKED" });
    if (e.type === "booking_rescheduled") Object.assign(data, { bookingId: e.bookingId, outcome: "RESCHEDULED" });
    if (e.type === "booking_cancelled") Object.assign(data, { bookingId: e.bookingId, outcome: "CANCELLED" });
    if (e.type === "lead_captured") {
      data.leadId = e.leadId;
      if (!data.outcome) data.outcome = "LEAD_CAPTURED";
    }
  }
  const current = await t.callLog.findFirst({ where: { id: callLogId }, select: { outcome: true } });
  // A booking outcome is never downgraded by a later lead.
  if (current?.outcome && ["BOOKED", "RESCHEDULED", "CANCELLED"].includes(current.outcome) && data.outcome === "LEAD_CAPTURED") {
    delete data.outcome;
  }
  await t.callLog.update({ where: { id: callLogId }, data });
}

function outcomeFor(call: RetellCall, existing: CallOutcome | null): CallOutcome {
  if (existing && existing !== "OTHER") return existing;
  if (call.disconnection_reason === "call_transfer") return "TRANSFERRED";
  const custom = call.call_analysis?.custom_analysis_data ?? {};
  const fromAnalysis = typeof custom.outcome === "string" ? custom.outcome.toUpperCase() : null;
  const allowed: CallOutcome[] = ["BOOKED", "RESCHEDULED", "CANCELLED", "LEAD_CAPTURED", "INFO_GIVEN", "TRANSFERRED", "MESSAGE_TAKEN", "ABANDONED", "OTHER"];
  if (fromAnalysis && (allowed as string[]).includes(fromAnalysis)) {
    // The model can't claim a booking that the tools didn't make.
    if (!["BOOKED", "RESCHEDULED", "CANCELLED"].includes(fromAnalysis)) return fromAnalysis as CallOutcome;
  }
  if ((call.duration_ms ?? 0) < 8000) return "ABANDONED";
  return "INFO_GIVEN";
}

export async function handleCallEvent(business: Business, event: string, call: RetellCall) {
  const t = tenantDb(business.id);
  const log = await ensureCallLog(business, call);

  if (event === "call_started") return log;

  if (event === "call_ended") {
    const durationSec = Math.round((call.duration_ms ?? (call.end_timestamp && call.start_timestamp ? call.end_timestamp - call.start_timestamp : 0)) / 1000);
    const updated = await t.callLog.update({
      where: { id: log.id },
      data: {
        status: "ended",
        endedAt: call.end_timestamp ? new Date(call.end_timestamp) : new Date(),
        durationSec,
        disconnectionReason: call.disconnection_reason ?? null,
        transferred: call.disconnection_reason === "call_transfer" || log.transferred,
        transcriptEnc: encryptOptional(call.transcript),
        recordingUrlEnc: encryptOptional(call.recording_url),
        outcome: outcomeFor(call, log.outcome),
        ...(callCostUsdCents(call) !== undefined ? { costUsdCents: callCostUsdCents(call) } : {}),
      },
    });
    await recordUsage(business.id, "VOICE_SECONDS", durationSec, `call:${call.call_id}`, updated.startedAt ?? undefined);
    // If call_analyzed never arrives, the summary still goes out a few minutes later.
    await enqueue(
      JOB.OWNER_CALL_SUMMARY,
      { businessId: business.id, callLogId: log.id },
      { startAfter: OWNER_SUMMARY_FALLBACK_SECONDS, singletonKey: `summary-fallback:${log.id}` },
    );
    return updated;
  }

  if (event === "call_analyzed") {
    const analysis = call.call_analysis ?? {};
    const custom = analysis.custom_analysis_data ?? {};
    const reason = typeof custom.call_reason === "string" ? custom.call_reason.slice(0, 200) : null;
    const callerName = typeof custom.caller_name === "string" ? custom.caller_name.slice(0, 120) : null;
    if (callerName && log.contactId) {
      await t.contact.updateMany({ where: { id: log.contactId, name: null }, data: { name: callerName } });
    }
    const updated = await t.callLog.update({
      where: { id: log.id },
      data: {
        summaryEnc: encryptOptional(analysis.call_summary),
        sentiment: analysis.user_sentiment ?? null,
        reason: reason ?? log.reason,
        outcome: outcomeFor(call, log.outcome),
        ...(call.transcript && !log.transcriptEnc ? { transcriptEnc: encryptOptional(call.transcript) } : {}),
        // call_analyzed carries the final cost; it replaces any earlier figure.
        ...(callCostUsdCents(call) !== undefined ? { costUsdCents: callCostUsdCents(call) } : {}),
      },
    });
    await enqueue(JOB.OWNER_CALL_SUMMARY, { businessId: business.id, callLogId: log.id });
    return updated;
  }

  logger.debug({ event }, "retell event ignored");
  return log;
}
