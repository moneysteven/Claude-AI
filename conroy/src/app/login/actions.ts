"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/ratelimit";

const schema = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) });

// Same work whether or not the user exists (no account enumeration by timing).
const DUMMY_HASH = "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" + Buffer.alloc(64).toString("base64");

export async function loginAction(formData: FormData) {
  const parsed = schema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) redirect("/login?error=Enter%20your%20email%20and%20password");
  const email = parsed.data.email.toLowerCase().trim();
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();

  const limitIp = rateLimit(`login:ip:${ip}`, 20, 15 * 60 * 1000);
  const limitUser = rateLimit(`login:user:${email}`, 5, 15 * 60 * 1000);
  if (!limitIp.allowed || !limitUser.allowed) redirect("/login?error=Too%20many%20attempts.%20Try%20again%20in%2015%20minutes.");

  const user = await db.user.findUnique({ where: { email } });
  const ok = await verifyPassword(parsed.data.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok || !user.active) {
    await audit({ action: "auth.login_failed", details: { email }, ip });
    redirect("/login?error=Wrong%20email%20or%20password");
  }
  await createSession(user.id);
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit({ businessId: user.businessId, userId: user.id, action: "auth.login", ip });
  redirect("/dashboard");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login?ok=Signed%20out");
}
