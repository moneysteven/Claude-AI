import type { Metadata } from "next";
import Link from "next/link";
import { logoutAction } from "@/app/login/actions";
import { requireSuperAdmin } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { default: "Super admin", template: "%s | Conroy admin" } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSuperAdmin();
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">Steven Scale Solutions</div>
        <small>Conroy super admin</small>
        <nav aria-label="Super admin">
          <Link href="/admin">Businesses</Link>
          <Link href="/admin/businesses/new">+ Onboard a business</Link>
          <Link href="/admin/usage">Usage & billing</Link>
          <Link href="/admin/plans">Plans</Link>
          <Link href="/admin/holidays">Public holidays</Link>
          <div className="section">Business view</div>
          <Link href="/dashboard">Open business dashboard</Link>
        </nav>
        <form action={logoutAction} style={{ marginTop: "1.5rem" }}>
          <small className="muted">{user.email}</small>
          <br />
          <button type="submit" className="secondary small">
            Sign out
          </button>
        </form>
      </aside>
      <main className="content" id="main">
        {children}
      </main>
    </div>
  );
}
