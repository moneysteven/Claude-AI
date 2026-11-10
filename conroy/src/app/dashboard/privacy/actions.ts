"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireTenant, SETTINGS_ROLES } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { checkbox, parseForm, redirectWith } from "@/lib/forms";
import { formatPhone, toE164 } from "@/lib/phone";
import { erasePersonData } from "@/lib/privacy/retention";

const BACK = "/dashboard/privacy";

const eraseSchema = z.object({
  phone: z.string().trim().min(3, "enter a phone number").max(30),
  confirm: z.preprocess((v) => checkbox(typeof v === "string" ? v : undefined), z.literal(true, "tick the box to confirm")),
});

export async function erasePersonAction(formData: FormData) {
  const { user, business } = await requireTenant(SETTINGS_ROLES);
  const d = parseForm(eraseSchema, formData, BACK);
  const phone = toE164(d.phone, env.DEFAULT_AREA_CODE);
  if (!phone) redirectWith(BACK, "error", `"${d.phone}" doesn't look like a valid phone number`);
  const result = await erasePersonData(business.id, phone, user.id);
  revalidatePath("/dashboard", "layout");
  const total = Object.values(result).reduce((s, n) => s + n, 0);
  if (total === 0) redirectWith(BACK, "ok", `Nothing was stored for ${formatPhone(phone)}`);
  redirectWith(
    BACK,
    "ok",
    `Erased data for ${formatPhone(phone)}: ${result.contacts} contact, ${result.conversations} conversation(s), ${result.leads} lead(s), ` +
      `${result.calls} call record(s) and ${result.payments} payment request(s) cleared; ${result.bookings} booking(s) anonymised.` +
      (result.retellCalls ? " The voice provider's copies of the calls are being deleted." : ""),
  );
}
