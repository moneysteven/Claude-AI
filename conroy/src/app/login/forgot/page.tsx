import type { Metadata } from "next";
import Link from "next/link";
import { Flash } from "@/components/Flash";
import { LINK_MINUTES } from "@/lib/auth/login-links";
import { emailConfigured } from "@/lib/notify/email";
import { requestLinkAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Forgot password" };

export default async function ForgotPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const canEmail = emailConfigured();
  return (
    <main className="login">
      <div className="card">
        <h1>Forgot your password?</h1>
        {sp.sent ? (
          <p role="status" className="flash ok">
            If that email has an account, a sign-in link is on its way. It works once and expires in {LINK_MINUTES} minutes. Check your spam
            folder too.
          </p>
        ) : null}
        <Flash searchParams={sp} />
        {canEmail ? (
          <form action={requestLinkAction} className="stack">
            <p className="muted">Enter your email and we&apos;ll send you a one-time link to sign in and choose a new password.</p>
            <label>
              Email
              <input name="email" type="email" autoComplete="username" required maxLength={200} />
            </label>
            <button type="submit">Email me a sign-in link</button>
          </form>
        ) : (
          <p>
            Email isn&apos;t set up on this server, so we can&apos;t send a link. Ask your business owner (Team page) or Steven Scale Solutions
            to reset your password.
          </p>
        )}
      </div>
      <p style={{ textAlign: "center" }}>
        <Link href="/login">&larr; Back to sign in</Link>
      </p>
    </main>
  );
}
