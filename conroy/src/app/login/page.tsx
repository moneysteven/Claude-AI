import type { Metadata } from "next";
import Link from "next/link";
import { loginAction } from "./actions";
import { Flash } from "@/components/Flash";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return (
    <main className="login">
      <div className="card">
        <h1>Conroy dashboard</h1>
        <p className="muted">Sign in to manage your AI receptionist.</p>
        <Flash searchParams={sp} />
        <form action={loginAction} className="stack">
          <label>
            Email
            <input name="email" type="email" autoComplete="username" required maxLength={200} />
          </label>
          <label>
            Password
            <input name="password" type="password" autoComplete="current-password" required minLength={10} maxLength={200} />
          </label>
          <button type="submit">Sign in</button>
        </form>
        <p style={{ marginBottom: 0 }}>
          <Link href="/login/forgot">Forgot your password?</Link>
        </p>
      </div>
      <p className="muted" style={{ textAlign: "center" }}>
        Steven Scale Solutions
      </p>
    </main>
  );
}
