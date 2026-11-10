import type { Metadata } from "next";
import { signInWithLinkAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in" };

/**
 * The emailed link lands here. Signing in needs a button press (a POST):
 * email security scanners that open links automatically can't use it up.
 */
export default async function LinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <main className="login">
      <div className="card">
        <h1>Sign in to Conroy</h1>
        <p>Press the button to sign in. You&apos;ll then choose a new password.</p>
        <form action={signInWithLinkAction} className="stack">
          <input type="hidden" name="token" value={token} />
          <button type="submit">Continue</button>
        </form>
      </div>
    </main>
  );
}
