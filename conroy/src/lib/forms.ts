import { redirect } from "next/navigation";
import type { z } from "zod";

/**
 * Helpers for dashboard server actions: read FormData into a zod schema and
 * bounce back with a readable message on error.
 */

export function formObject(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string" && !key.startsWith("$ACTION")) out[key] = value.trim();
  }
  return out;
}

export function parseForm<T extends z.ZodTypeAny>(schema: T, formData: FormData, backTo: string): z.infer<T> {
  const result = schema.safeParse(formObject(formData));
  if (!result.success) {
    const first = result.error.issues[0];
    const field = first?.path.join(".") || "form";
    redirectWith(backTo, "error", `${field}: ${first?.message ?? "invalid value"}`);
  }
  return result.data;
}

export function redirectWith(path: string, kind: "ok" | "error", message: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}${kind}=${encodeURIComponent(message)}`);
}

/** "on" checkbox -> boolean */
export const checkbox = (v: string | undefined) => v === "on" || v === "true";

/** Empty string -> undefined, for optional fields. */
export const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
