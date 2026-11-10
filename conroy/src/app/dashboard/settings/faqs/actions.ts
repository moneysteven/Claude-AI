"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireTenant, SETTINGS_ROLES } from "@/lib/auth/session";
import { parseForm, redirectWith } from "@/lib/forms";
import { flag, intIn, optText, POLICY_KINDS, reqText } from "../_lib";

const BACK = "/dashboard/settings/faqs";

const faqSchema = z.object({
  id: optText(40),
  question: reqText(300),
  answer: reqText(2000),
  keywords: optText(500),
  active: flag,
  sortOrder: intIn(0, 1000),
});

function parseKeywords(raw: string | undefined): string[] {
  return [
    ...new Set(
      (raw ?? "")
        .split(",")
        .map((k) => k.trim().toLowerCase())
        .filter((k) => k.length > 0 && k.length <= 40),
    ),
  ].slice(0, 20);
}

export async function saveFaqAction(formData: FormData) {
  const { user, business, t } = await requireTenant(SETTINGS_ROLES);
  const d = parseForm(faqSchema, formData, BACK);
  const data = { question: d.question, answer: d.answer, keywords: parseKeywords(d.keywords), active: d.active, sortOrder: d.sortOrder };
  if (d.id) {
    const res = await t.faq.updateMany({ where: { id: d.id }, data });
    if (res.count === 0) redirectWith(BACK, "error", "FAQ not found");
    await audit({ businessId: business.id, userId: user.id, action: "settings.faq.update", entityType: "Faq", entityId: d.id });
  } else {
    const created = await t.faq.create({ data: { businessId: business.id, ...data } });
    await audit({ businessId: business.id, userId: user.id, action: "settings.faq.create", entityType: "Faq", entityId: created.id });
  }
  revalidatePath(BACK);
  redirectWith(BACK, "ok", "FAQ saved");
}

export async function deleteFaqAction(formData: FormData) {
  const { user, business, t } = await requireTenant(SETTINGS_ROLES);
  const d = parseForm(z.object({ id: z.string().min(1) }), formData, BACK);
  const res = await t.faq.deleteMany({ where: { id: d.id } });
  await audit({ businessId: business.id, userId: user.id, action: "settings.faq.delete", entityType: "Faq", entityId: d.id });
  revalidatePath(BACK);
  redirectWith(BACK, res.count ? "ok" : "error", res.count ? "FAQ deleted" : "Not found");
}

const policySchema = z.object({
  id: optText(40),
  kind: z.enum(POLICY_KINDS),
  title: reqText(120),
  body: reqText(2000),
  sortOrder: intIn(0, 1000),
});

export async function savePolicyAction(formData: FormData) {
  const { user, business, t } = await requireTenant(SETTINGS_ROLES);
  const d = parseForm(policySchema, formData, BACK);
  const data = { kind: d.kind, title: d.title, body: d.body, sortOrder: d.sortOrder };
  if (d.id) {
    const res = await t.policy.updateMany({ where: { id: d.id }, data });
    if (res.count === 0) redirectWith(BACK, "error", "Policy not found");
    await audit({ businessId: business.id, userId: user.id, action: "settings.policy.update", entityType: "Policy", entityId: d.id });
  } else {
    const created = await t.policy.create({ data: { businessId: business.id, ...data } });
    await audit({ businessId: business.id, userId: user.id, action: "settings.policy.create", entityType: "Policy", entityId: created.id });
  }
  revalidatePath(BACK);
  redirectWith(BACK, "ok", "Policy saved");
}

export async function deletePolicyAction(formData: FormData) {
  const { user, business, t } = await requireTenant(SETTINGS_ROLES);
  const d = parseForm(z.object({ id: z.string().min(1) }), formData, BACK);
  const res = await t.policy.deleteMany({ where: { id: d.id } });
  await audit({ businessId: business.id, userId: user.id, action: "settings.policy.delete", entityType: "Policy", entityId: d.id });
  revalidatePath(BACK);
  redirectWith(BACK, res.count ? "ok" : "error", res.count ? "Policy deleted" : "Not found");
}
