"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireTenant } from "@/lib/auth/session";
import { cancelBooking, createBooking, rescheduleBooking } from "@/lib/booking/service";
import { parseForm, redirectWith } from "@/lib/forms";
import { toE164 } from "@/lib/phone";
import { localToUtc } from "@/lib/time";

const BACK = "/dashboard/bookings";

const createSchema = z.object({
  serviceId: z.string().min(1),
  staffId: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "pick a date"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "pick a time"),
  customerName: z.string().min(1).max(120),
  customerPhone: z.string().max(30).optional(),
  notes: z.string().max(1000).optional(),
});

export async function createBookingAction(formData: FormData) {
  const { user, business } = await requireTenant();
  const d = parseForm(createSchema, formData, BACK);
  const phone = d.customerPhone ? toE164(d.customerPhone) : null;
  if (d.customerPhone && !phone) redirectWith(BACK, "error", "That phone number doesn't look right");
  const result = await createBooking({
    businessId: business.id,
    serviceId: d.serviceId,
    staffId: d.staffId || null,
    startAt: localToUtc(d.date, d.time, business.timezone),
    customerName: d.customerName,
    customerPhone: phone,
    notes: d.notes,
    actor: { channel: "DASHBOARD", userId: user.id },
  });
  revalidatePath(BACK);
  if (!result.ok) {
    const alt = result.alternatives.map((s) => `${s.localDate} ${s.localTime}`).join(", ");
    redirectWith(BACK, "error", `${result.message}${alt ? ` Free: ${alt}` : ""}`);
  }
  redirectWith(BACK, "ok", `Booked ${result.booking.reference}${phone ? " - WhatsApp confirmation sent" : ""}`);
}

const idSchema = z.object({ bookingId: z.string().min(1), reason: z.string().max(300).optional() });

export async function cancelBookingAction(formData: FormData) {
  const { user, business } = await requireTenant();
  const d = parseForm(idSchema, formData, BACK);
  const res = await cancelBooking({ businessId: business.id, bookingId: d.bookingId, reason: d.reason ?? "Cancelled by staff", actor: { channel: "DASHBOARD", userId: user.id } });
  revalidatePath(BACK);
  if (!res.ok) redirectWith(BACK, "error", res.message);
  redirectWith(BACK, "ok", `Cancelled ${res.booking.reference}`);
}

const rescheduleSchema = z.object({
  bookingId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
});

export async function rescheduleBookingAction(formData: FormData) {
  const { user, business } = await requireTenant();
  const d = parseForm(rescheduleSchema, formData, BACK);
  const res = await rescheduleBooking({
    businessId: business.id,
    bookingId: d.bookingId,
    newStartAt: localToUtc(d.date, d.time, business.timezone),
    actor: { channel: "DASHBOARD", userId: user.id },
  });
  revalidatePath(BACK);
  if (!res.ok) {
    const alt = res.alternatives.map((s) => `${s.localDate} ${s.localTime}`).join(", ");
    redirectWith(BACK, "error", `${res.message}${alt ? ` Free: ${alt}` : ""}`);
  }
  redirectWith(BACK, "ok", `Moved ${res.booking.reference}`);
}

const statusSchema = z.object({ bookingId: z.string().min(1), status: z.enum(["COMPLETED", "NO_SHOW"]) });

export async function markBookingAction(formData: FormData) {
  const { t } = await requireTenant();
  const d = parseForm(statusSchema, formData, BACK);
  await t.booking.update({ where: { id: d.bookingId }, data: { status: d.status } });
  revalidatePath(BACK);
  redirectWith(BACK, "ok", "Updated");
}
