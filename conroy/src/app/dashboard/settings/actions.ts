"use server";

import { BusinessCategory, Tone } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { enqueue, JOB } from "@/lib/jobs/queue";
import { logger } from "@/lib/logger";
import { retellConfigured, syncRetellAgent } from "@/lib/retell/provision";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireTenant, SETTINGS_ROLES } from "@/lib/auth/session";
import { blankToUndefined, parseForm, redirectWith } from "@/lib/forms";
import { flag, HEX_RE, intIn, optText, phoneOrError, reqText } from "./_lib";

const BACK = "/dashboard/settings";

const optUrl = z.preprocess(
  blankToUndefined,
  z
    .string()
    .trim()
    .max(300)
    .url("enter a full web address starting with https://")
    .refine((v) => /^https?:\/\//i.test(v), "must start with http:// or https://")
    .optional(),
);

const ORIGIN_RE = /^(https:\/\/[a-z0-9.-]+\.[a-z]{2,}(:\d{1,5})?|http:\/\/localhost(:\d{1,5})?)$/;

const schema = z.object({
  name: reqText(120),
  category: z.enum(BusinessCategory),
  addressLine: optText(200),
  area: optText(100),
  parish: optText(100),
  directions: optText(1000),
  phoneMain: optText(30),
  whatsappNumber: optText(30),
  ownerName: optText(120),
  ownerWhatsapp: optText(30),
  handoffNumber: optText(30),
  email: z.preprocess(blankToUndefined, z.string().trim().email("enter a valid email").max(200).optional()),
  websiteUrl: optUrl,
  websitePlatform: optText(100),
  privacyNoticeUrl: optUrl,
  assistantName: reqText(40),
  greeting: optText(400),
  tone: z.enum(Tone),
  extraKnowledge: optText(4000),
  showUsd: flag,
  usdRateJmdPerUsd: z.preprocess(blankToUndefined, z.coerce.number().positive("must be more than 0").max(10000).optional()),
  slotIntervalMin: intIn(5, 120),
  bookingLeadTimeMin: intIn(0, 2880),
  maxDaysAhead: intIn(1, 365),
  retentionDays: intIn(7, 730),
  brandColor: z.string().regex(HEX_RE, "use a colour like #8e2c6c"),
  brandTextColor: z.string().regex(HEX_RE, "use a colour like #ffffff"),
  widgetOrigins: optText(4000),
});

export async function updateBusinessAction(formData: FormData) {
  const { user, business, t } = await requireTenant(SETTINGS_ROLES);
  const d = parseForm(schema, formData, BACK);

  const phoneMain = phoneOrError(d.phoneMain, "Main phone", BACK);
  const whatsappNumber = phoneOrError(d.whatsappNumber, "WhatsApp number", BACK);
  const ownerWhatsapp = phoneOrError(d.ownerWhatsapp, "Owner WhatsApp", BACK);
  const handoffNumber = phoneOrError(d.handoffNumber, "Handoff number", BACK);

  if (d.showUsd && !d.usdRateJmdPerUsd) redirectWith(BACK, "error", "Set the exchange rate (J$ per US$1) to show US$ prices");

  const origins = (d.widgetOrigins ?? "")
    .split(/\r?\n/)
    .map((o) => o.trim().toLowerCase().replace(/\/+$/, ""))
    .filter(Boolean);
  const badOrigin = origins.find((o) => !ORIGIN_RE.test(o));
  if (badOrigin) redirectWith(BACK, "error", `Website origin "${badOrigin}" must look like https://www.example.com (no path)`);
  if (origins.length > 20) redirectWith(BACK, "error", "At most 20 website origins");

  const data = {
    name: d.name,
    category: d.category,
    addressLine: d.addressLine ?? null,
    area: d.area ?? null,
    parish: d.parish ?? null,
    directions: d.directions ?? null,
    phoneMain,
    whatsappNumber,
    ownerName: d.ownerName ?? null,
    ownerWhatsapp,
    handoffNumber,
    email: d.email?.toLowerCase() ?? null,
    websiteUrl: d.websiteUrl ?? null,
    websitePlatform: d.websitePlatform ?? null,
    privacyNoticeUrl: d.privacyNoticeUrl ?? null,
    assistantName: d.assistantName,
    greeting: d.greeting ?? null,
    tone: d.tone,
    extraKnowledge: d.extraKnowledge ?? null,
    showUsd: d.showUsd,
    usdRateJmdPerUsd: d.usdRateJmdPerUsd ?? null,
    slotIntervalMin: d.slotIntervalMin,
    bookingLeadTimeMin: d.bookingLeadTimeMin,
    maxDaysAhead: d.maxDaysAhead,
    retentionDays: d.retentionDays,
    brandColor: d.brandColor.toLowerCase(),
    brandTextColor: d.brandTextColor.toLowerCase(),
    widgetOrigins: [...new Set(origins)],
  };

  const changed = (Object.keys(data) as (keyof typeof data)[]).filter((k) => {
    const before = business[k as keyof typeof business];
    const after = data[k];
    return JSON.stringify(before === null || before === undefined ? null : String(before)) !== JSON.stringify(after === null ? null : String(after));
  });

  await t.business.update({ where: { id: business.id }, data });
  await audit({
    businessId: business.id,
    userId: user.id,
    action: "settings.business.update",
    entityType: "Business",
    entityId: business.id,
    details: { fields: changed },
  });
  // The voice agent's name, keywords and transfer tool come from these fields: keep Retell in step.
  let voiceNote = "";
  const voiceFields = ["name", "assistantName", "handoffNumber"];
  if (business.retellAgentId && retellConfigured() && changed.some((f) => voiceFields.includes(f))) {
    try {
      await syncRetellAgent(business.id, undefined, user.id);
      voiceNote = " Voice agent updated.";
    } catch (err) {
      logger.warn({ err: (err as Error).message, businessId: business.id }, "voice agent re-sync after settings change failed");
      voiceNote = " (The voice agent couldn't be updated; Steven Scale Solutions has been notified.)";
      await enqueue(JOB.ADMIN_ALERT, { subject: "Voice agent re-sync failed", message: (err as Error).message, businessId: business.id }).catch(() => {});
    }
  }
  revalidatePath("/dashboard", "layout");
  redirectWith(BACK, "ok", `${changed.length ? `Saved (${changed.length} field${changed.length === 1 ? "" : "s"} changed).` : "Saved - nothing changed."}${voiceNote}`);
}
