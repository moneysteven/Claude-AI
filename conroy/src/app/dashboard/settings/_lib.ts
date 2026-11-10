import { z } from "zod";
import { env } from "@/lib/env";
import { blankToUndefined, checkbox, redirectWith } from "@/lib/forms";
import { parseJmdToCents } from "@/lib/money";
import { toE164 } from "@/lib/phone";

/** Shared zod helpers and converters for the settings forms. */

export const POLICY_KINDS = ["CANCELLATION", "DEPOSIT", "LATENESS", "PAYMENT", "CHILDREN", "OTHER"] as const;

export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export const reqText = (max: number) => z.string().trim().min(1, "required").max(max, `max ${max} characters`);
export const optText = (max: number) => z.preprocess(blankToUndefined, z.string().trim().max(max, `max ${max} characters`).optional());
export const optTime = z.preprocess(blankToUndefined, z.string().regex(TIME_RE, "use HH:mm").optional());
export const intIn = (min: number, max: number) => z.coerce.number().int("whole number").min(min, `min ${min}`).max(max, `max ${max}`);
/** Checkbox: present ("on") = true, absent = false. */
export const flag = z.preprocess((v) => checkbox(typeof v === "string" ? v : undefined), z.boolean());

export function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/** Normalise an optional phone field to E.164 or bounce back with a readable error. */
export function phoneOrError(value: string | undefined, label: string, back: string): string | null {
  if (!value) return null;
  const e164 = toE164(value, env.DEFAULT_AREA_CODE);
  if (!e164) redirectWith(back, "error", `${label}: "${value}" doesn't look like a valid phone number`);
  return e164;
}

/** Optional J$ amount ("4500", "4,500", "J$4,500.50") to cents, or bounce back. */
export function jmdOrError(value: string | undefined, label: string, back: string): number | null {
  if (!value) return null;
  const cents = parseJmdToCents(value);
  if (cents === null) redirectWith(back, "error", `${label}: enter an amount like 4500 or 4,500`);
  return cents;
}

/** Cents -> value for a J$ input box ("4500" or "4500.50"). */
export function centsToInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

/** Opening hours row check: both times, close after open, break (if any) inside the day. */
export function checkDayTimes(
  label: string,
  back: string,
  open?: string,
  close?: string,
  breakStart?: string,
  breakEnd?: string,
): void {
  if (!open || !close) redirectWith(back, "error", `${label}: enter opening and closing times, or tick Closed`);
  if (toMinutes(close) <= toMinutes(open)) redirectWith(back, "error", `${label}: closing time must be after opening time`);
  if (Boolean(breakStart) !== Boolean(breakEnd)) redirectWith(back, "error", `${label}: give both break start and break end, or neither`);
  if (breakStart && breakEnd) {
    const bs = toMinutes(breakStart);
    const be = toMinutes(breakEnd);
    if (be <= bs) redirectWith(back, "error", `${label}: break must end after it starts`);
    if (bs <= toMinutes(open) || be >= toMinutes(close)) redirectWith(back, "error", `${label}: break must be inside opening hours`);
  }
}
