"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireTenant, SETTINGS_ROLES } from "@/lib/auth/session";
import { parseForm, redirectWith } from "@/lib/forms";
import { flag, intIn, jmdOrError, optText, reqText } from "../_lib";

const BACK = "/dashboard/settings/services";

const serviceSchema = z.object({
  id: optText(40),
  name: reqText(100),
  description: optText(500),
  durationMin: intIn(5, 720),
  bufferMin: intIn(0, 240),
  price: optText(30),
  priceIsFrom: flag,
  deposit: optText(30),
  bookable: flag,
  active: flag,
  sortOrder: intIn(0, 1000),
});

export async function saveServiceAction(formData: FormData) {
  const { user, business, t } = await requireTenant(SETTINGS_ROLES);
  const d = parseForm(serviceSchema, formData, BACK);
  const priceCents = jmdOrError(d.price, "Price", BACK);
  const depositCents = jmdOrError(d.deposit, "Deposit", BACK);
  if (priceCents !== null && depositCents !== null && depositCents > priceCents && !d.priceIsFrom) {
    redirectWith(BACK, "error", "The deposit can't be more than the price");
  }
  const data = {
    name: d.name,
    description: d.description ?? null,
    durationMin: d.durationMin,
    bufferMin: d.bufferMin,
    priceCents,
    priceIsFrom: d.priceIsFrom,
    depositCents: depositCents && depositCents > 0 ? depositCents : null,
    bookable: d.bookable,
    active: d.active,
    sortOrder: d.sortOrder,
  };
  if (d.id) {
    const res = await t.service.updateMany({ where: { id: d.id }, data });
    if (res.count === 0) redirectWith(BACK, "error", "Service not found");
    await audit({ businessId: business.id, userId: user.id, action: "settings.service.update", entityType: "Service", entityId: d.id });
  } else {
    const created = await t.service.create({ data: { businessId: business.id, ...data } });
    await audit({ businessId: business.id, userId: user.id, action: "settings.service.create", entityType: "Service", entityId: created.id });
  }
  revalidatePath(BACK);
  redirectWith(BACK, "ok", `Saved "${d.name}"`);
}

export async function deleteServiceAction(formData: FormData) {
  const { user, business, t } = await requireTenant(SETTINGS_ROLES);
  const d = parseForm(z.object({ id: z.string().min(1) }), formData, BACK);
  const service = await t.service.findFirst({ where: { id: d.id } });
  if (!service) redirectWith(BACK, "error", "Service not found");
  const used = await t.booking.count({ where: { serviceId: d.id } });
  if (used > 0) {
    // Keep history intact: bookings point at this service.
    await t.service.updateMany({ where: { id: d.id }, data: { active: false, bookable: false } });
    await audit({ businessId: business.id, userId: user.id, action: "settings.service.deactivate", entityType: "Service", entityId: d.id });
    revalidatePath(BACK);
    redirectWith(BACK, "ok", `"${service.name}" has bookings, so it was switched off instead of deleted`);
  }
  await t.service.deleteMany({ where: { id: d.id } });
  await audit({ businessId: business.id, userId: user.id, action: "settings.service.delete", entityType: "Service", entityId: d.id });
  revalidatePath(BACK);
  redirectWith(BACK, "ok", `Deleted "${service.name}"`);
}
