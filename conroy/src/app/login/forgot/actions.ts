"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requestLoginLink } from "@/lib/auth/login-links";
import { rateLimit } from "@/lib/ratelimit";

const schema = z.object({ email: z.string().trim().email().max(200) });

export async function requestLinkAction(formData: FormData) {
  const parsed = schema.safeParse({ email: formData.get("email") });
  if (!parsed.success) redirect("/login/forgot?error=Enter%20a%20valid%20email");
  const email = parsed.data.email.toLowerCase();
  const ip = ((await headers()).get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  const byIp = rateLimit(`link:ip:${ip}`, 5, 15 * 60 * 1000);
  const byEmail = rateLimit(`link:email:${email}`, 3, 60 * 60 * 1000);
  // Over the limit: answer exactly as if a link was sent (no enumeration, no flooding).
  if (byIp.allowed && byEmail.allowed) {
    const result = await requestLoginLink(email);
    if (result === "no_email_service") redirect("/login/forgot");
  }
  redirect("/login/forgot?sent=1");
}
