import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { logoutAction } from "@/app/login/actions";
import { Flash } from "@/components/Flash";
import { currentUser } from "@/lib/auth/session";
import { changePasswordAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My account" };

/**
 * Standalone (outside the dashboard layout) so people with a temporary
 * password can reach it before they can use the rest of the dashboard.
 */
export default async function AccountPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await currentUser();
  if (!user) redirect("/login");
  const first = user.mustChangePassword || sp.first === "1";
  const home = user.role === "SUPER_ADMIN" ? "/admin" : "/dashboard";

  return (
    <main className="login">
      <div className="card">
        <h1>{first ? "Choose your own password" : "My account"}</h1>
        <p className="muted">
          Signed in as {user.name} ({user.email})
        </p>
        {first ? (
          <p>
            You signed in with a temporary password. Choose a password only you know (at least 10 characters) to continue. Your other
            sessions will be signed out.
          </p>
        ) : null}
        <Flash searchParams={sp} />
        <form action={changePasswordAction} className="stack">
          <label>
            {first ? "Temporary password" : "Current password"}
            <input name="current" type="password" autoComplete="current-password" required maxLength={200} />
          </label>
          <label>
            New password
            <input name="next" type="password" autoComplete="new-password" required minLength={10} maxLength={200} />
          </label>
          <label>
            Type the new password again
            <input name="confirm" type="password" autoComplete="new-password" required minLength={10} maxLength={200} />
          </label>
          <button type="submit">Save password</button>
        </form>
      </div>
      <div className="row spread">
        {!user.mustChangePassword ? <Link href={home}>&larr; Back</Link> : <span />}
        <form action={logoutAction}>
          <button type="submit" className="secondary small">
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
