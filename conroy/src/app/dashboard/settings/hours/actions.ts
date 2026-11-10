"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireTenant, SETTINGS_ROLES } from "@/lib/auth/session";
import { loadHolidayRules } from "@/lib/business";
import { formObject, parseForm, redirectWith } from "@/lib/forms";
import { isLocalDate, WEEKDAY_NAMES } from "@/lib/time";
import { checkDayTimes, DATE_RE, flag, optText, optTime, TIME_RE } from "../_lib";

const BACK = "/dashboard/settings/hours";

const asTime = (v: string | undefined) => (v && TIME_RE.test(v) ? v : undefined);

export async function saveWeeklyHoursAction(formData: FormData) {
  const { user, business, t } = await requireTenant(SETTINGS_ROLES);
  const f = formObject(formData);
  const rows = [];
  for (let wd = 0; wd <= 6; wd++) {
    const label = WEEKDAY_NAMES[wd];
    const closed = f[`closed_${wd}`] === "on";
    const raw = [f[`open_${wd}`], f[`close_${wd}`], f[`breakStart_${wd}`], f[`breakEnd_${wd}`]];
    const bad = raw.find((v) => v && !TIME_RE.test(v));
    if (bad) redirectWith(BACK, "error", `${label}: "${bad}" is not a time (use HH:mm)`);
    const [open, close, breakStart, breakEnd] = raw.map(asTime);
    if (!closed) checkDayTimes(label, BACK, open, close, breakStart, breakEnd);
    rows.push(
      closed
        ? { weekday: wd, isClosed: true, openTime: null, closeTime: null, breakStart: null, breakEnd: null }
        : { weekday: wd, isClosed: false, openTime: open!, closeTime: close!, breakStart: breakStart ?? null, breakEnd: breakEnd ?? null },
    );
  }
  for (const row of rows) {
    await t.businessHours.upsert({
      where: { businessId_weekday: { businessId: business.id, weekday: row.weekday } },
      create: { businessId: business.id, ...row },
      update: row,
    });
  }
  await audit({ businessId: business.id, userId: user.id, action: "settings.hours.update", entityType: "BusinessHours" });
  revalidatePath(BACK);
  redirectWith(BACK, "ok", "Opening hours saved");
}

const overrideSchema = z.object({
  date: z.string().regex(DATE_RE, "pick a date"),
  isClosed: flag,
  openTime: optTime,
  closeTime: optTime,
  note: optText(120),
});

export async function saveDateOverrideAction(formData: FormData) {
  const { user, business, t } = await requireTenant(SETTINGS_ROLES);
  const d = parseForm(overrideSchema, formData, BACK);
  if (!isLocalDate(d.date)) redirectWith(BACK, "error", "That date doesn't exist");
  if (!d.isClosed) checkDayTimes(d.date, BACK, d.openTime, d.closeTime);
  const data = {
    isClosed: d.isClosed,
    openTime: d.isClosed ? null : d.openTime!,
    closeTime: d.isClosed ? null : d.closeTime!,
    note: d.note ?? null,
  };
  await t.dateOverride.upsert({
    where: { businessId_date: { businessId: business.id, date: d.date } },
    create: { businessId: business.id, date: d.date, ...data },
    update: data,
  });
  await audit({ businessId: business.id, userId: user.id, action: "settings.date_override.save", entityType: "DateOverride", details: { date: d.date, closed: d.isClosed } });
  revalidatePath(BACK);
  redirectWith(BACK, "ok", `Saved special hours for ${d.date}`);
}

export async function deleteDateOverrideAction(formData: FormData) {
  const { user, business, t } = await requireTenant(SETTINGS_ROLES);
  const d = parseForm(z.object({ id: z.string().min(1) }), formData, BACK);
  const res = await t.dateOverride.deleteMany({ where: { id: d.id } });
  await audit({ businessId: business.id, userId: user.id, action: "settings.date_override.delete", entityType: "DateOverride", entityId: d.id });
  revalidatePath(BACK);
  redirectWith(BACK, res.count ? "ok" : "error", res.count ? "Removed" : "Not found");
}

const holidaySchema = z.object({
  holidayKey: z.string().min(1).max(60),
  isOpen: flag,
  openTime: optTime,
  closeTime: optTime,
});

export async function saveHolidaySettingAction(formData: FormData) {
  const { user, business, t } = await requireTenant(SETTINGS_ROLES);
  const d = parseForm(holidaySchema, formData, BACK);
  const { rules } = await loadHolidayRules();
  const rule = rules.find((r) => r.key === d.holidayKey);
  if (!rule) redirectWith(BACK, "error", "Unknown holiday");
  if (d.isOpen && (d.openTime || d.closeTime)) checkDayTimes(rule.name, BACK, d.openTime, d.closeTime);
  const data = {
    isOpen: d.isOpen,
    openTime: d.isOpen && d.openTime ? d.openTime : null,
    closeTime: d.isOpen && d.closeTime ? d.closeTime : null,
  };
  await t.businessHolidaySetting.upsert({
    where: { businessId_holidayKey: { businessId: business.id, holidayKey: d.holidayKey } },
    create: { businessId: business.id, holidayKey: d.holidayKey, ...data },
    update: data,
  });
  await audit({
    businessId: business.id,
    userId: user.id,
    action: "settings.holiday.save",
    entityType: "BusinessHolidaySetting",
    details: { holidayKey: d.holidayKey, open: d.isOpen },
  });
  revalidatePath(BACK);
  redirectWith(BACK, "ok", `${rule.name}: ${d.isOpen ? "open" : "closed"}`);
}
