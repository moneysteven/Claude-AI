import type { User } from "@prisma/client";
import { audit } from "../audit";
import { randomToken, sha256Hex } from "../crypto";
import { db } from "../db";
import { env } from "../env";
import { emailConfigured, sendEmail } from "../notify/email";

/**
 * "Forgot your password?" sign-in links: one-time, 20 minutes, only the
 * token's hash stored. Opening the link signs the person in and makes them
 * choose a new password. Responses never reveal whether an email has an
 * account.
 */
export const LINK_MINUTES = 20;

export type LinkRequestResult = "sent" | "no_email_service";

export async function requestLoginLink(emailInput: string): Promise<LinkRequestResult> {
  if (!emailConfigured()) return "no_email_service";
  const email = emailInput.trim().toLowerCase();
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !user.active) return "sent"; // same answer either way
  if (user.businessId) {
    const business = await db.business.findUnique({ where: { id: user.businessId }, select: { status: true } });
    if (business?.status === "DISABLED") return "sent";
  }
  const token = randomToken(32);
  await db.$transaction([
    db.loginToken.deleteMany({ where: { userId: user.id, usedAt: null } }), // only the newest link works
    db.loginToken.create({ data: { userId: user.id, tokenHash: sha256Hex(token), expiresAt: new Date(Date.now() + LINK_MINUTES * 60_000) } }),
  ]);
  const link = `${env.APP_URL}/login/link/${token}`;
  await sendEmail(
    user.email,
    "Your Conroy sign-in link",
    [
      `Hi ${user.name.split(" ")[0]},`,
      "",
      `Use this link to sign in to Conroy and choose a new password. It works once and expires in ${LINK_MINUTES} minutes:`,
      link,
      "",
      "If you didn't ask for this, you can ignore this email; your password hasn't changed.",
    ].join("\n"),
  );
  await audit({ businessId: user.businessId, userId: user.id, action: "auth.link_requested", entityType: "User", entityId: user.id });
  return "sent";
}

/** Use a link once. Returns the user to sign in, or null if invalid / expired / used. */
export async function consumeLoginLink(token: string): Promise<User | null> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const row = await db.loginToken.findUnique({ where: { tokenHash: sha256Hex(token) }, include: { user: true } });
  if (!row || row.usedAt || row.expiresAt < new Date() || !row.user.active) return null;
  // Mark used atomically so two clicks can't both sign in.
  const claimed = await db.loginToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
  if (claimed.count !== 1) return null;
  const user = await db.user.update({ where: { id: row.userId }, data: { mustChangePassword: true } });
  await audit({ businessId: user.businessId, userId: user.id, action: "auth.link_used", entityType: "User", entityId: user.id });
  return user;
}
