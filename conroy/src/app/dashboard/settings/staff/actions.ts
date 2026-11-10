"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireTenant, SETTINGS_ROLES } from "@/lib/auth/session";
import { formObject, parseForm, redirectWith } from "@/lib/forms";
import { addDays, isLocalDate, localToUtc, WEEKDAY_NAMES } from "@/lib/time";
import { checkDayTimes, DATE_RE, flag, intIn, optText, optTime, phoneOrError, reqText, TIME_RE } from "../_lib";

const BACK = "/dashboard/settings/staff";

const staffSchema = z.object({
  id: optText(40),
  name: reqText(80),
  title: optText(80),
  phone: optText(30),
  calendarId: optText(200),
  acceptsBookings: flag,
  active: flag,
  sortOrder: intIn(0, 1000),
});

export async function saveStaffAction(formData: FormData) {
  const { user, business, t } = await requireTenant(SETTINGS_ROLES);
  const d = parseForm(staffSchema, formData, BACK);
  const data = {
    name: d.name,
    title: d.title ?? null,
    phone: phoneOrError(d.phone, "Phone", BACK),
    calendarId: d.calendarId ?? null,
    acceptsBookings: d.acceptsBookings,
    active: d.active,
    sortOrder: d.sortOrder,
  };
  if (d.id) {
    const res = await t.staff.updateMany({ where: { id: d.id }, data });
    if (res.count === 0) redirectWith(BACK, "error", "Staff member not found");
    await audit({ businessId: business.id, userId: user.id, action: "settings.staff.update", entityType: "Staff", entityId: d.id });
  } else {
    const created = await t.staff.create({ data: { businessId: business.id, ...data } });
    await audit({ businessId: business.id, userId: user.id, action: "settings.staff.create", entityType: "Staff", entityId: created.id });
  }
  revalidatePath(BACK);
  redirectWith(BACK, "ok", `Saved ${d.name}`);
}

async function ownStaff(t: Awaited<ReturnType<typeof requireTenant>>["t"], staffId: string | undefined) {
  if (!staffId) redirectWith(BACK, "error", "Staff member missing");
  const staff = await t.staff.findFirst({ where: { id: staffId } });
  if (!staff) redirectWith(BACK, "error", "Staff member not found");
  return staff;
}

export async function setStaffServicesAction(formData: FormData) {
  const { user, business, t } = await requireTenant(SETTINGS_ROLES);
  const staff = await ownStaff(t, formObject(formData).staffId);
  const requested = formData
    .getAll("serviceId")
    .filter((v): v is string => typeof v === "string")
    .slice(0, 200);
  // Only this business's services can be linked.
  const valid = await t.service.findMany({ where: { id: { in: requested } }, select: { id: true } });
  await t.$transaction(async (tx) => {
    await tx.staffService.deleteMany({ where: { staffId: staff.id } });
    if (valid.length) {
      await tx.staffService.createMany({ data: valid.map((s) => ({ businessId: business.id, staffId: staff.id, serviceId: s.id })) });
    }
  });
  await audit({
    businessId: business.id,
    userId: user.id,
    action: "settings.staff.services",
    entityType: "Staff",
    entityId: staff.id,
    details: { services: valid.length },
  });
  revalidatePath(BACK);
  redirectWith(BACK, "ok", `${staff.name} now does ${valid.length} service(s)`);
}

export async function setStaffScheduleAction(formData: FormData) {
  const { user, business, t } = await requireTenant(SETTINGS_ROLES);
  const f = formObject(formData);
  const staff = await ownStaff(t, f.staffId);

  if (f.followsBusiness === "on") {
    await t.staffSchedule.deleteMany({ where: { staffId: staff.id } });
    await audit({ businessId: business.id, userId: user.id, action: "settings.staff.schedule", entityType: "Staff", entityId: staff.id, details: { followsBusiness: true } });
    revalidatePath(BACK);
    redirectWith(BACK, "ok", `${staff.name} now follows the business hours`);
  }

  const rows = [];
  for (let wd = 0; wd <= 6; wd++) {
    const label = `${staff.name}, ${WEEKDAY_NAMES[wd]}`;
    const off = f[`off_${wd}`] === "on";
    const values = [f[`start_${wd}`], f[`end_${wd}`], f[`breakStart_${wd}`], f[`breakEnd_${wd}`]].map((v) => (v ? v : undefined));
    const bad = values.find((v) => v && !TIME_RE.test(v));
    if (bad) redirectWith(BACK, "error", `${label}: "${bad}" is not a time (use HH:mm)`);
    const [start, end, breakStart, breakEnd] = values;
    if (!off) checkDayTimes(label, BACK, start, end, breakStart, breakEnd);
    rows.push(
      off
        ? { weekday: wd, isOff: true, startTime: null, endTime: null, breakStart: null, breakEnd: null }
        : { weekday: wd, isOff: false, startTime: start!, endTime: end!, breakStart: breakStart ?? null, breakEnd: breakEnd ?? null },
    );
  }
  for (const row of rows) {
    await t.staffSchedule.upsert({
      where: { staffId_weekday: { staffId: staff.id, weekday: row.weekday } },
      create: { businessId: business.id, staffId: staff.id, ...row },
      update: row,
    });
  }
  await audit({ businessId: business.id, userId: user.id, action: "settings.staff.schedule", entityType: "Staff", entityId: staff.id });
  revalidatePath(BACK);
  redirectWith(BACK, "ok", `Saved ${staff.name}'s schedule`);
}

const timeOffSchema = z.object({
  staffId: z.string().min(1),
  date: z.string().regex(DATE_RE, "pick a date"),
  endDate: z.preprocess((v) => (v === "" ? undefined : v), z.string().regex(DATE_RE).optional()),
  allDay: flag,
  startTime: optTime,
  endTime: optTime,
  reason: optText(200),
});

export async function addTimeOffAction(formData: FormData) {
  const { user, business, t } = await requireTenant(SETTINGS_ROLES);
  const d = parseForm(timeOffSchema, formData, BACK);
  const staff = await ownStaff(t, d.staffId);
  const endDate = d.endDate ?? d.date;
  if (!isLocalDate(d.date) || !isLocalDate(endDate)) redirectWith(BACK, "error", "That date doesn't exist");
  if (endDate < d.date) redirectWith(BACK, "error", "End date must be on or after the start date");
  const tz = business.timezone;
  let startAt: Date;
  let endAt: Date;
  if (d.allDay) {
    startAt = localToUtc(d.date, "00:00", tz);
    endAt = localToUtc(addDays(endDate, 1), "00:00", tz);
  } else {
    if (!d.startTime || !d.endTime) redirectWith(BACK, "error", "Give start and end times, or tick All day");
    startAt = localToUtc(d.date, d.startTime, tz);
    endAt = localToUtc(endDate, d.endTime, tz);
  }
  if (endAt <= startAt) redirectWith(BACK, "error", "Time off must end after it starts");
  const created = await t.staffTimeOff.create({
    data: { businessId: business.id, staffId: staff.id, startAt, endAt, reason: d.reason ?? null },
  });
  await audit({ businessId: business.id, userId: user.id, action: "settings.staff.time_off.add", entityType: "StaffTimeOff", entityId: created.id });
  revalidatePath(BACK);
  redirectWith(BACK, "ok", `Time off added for ${staff.name}`);
}

export async function deleteTimeOffAction(formData: FormData) {
  const { user, business, t } = await requireTenant(SETTINGS_ROLES);
  const d = parseForm(z.object({ id: z.string().min(1) }), formData, BACK);
  const res = await t.staffTimeOff.deleteMany({ where: { id: d.id } });
  await audit({ businessId: business.id, userId: user.id, action: "settings.staff.time_off.delete", entityType: "StaffTimeOff", entityId: d.id });
  revalidatePath(BACK);
  redirectWith(BACK, res.count ? "ok" : "error", res.count ? "Time off removed" : "Not found");
}
