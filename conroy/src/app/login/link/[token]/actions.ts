"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { consumeLoginLink } from "@/lib/auth/login-links";
import { createSession } from "@/lib/auth/session";
import { rateLimit } from "@/lib/ratelimit";

export async function signInWithLinkAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const ip = ((await headers()).get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  if (!rateLimit(`link-use:ip:${ip}`, 10, 15 * 60 * 1000).allowed) {
    redirect("/login?error=Too%20many%20attempts.%20Try%20again%20later.");
  }
  const user = await consumeLoginLink(token);
  if (!user) redirect("/login?error=That%20sign-in%20link%20has%20expired%20or%20was%20already%20used.%20Ask%20for%20a%20new%20one.");
  await createSession(user.id, { viaLink: true });
  redirect("/account?first=1");
}
