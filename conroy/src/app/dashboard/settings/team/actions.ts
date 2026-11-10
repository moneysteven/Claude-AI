"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { requireTenant, SETTINGS_ROLES } from "@/lib/auth/session";
import { encryptJson } from "@/lib/crypto";
import { parseForm, redirectWith } from "@/lib/forms";
import { changeRole, createUser, resetUserPassword, setUserActive, UserError } from "@/lib/users";

const BACK = "/dashboard/settings/team";
const SECRET_COOKIE = "conroy_flash_secret";

/**
 * A new temporary password is handed to the page in a short-lived, encrypted,
 * httpOnly cookie (never in the URL or logs); the page shows it once and
 * clears it.
 */
async function stashTempPassword(email: string, password: string) {
  (await cookies()).set(SECRET_COOKIE, encryptJson({ email, password }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: BACK,
    maxAge: 60,
  });
}

function fail(err: unknown): never {
  if (err instanceof UserError) redirectWith(BACK, "error", err.message);
  throw err;
}

const addSchema = z.object({
  name: z.string().trim().min(1, "required").max(120),
  email: z.string().trim().email("enter a valid email").max(200),
  role: z.enum(["OWNER", "MANAGER", "STAFF"]),
});

export async function addUserAction(formData: FormData) {
  const { user, business } = await requireTenant(SETTINGS_ROLES);
  const d = parseForm(addSchema, formData, BACK);
  let created: Awaited<ReturnType<typeof createUser>>;
  try {
    created = await createUser({ businessId: business.id, email: d.email, name: d.name, role: d.role, actor: { id: user.id, role: user.role } });
  } catch (err) {
    fail(err);
  }
  await stashTempPassword(created.user.email, created.tempPassword);
  revalidatePath(BACK);
  redirectWith(BACK, "ok", `Account created for ${created.user.name}`);
}

const idSchema = z.object({ userId: z.string().min(1).max(40) });

export async function resetPasswordAction(formData: FormData) {
  const { user, business } = await requireTenant(SETTINGS_ROLES);
  const d = parseForm(idSchema, formData, BACK);
  let reset: Awaited<ReturnType<typeof resetUserPassword>>;
  try {
    reset = await resetUserPassword(d.userId, business.id, { id: user.id, role: user.role });
  } catch (err) {
    fail(err);
  }
  await stashTempPassword(reset.user.email, reset.tempPassword);
  revalidatePath(BACK);
  redirectWith(BACK, "ok", `New temporary password for ${reset.user.name}; they've been signed out everywhere`);
}

const activeSchema = z.object({ userId: z.string().min(1).max(40), active: z.enum(["true", "false"]) });

export async function setActiveAction(formData: FormData) {
  const { user, business } = await requireTenant(SETTINGS_ROLES);
  const d = parseForm(activeSchema, formData, BACK);
  try {
    await setUserActive(d.userId, business.id, d.active === "true", { id: user.id, role: user.role });
  } catch (err) {
    fail(err);
  }
  revalidatePath(BACK);
  redirectWith(BACK, "ok", d.active === "true" ? "Account re-activated" : "Account deactivated and signed out");
}

const roleSchema = z.object({ userId: z.string().min(1).max(40), role: z.enum(["OWNER", "MANAGER", "STAFF"]) });

export async function changeRoleAction(formData: FormData) {
  const { user, business } = await requireTenant(SETTINGS_ROLES);
  const d = parseForm(roleSchema, formData, BACK);
  try {
    await changeRole(d.userId, business.id, d.role, { id: user.id, role: user.role });
  } catch (err) {
    fail(err);
  }
  revalidatePath(BACK);
  redirectWith(BACK, "ok", "Role updated");
}

/** Called by the page once the temporary password has been shown. */
export async function clearTempPasswordAction() {
  await requireTenant(SETTINGS_ROLES);
  (await cookies()).delete({ name: SECRET_COOKIE, path: BACK });
}
