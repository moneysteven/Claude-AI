import type { UserRole } from "@prisma/client";
import { audit } from "./audit";
import { hashPassword, verifyPassword } from "./auth/password";
import { randomCode, sha256Hex } from "./crypto";
import { db } from "./db";

/**
 * Dashboard accounts. New accounts get a one-time temporary password that is
 * shown once to whoever created them (Steven during onboarding, or the
 * owner); the user must choose their own password at first sign-in.
 */

export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserError";
  }
}

/** e.g. "Conroy-7K4P-Q9MZ" - easy to read out or send by WhatsApp. */
export function generateTempPassword(): string {
  return `Conroy-${randomCode(4)}-${randomCode(4)}`;
}

/** Who may create / change whom. */
export function canManageRole(actor: UserRole, target: UserRole): boolean {
  if (actor === "SUPER_ADMIN") return true;
  if (target === "SUPER_ADMIN") return false;
  if (actor === "OWNER") return true;
  if (actor === "MANAGER") return target === "STAFF";
  return false;
}

export interface NewUser {
  businessId: string | null;
  email: string;
  name: string;
  role: UserRole;
  actor: { id: string | null; role: UserRole };
}

export async function createUser(input: NewUser) {
  const email = input.email.trim().toLowerCase();
  if (!canManageRole(input.actor.role, input.role)) throw new UserError("You can't create an account with that role.");
  if (input.role !== "SUPER_ADMIN" && !input.businessId) throw new UserError("Business accounts need a business.");
  if (await db.user.findUnique({ where: { email } })) throw new UserError("An account with that email already exists.");
  const tempPassword = generateTempPassword();
  const user = await db.user.create({
    data: {
      email,
      name: input.name.trim(),
      role: input.role,
      businessId: input.role === "SUPER_ADMIN" ? null : input.businessId,
      passwordHash: await hashPassword(tempPassword),
      mustChangePassword: true,
    },
  });
  await audit({ businessId: input.businessId, userId: input.actor.id, action: "user.create", entityType: "User", entityId: user.id, details: { role: input.role } });
  return { user, tempPassword };
}

async function loadManaged(userId: string, businessId: string | null, actor: { id: string; role: UserRole }) {
  const user = await db.user.findUnique({ where: { id: userId } });
  // Business users can only touch accounts in their own business.
  if (!user || (actor.role !== "SUPER_ADMIN" && user.businessId !== businessId)) throw new UserError("Account not found.");
  if (!canManageRole(actor.role, user.role)) throw new UserError("You can't change that account.");
  return user;
}

export async function resetUserPassword(userId: string, businessId: string | null, actor: { id: string; role: UserRole }) {
  const user = await loadManaged(userId, businessId, actor);
  const tempPassword = generateTempPassword();
  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(tempPassword), mustChangePassword: true } }),
    db.session.deleteMany({ where: { userId: user.id } }),
  ]);
  await audit({ businessId: user.businessId, userId: actor.id, action: "user.reset_password", entityType: "User", entityId: user.id });
  return { user, tempPassword };
}

export async function setUserActive(userId: string, businessId: string | null, active: boolean, actor: { id: string; role: UserRole }) {
  const user = await loadManaged(userId, businessId, actor);
  if (user.id === actor.id && !active) throw new UserError("You can't deactivate your own account.");
  if (!active && user.role === "OWNER" && user.businessId) {
    const owners = await db.user.count({ where: { businessId: user.businessId, role: "OWNER", active: true } });
    if (owners <= 1) throw new UserError("A business needs at least one active owner.");
  }
  await db.user.update({ where: { id: user.id }, data: { active } });
  if (!active) await db.session.deleteMany({ where: { userId: user.id } });
  await audit({ businessId: user.businessId, userId: actor.id, action: active ? "user.activate" : "user.deactivate", entityType: "User", entityId: user.id });
}

export async function changeRole(userId: string, businessId: string | null, role: UserRole, actor: { id: string; role: UserRole }) {
  const user = await loadManaged(userId, businessId, actor);
  if (!canManageRole(actor.role, role) || role === "SUPER_ADMIN") throw new UserError("You can't give that role.");
  if (user.id === actor.id) throw new UserError("You can't change your own role.");
  if (user.role === "OWNER" && role !== "OWNER" && user.businessId) {
    const owners = await db.user.count({ where: { businessId: user.businessId, role: "OWNER", active: true } });
    if (owners <= 1) throw new UserError("A business needs at least one active owner.");
  }
  await db.user.update({ where: { id: user.id }, data: { role } });
  await audit({ businessId: user.businessId, userId: actor.id, action: "user.role", entityType: "User", entityId: user.id, details: { role } });
}

/**
 * The signed-in user changes their own password. Other sessions are signed
 * out; `keepSessionToken` keeps the current browser signed in.
 */
export async function changeOwnPassword(
  userId: string,
  current: string,
  next: string,
  keepSessionToken?: string,
  opts: { skipCurrentCheck?: boolean } = {},
) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!opts.skipCurrentCheck && !(await verifyPassword(current, user.passwordHash))) throw new UserError("Your current password is wrong.");
  if (next.length < 10) throw new UserError("Use at least 10 characters.");
  if (!opts.skipCurrentCheck && next === current) throw new UserError("Choose a password different from the temporary one.");
  if (/^conroy-/i.test(next)) throw new UserError("Choose your own password, not the temporary one.");
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next), mustChangePassword: false } });
  await db.session.deleteMany({
    where: { userId: user.id, ...(keepSessionToken ? { tokenHash: { not: sha256Hex(keepSessionToken) } } : {}) },
  });
  await audit({ businessId: user.businessId, userId: user.id, action: "user.change_password", entityType: "User", entityId: user.id });
}
