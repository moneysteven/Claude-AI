"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { removeHolidayOverride, setHolidayOverride, updateHolidayRule } from "@/lib/admin";
import { requireSuperAdmin } from "@/lib/auth/session";
import { checkbox, parseForm, redirectWith } from "@/lib/forms";

const BACK = "/admin/holidays";

const ruleSchema = z.object({
  key: z.string().min(1).max(40),
  name: z.string().trim().min(1, "required").max(80),
  observedRule: z.enum(["NONE", "SUNDAY_TO_MONDAY", "WEEKEND_TO_MONDAY"]),
  active: z.string().optional(),
});

export async function updateHolidayRuleAction(formData: FormData) {
  const user = await requireSuperAdmin();
  const d = parseForm(ruleSchema, formData, BACK);
  try {
    await updateHolidayRule(d.key, { name: d.name, observedRule: d.observedRule, active: checkbox(d.active) }, user.id);
  } catch {
    redirectWith(BACK, "error", "That holiday no longer exists");
  }
  revalidatePath(BACK);
  redirectWith(BACK, "ok", `${d.name} saved`);
}

const overrideSchema = z.object({
  holidayKey: z.string().min(1).max(40),
  year: z.coerce.number().int().min(2000).max(2100),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "pick a date"),
});

export async function setHolidayOverrideAction(formData: FormData) {
  const user = await requireSuperAdmin();
  const d = parseForm(overrideSchema, formData, BACK);
  try {
    await setHolidayOverride(d.holidayKey, d.year, d.date, user.id);
  } catch (err) {
    redirectWith(BACK, "error", (err as Error).message);
  }
  revalidatePath(BACK);
  redirectWith(BACK, "ok", `Date for ${d.year} set to ${d.date}`);
}

const removeSchema = z.object({ holidayKey: z.string().min(1).max(40), year: z.coerce.number().int().min(2000).max(2100) });

export async function removeHolidayOverrideAction(formData: FormData) {
  const user = await requireSuperAdmin();
  const d = parseForm(removeSchema, formData, BACK);
  await removeHolidayOverride(d.holidayKey, d.year, user.id);
  revalidatePath(BACK);
  redirectWith(BACK, "ok", `Override for ${d.year} removed: the normal rule applies again`);
}
