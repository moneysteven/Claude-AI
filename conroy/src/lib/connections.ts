import type { CalendarProviderType, WhatsAppProviderType } from "@prisma/client";
import { audit } from "./audit";
import { calendarFor, type CalendarConfig } from "./calendar";
import { decryptJson, encryptJson } from "./crypto";
import { env } from "./env";
import { db } from "./db";
import { formatPhone } from "./phone";
import { addMinutes } from "./time";
import { sendStaffTemplate } from "./whatsapp/outbound";

/**
 * Per-business WhatsApp and calendar connections (set by the super admin).
 * Secrets (tokens, API keys) are encrypted; blank fields keep the saved value
 * so they never need to be shown again.
 */

export interface WhatsAppSettingsInput {
  provider: WhatsAppProviderType;
  phoneNumberId?: string | null;
  /** Meta: per-business access token (optional; the platform token is used otherwise). */
  accessToken?: string | null;
  /** 360dialog: the channel's API key. */
  apiKey?: string | null;
}

interface WaCredentials {
  accessToken?: string;
  apiKey?: string;
}

export async function saveWhatsAppSettings(businessId: string, input: WhatsAppSettingsInput, actorUserId: string) {
  const business = await db.business.findUniqueOrThrow({ where: { id: businessId } });
  const phoneNumberId = input.phoneNumberId?.trim() || null;
  if (phoneNumberId) {
    const taken = await db.business.findFirst({ where: { waPhoneNumberId: phoneNumberId, id: { not: businessId } } });
    if (taken) throw new Error(`That phone number ID already belongs to ${taken.name}`);
  }
  if (input.provider === "META" && !phoneNumberId) throw new Error("Meta needs the WhatsApp phone number ID");
  const creds = decryptJson<WaCredentials>(business.waCredentialsEnc) ?? {};
  if (input.accessToken?.trim()) creds.accessToken = input.accessToken.trim();
  if (input.apiKey?.trim()) creds.apiKey = input.apiKey.trim();
  await db.business.update({
    where: { id: businessId },
    data: {
      whatsappProvider: input.provider,
      waPhoneNumberId: phoneNumberId,
      waCredentialsEnc: Object.keys(creds).length ? encryptJson(creds) : null,
    },
  });
  await audit({ businessId, userId: actorUserId, action: "connection.whatsapp", entityType: "Business", entityId: businessId, details: { provider: input.provider } });
}

export async function clearWhatsAppCredentials(businessId: string, actorUserId: string) {
  await db.business.update({ where: { id: businessId }, data: { waCredentialsEnc: null } });
  await audit({ businessId, userId: actorUserId, action: "connection.whatsapp_clear", entityType: "Business", entityId: businessId });
}

/** Sends the staff_alert template to the owner's WhatsApp: proves token, number and template approval. */
export async function testWhatsApp(businessId: string): Promise<{ ok: boolean; message: string }> {
  const business = await db.business.findUniqueOrThrow({ where: { id: businessId } });
  if (!business.ownerWhatsapp) return { ok: false, message: "Add the owner's WhatsApp number first." };
  const res = await sendStaffTemplate(businessId, business.ownerWhatsapp, "staff_alert", [
    "Test message",
    business.name,
    `${business.assistantName} can send WhatsApp messages`,
    "-",
    "-",
  ]);
  return res.status === "SENT"
    ? { ok: true, message: `Test template sent to ${formatPhone(business.ownerWhatsapp)} via ${business.whatsappProvider.toLowerCase()}.` }
    : { ok: false, message: `WhatsApp didn't accept it: ${res.reason ?? "unknown error"}` };
}

export interface CalendarSettingsInput {
  provider: CalendarProviderType;
  calendarId?: string | null; // Google
  apiKey?: string | null; // Cal.com (blank keeps the saved key)
  eventTypeId?: string | null; // Cal.com
}

export async function saveCalendarSettings(businessId: string, input: CalendarSettingsInput, actorUserId: string) {
  const business = await db.business.findUniqueOrThrow({ where: { id: businessId } });
  const current = decryptJson<CalendarConfig>(business.calendarConfigEnc) ?? {};
  let config: CalendarConfig = {};
  if (input.provider === "GOOGLE") {
    const calendarId = input.calendarId?.trim();
    if (!calendarId) throw new Error("Enter the Google calendar ID (usually the owner's Gmail address).");
    config = { calendarId };
  } else if (input.provider === "CALCOM") {
    const apiKey = input.apiKey?.trim() || current.apiKey;
    if (!apiKey) throw new Error("Enter the Cal.com API key.");
    const eventTypeId = input.eventTypeId?.trim();
    if (eventTypeId && !/^\d+$/.test(eventTypeId)) throw new Error("The Cal.com event type ID is a number.");
    config = { apiKey, ...(eventTypeId ? { eventTypeId } : {}) };
  }
  await db.business.update({
    where: { id: businessId },
    data: { calendarProvider: input.provider, calendarConfigEnc: input.provider === "INTERNAL" ? null : encryptJson(config) },
  });
  await audit({ businessId, userId: actorUserId, action: "connection.calendar", entityType: "Business", entityId: businessId, details: { provider: input.provider } });
}

/** Reads the next 24 hours of busy time to prove the connection works. */
export async function testCalendar(businessId: string): Promise<{ ok: boolean; message: string }> {
  const business = await db.business.findUniqueOrThrow({ where: { id: businessId } });
  if (business.calendarProvider === "INTERNAL") return { ok: true, message: "Using Conroy's built-in calendar: nothing to connect." };
  try {
    const { provider, defaultCalendarId } = calendarFor(business);
    const staff = await db.staff.findMany({ where: { businessId, active: true, calendarId: { not: null } }, select: { calendarId: true } });
    const ids = [...new Set([defaultCalendarId, ...staff.map((s) => s.calendarId)].filter((x): x is string => Boolean(x)))];
    if (ids.length === 0) return { ok: false, message: "No calendar or event type ID is set." };
    const now = new Date();
    const busy = await provider.listBusy({ calendarIds: ids, from: now, to: addMinutes(now, 24 * 60) });
    return { ok: true, message: `Connected to ${ids.length} calendar(s); ${busy.length} busy block(s) in the next 24 hours.` };
  } catch (err) {
    return { ok: false, message: `Couldn't read the calendar: ${(err as Error).message}` };
  }
}

/** What's configured, without revealing secrets. */
export function connectionSummary(business: {
  whatsappProvider: WhatsAppProviderType;
  waPhoneNumberId: string | null;
  waCredentialsEnc: string | null;
  calendarProvider: CalendarProviderType;
  calendarConfigEnc: string | null;
}) {
  const wa = decryptJson<WaCredentials>(business.waCredentialsEnc) ?? {};
  const cal = decryptJson<CalendarConfig>(business.calendarConfigEnc) ?? {};
  return {
    whatsapp: {
      provider: business.whatsappProvider,
      phoneNumberId: business.waPhoneNumberId,
      hasOwnToken: Boolean(wa.accessToken),
      hasApiKey: Boolean(wa.apiKey),
    },
    calendar: {
      provider: business.calendarProvider,
      calendarId: cal.calendarId ?? null,
      eventTypeId: cal.eventTypeId ?? null,
      hasApiKey: Boolean(cal.apiKey),
    },
  };
}

/**
 * Point this business's 360dialog channel at Conroy (POST /v1/configs/webhook).
 * The shared secret travels in a custom header, not the URL. Note: generating a
 * new 360dialog API key removes the webhook, so run this again after a key change.
 */
export async function register360dialogWebhook(businessId: string, actorUserId: string, fetchFn: typeof fetch = fetch): Promise<{ ok: boolean; message: string }> {
  const business = await db.business.findUniqueOrThrow({ where: { id: businessId } });
  const apiKey = decryptJson<WaCredentials>(business.waCredentialsEnc)?.apiKey ?? env.DIALOG360_API_KEY;
  if (!apiKey) return { ok: false, message: "Save the channel's 360dialog API key first." };
  if (!env.DIALOG360_WEBHOOK_TOKEN) return { ok: false, message: "Set DIALOG360_WEBHOOK_TOKEN on the server first." };
  if (!env.APP_URL.startsWith("https://")) return { ok: false, message: "360dialog needs an https:// APP_URL." };
  const url = `${env.APP_URL}/api/whatsapp/360dialog?business=${encodeURIComponent(business.slug)}`;
  const res = await fetchFn(`${env.DIALOG360_BASE_URL.replace(/\/$/, "")}/v1/configs/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "D360-API-KEY": apiKey },
    body: JSON.stringify({ url, headers: { "X-Conroy-Webhook-Token": env.DIALOG360_WEBHOOK_TOKEN } }),
  });
  await audit({ businessId, userId: actorUserId, action: "connection.360dialog_webhook", entityType: "Business", entityId: businessId, details: { status: res.status } });
  return res.ok ? { ok: true, message: `360dialog will now send messages to ${url}` } : { ok: false, message: `360dialog refused the webhook (HTTP ${res.status}).` };
}
