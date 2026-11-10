"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { canResetWithoutCurrentPassword, currentSession, currentSessionToken } from "@/lib/auth/session";
import { redirectWith } from "@/lib/forms";
import { rateLimit } from "@/lib/ratelimit";
import { changeOwnPassword, UserError } from "@/lib/users";

const BACK = "/account";

const schema = z.object({
  current: z.string().max(200),
  next: z.string().min(10, "use at least 10 characters").max(200),
  confirm: z.string().max(200),
});

export async function changePasswordAction(formData: FormData) {
  const session = await currentSession();
  if (!session) redirect("/login");
  const user = session.user;
  const viaLink = canResetWithoutCurrentPassword(session);
  const back = user.mustChangePassword ? `${BACK}?first=1` : BACK;
  const limit = rateLimit(`pwchange:${user.id}`, 5, 15 * 60 * 1000);
  if (!limit.allowed) redirectWith(back, "error", "Too many attempts. Try again in 15 minutes.");
  // Read raw (not trimmed): login compares the password exactly as typed.
  const parsed = schema.safeParse({ current: formData.get("current") ?? "", next: formData.get("next"), confirm: formData.get("confirm") });
  if (!parsed.success) redirectWith(back, "error", parsed.error.issues[0]?.message ?? "Check the form");
  const d = parsed.data;
  if (!viaLink && !d.current) redirectWith(back, "error", "Enter your current password");
  if (d.next !== d.confirm) redirectWith(back, "error", "The new passwords don't match");
  try {
    await changeOwnPassword(user.id, d.current, d.next, await currentSessionToken(), { skipCurrentCheck: viaLink });
  } catch (err) {
    if (err instanceof UserError) redirectWith(back, "error", err.message);
    throw err;
  }
  redirect(`${user.role === "SUPER_ADMIN" ? "/admin" : "/dashboard"}?ok=Password%20updated`);
}
