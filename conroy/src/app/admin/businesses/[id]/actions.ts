"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { setBusinessPlan, setBusinessStatus, setInternalNotes } from "@/lib/admin";
import { requireSuperAdmin } from "@/lib/auth/session";
import { register360dialogWebhook, saveCalendarSettings, saveWhatsAppSettings, testCalendar, testWhatsApp } from "@/lib/connections";
import { parseForm, redirectWith } from "@/lib/forms";
import { logger } from "@/lib/logger";
import { importRetellNumber, retellConfigured, syncRetellAgent } from "@/lib/retell/provision";

/** Super-admin actions on one business. Every action re-checks the role. */

const back = (id: string) => `/admin/businesses/${id}`;
const idOnly = z.object({ businessId: z.string().min(1) });

async function run(businessId: string, ok: string, fn: () => Promise<unknown>): Promise<never> {
  try {
    await fn();
  } catch (err) {
    logger.warn({ err: (err as Error).message, businessId }, "admin action failed");
    revalidatePath(back(businessId));
    redirectWith(back(businessId), "error", (err as Error).message);
  }
  revalidatePath(back(businessId));
  revalidatePath("/admin");
  redirectWith(back(businessId), "ok", ok);
}

export async function setStatusAction(formData: FormData) {
  const user = await requireSuperAdmin();
  const d = parseForm(idOnly.extend({ status: z.enum(["ONBOARDING", "ACTIVE", "DISABLED"]) }), formData, "/admin");
  const label = d.status === "DISABLED" ? "Business disabled: the assistant, widget and dashboard are paused" : `Status set to ${d.status.toLowerCase()}`;
  await run(d.businessId, label, () => setBusinessStatus(d.businessId, d.status, user.id));
}

export async function setPlanAction(formData: FormData) {
  const user = await requireSuperAdmin();
  const d = parseForm(idOnly.extend({ plan: z.enum(["LITE", "STARTER", "GROWTH"]) }), formData, "/admin");
  await run(d.businessId, `Plan changed to ${d.plan.toLowerCase()}`, () => setBusinessPlan(d.businessId, d.plan, user.id));
}

export async function saveNotesAction(formData: FormData) {
  const user = await requireSuperAdmin();
  const d = parseForm(idOnly.extend({ notes: z.string().max(4000).optional() }), formData, "/admin");
  await run(d.businessId, "Notes saved", () => setInternalNotes(d.businessId, d.notes ?? "", user.id));
}

export async function syncVoiceAction(formData: FormData) {
  const user = await requireSuperAdmin();
  const d = parseForm(idOnly, formData, "/admin");
  if (!retellConfigured()) redirectWith(back(d.businessId), "error", "RETELL_API_KEY isn't set on the server");
  await run(d.businessId, "Voice agent is in sync with the Conroy template", () => syncRetellAgent(d.businessId, undefined, user.id));
}

export async function importNumberAction(formData: FormData) {
  const user = await requireSuperAdmin();
  const d = parseForm(idOnly.extend({ number: z.string().min(7).max(30) }), formData, "/admin");
  if (!retellConfigured()) redirectWith(back(d.businessId), "error", "RETELL_API_KEY isn't set on the server");
  await run(d.businessId, "Number connected: calls now reach the voice agent", () => importRetellNumber(d.businessId, d.number, undefined, user.id));
}

const whatsappSchema = idOnly.extend({
  provider: z.enum(["CONSOLE", "META", "DIALOG360"]),
  phoneNumberId: z.string().max(60).optional(),
  accessToken: z.string().max(500).optional(),
  apiKey: z.string().max(200).optional(),
});

export async function saveWhatsAppAction(formData: FormData) {
  const user = await requireSuperAdmin();
  const d = parseForm(whatsappSchema, formData, "/admin");
  await run(d.businessId, "WhatsApp settings saved", () => saveWhatsAppSettings(d.businessId, d, user.id));
}

export async function testWhatsAppAction(formData: FormData) {
  await requireSuperAdmin();
  const d = parseForm(idOnly, formData, "/admin");
  const res = await testWhatsApp(d.businessId);
  redirectWith(back(d.businessId), res.ok ? "ok" : "error", res.message);
}

const calendarSchema = idOnly.extend({
  provider: z.enum(["INTERNAL", "GOOGLE", "CALCOM"]),
  calendarId: z.string().max(200).optional(),
  apiKey: z.string().max(200).optional(),
  eventTypeId: z.string().max(20).optional(),
});

export async function saveCalendarAction(formData: FormData) {
  const user = await requireSuperAdmin();
  const d = parseForm(calendarSchema, formData, "/admin");
  await run(d.businessId, "Calendar settings saved", () => saveCalendarSettings(d.businessId, d, user.id));
}

export async function testCalendarAction(formData: FormData) {
  await requireSuperAdmin();
  const d = parseForm(idOnly, formData, "/admin");
  const res = await testCalendar(d.businessId);
  redirectWith(back(d.businessId), res.ok ? "ok" : "error", res.message);
}

export async function register360WebhookAction(formData: FormData) {
  const user = await requireSuperAdmin();
  const d = parseForm(idOnly, formData, "/admin");
  const res = await register360dialogWebhook(d.businessId, user.id);
  redirectWith(back(d.businessId), res.ok ? "ok" : "error", res.message);
}
