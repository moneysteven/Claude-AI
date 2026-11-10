"use server";

import { PaymentKind, PaymentProvider } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireTenant, SETTINGS_ROLES } from "@/lib/auth/session";
import { parseForm, redirectWith } from "@/lib/forms";
import { validatePaymentTemplate } from "@/lib/payments/service";
import { flag, jmdOrError, optText, reqText } from "../_lib";

const BACK = "/dashboard/settings/payments";

const schema = z.object({
  id: optText(40),
  provider: z.enum(PaymentProvider),
  kind: z.enum(PaymentKind),
  label: reqText(80),
  urlTemplate: reqText(1000),
  defaultAmount: optText(30),
  active: flag,
});

export async function savePaymentTemplateAction(formData: FormData) {
  const { user, business, t } = await requireTenant(SETTINGS_ROLES);
  const d = parseForm(schema, formData, BACK);
  const problem = validatePaymentTemplate(d.urlTemplate);
  if (problem) redirectWith(BACK, "error", `Payment link: ${problem}`);
  const defaultAmountCents = jmdOrError(d.defaultAmount, "Default amount", BACK);
  const data = {
    provider: d.provider,
    kind: d.kind,
    label: d.label,
    urlTemplate: d.urlTemplate,
    defaultAmountCents: defaultAmountCents && defaultAmountCents > 0 ? defaultAmountCents : null,
    active: d.active,
  };
  if (d.id) {
    const res = await t.paymentLinkTemplate.updateMany({ where: { id: d.id }, data });
    if (res.count === 0) redirectWith(BACK, "error", "Payment link not found");
    await audit({ businessId: business.id, userId: user.id, action: "settings.payment_link.update", entityType: "PaymentLinkTemplate", entityId: d.id });
  } else {
    const created = await t.paymentLinkTemplate.create({ data: { businessId: business.id, ...data } });
    await audit({ businessId: business.id, userId: user.id, action: "settings.payment_link.create", entityType: "PaymentLinkTemplate", entityId: created.id });
  }
  revalidatePath(BACK);
  redirectWith(BACK, "ok", `Saved "${d.label}"`);
}

export async function deletePaymentTemplateAction(formData: FormData) {
  const { user, business, t } = await requireTenant(SETTINGS_ROLES);
  const d = parseForm(z.object({ id: z.string().min(1) }), formData, BACK);
  const template = await t.paymentLinkTemplate.findFirst({ where: { id: d.id } });
  if (!template) redirectWith(BACK, "error", "Payment link not found");
  const used = await t.paymentRequest.count({ where: { templateId: d.id } });
  if (used > 0) {
    // Past payment requests point at this template: keep it, just switch it off.
    await t.paymentLinkTemplate.updateMany({ where: { id: d.id }, data: { active: false } });
    await audit({ businessId: business.id, userId: user.id, action: "settings.payment_link.deactivate", entityType: "PaymentLinkTemplate", entityId: d.id });
    revalidatePath(BACK);
    redirectWith(BACK, "ok", `"${template.label}" has been used before, so it was switched off instead of deleted`);
  }
  await t.paymentLinkTemplate.deleteMany({ where: { id: d.id } });
  await audit({ businessId: business.id, userId: user.id, action: "settings.payment_link.delete", entityType: "PaymentLinkTemplate", entityId: d.id });
  revalidatePath(BACK);
  redirectWith(BACK, "ok", `Deleted "${template.label}"`);
}
