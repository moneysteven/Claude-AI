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
// In production the "__Host-" prefix makes browsers refuse the cookie unless it
// is Secure, host-only and path=/ (no subdomain can set or overwrite it).
const PREFIX = process.env.NODE_ENV === "production" ? "__Host-" : "";
export const SESSION_COOKIE = `${PREFIX}conroy_session`;
export const ADMIN_BUSINESS_COOKIE = `${PREFIX}conroy_admin_business`;
const SESSION_HOURS = 12;

export async function createSession(userId: string, opts: { viaLink?: boolean } = {}): Promise<void> {
  const token = randomToken(32);
  const h = await headers();
  await db.session.create({
    data: {
      tokenHash: sha256Hex(token),
      userId,
      viaLink: Boolean(opts.viaLink),
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

export async function currentSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({ where: { tokenHash: sha256Hex(token) }, include: { user: true } });
  if (!session || session.expiresAt < new Date() || !session.user.active) return null;
  return session;
}

export async function currentUser(): Promise<User | null> {
  return (await currentSession())?.user ?? null;
}

/** A session opened from an emailed sign-in link in the last 30 minutes may set a password without the old one. */
export function canResetWithoutCurrentPassword(session: { viaLink: boolean; createdAt: Date; user: Pick<User, "mustChangePassword"> }): boolean {
  return session.viaLink && session.user.mustChangePassword && Date.now() - session.createdAt.getTime() < 30 * 60 * 1000;
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

  if (user.mustChangePassword) redirect("/account?first=1");

  const business = await businessForUser(user);
  if (!business) {
    if (user.role === "SUPER_ADMIN") redirect("/admin");
    redirect("/login?error=No%20business%20is%20linked%20to%20this%20account");
  }
  if (business.status === "DISABLED" && user.role !== "SUPER_ADMIN") {
    redirect("/login?error=This%20account%20is%20paused.%20Please%20contact%20Steven%20Scale%20Solutions.");
  }
  return { user, business, t: tenantDb(business.id) };
}

/** Super-admin pages (/admin). */
export async function requireSuperAdmin(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/account?first=1");
  if (user.role !== "SUPER_ADMIN") redirect("/dashboard?error=Only%20Steven%20Scale%20Solutions%20can%20open%20that%20page");
  return user;
}

/** The raw session token from the cookie (to keep this browser signed in after a password change). */
export async function currentSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

/** Super admin: choose which business the dashboard shows. */
export async function setAdminBusiness(businessId: string): Promise<void> {
  (await cookies()).set(ADMIN_BUSINESS_COOKIE, businessId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 3600,
  });
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
