import type { Business, User, UserRole } from "@prisma/client";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { randomToken, sha256Hex } from "../crypto";
import { db } from "../db";
import { tenantDb, type TenantDb } from "../tenant";

/**
 * Dashboard sessions: random 256-bit token in an httpOnly cookie; only its
 * SHA-256 is stored, so a database leak doesn't leak live sessions.
 */
export const SESSION_COOKIE = "conroy_session";
export const ADMIN_BUSINESS_COOKIE = "conroy_admin_business";
const SESSION_HOURS = 12;

export async function createSession(userId: string): Promise<void> {
  const token = randomToken(32);
  const h = await headers();
  await db.session.create({
    data: {
      tokenHash: sha256Hex(token),
      userId,
      expiresAt: new Date(Date.now() + SESSION_HOURS * 3600 * 1000),
      ip: (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || null,
      userAgent: h.get("user-agent")?.slice(0, 200) ?? null,
    },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_HOURS * 3600,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: sha256Hex(token) } });
  jar.delete(SESSION_COOKIE);
}

export async function currentUser(): Promise<User | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({ where: { tokenHash: sha256Hex(token) }, include: { user: true } });
  if (!session || session.expiresAt < new Date() || !session.user.active) return null;
  return session.user;
}

export interface TenantContext {
  user: User;
  business: Business;
  t: TenantDb;
}

/** Roles allowed to change settings vs. day-to-day work. */
export const SETTINGS_ROLES: UserRole[] = ["SUPER_ADMIN", "OWNER", "MANAGER"];
export const WORK_ROLES: UserRole[] = ["SUPER_ADMIN", "OWNER", "MANAGER", "STAFF"];

/**
 * Logged-in user + the business they are working on. Staff are pinned to
 * their own business; the super admin picks one (cookie). Redirects to
 * /login if not signed in, and to /dashboard?error=... if the role is not allowed.
 */
export async function requireTenant(roles: UserRole[] = WORK_ROLES): Promise<TenantContext> {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!roles.includes(user.role)) redirect("/dashboard?error=You%20don%27t%20have%20access%20to%20that%20page");

  const business = await businessForUser(user);
  if (!business) redirect("/login?error=No%20business%20is%20linked%20to%20this%20account");
  return { user, business, t: tenantDb(business.id) };
}

/** The business a user is working on: their own, or (super admin) the one chosen in the switcher cookie. */
export async function businessForUser(user: Pick<User, "role" | "businessId">): Promise<Business | null> {
  if (user.role === "SUPER_ADMIN") {
    const chosen = (await cookies()).get(ADMIN_BUSINESS_COOKIE)?.value;
    const picked = chosen ? await db.business.findUnique({ where: { id: chosen } }) : null;
    return picked ?? db.business.findFirst({ orderBy: { createdAt: "asc" } });
  }
  return user.businessId ? db.business.findUnique({ where: { id: user.businessId } }) : null;
}

export function canEditSettings(user: Pick<User, "role">): boolean {
  return SETTINGS_ROLES.includes(user.role);
}
