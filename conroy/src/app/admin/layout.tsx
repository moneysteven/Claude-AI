import type { Metadata } from "next";
import { logoutAction } from "@/app/login/actions";
import { MobileMenu } from "@/components/MobileMenu";
import { NavLink } from "@/components/NavLink";
import { requireSuperAdmin } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { default: "Super admin", template: "%s | Conroy admin" } };

/** Matches the business list and any business's page, but not the onboarding form. */
const BUSINESSES = "^/admin(/businesses/(?!new)[^/]+.*)?$";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSuperAdmin();
  const menu = (
    <>
      <nav aria-label="Super admin">
        <NavLink href="/admin" match={BUSINESSES}>
          Businesses
        </NavLink>
        <NavLink href="/admin/businesses/new">+ Onboard a business</NavLink>
        <NavLink href="/admin/usage">Usage & billing</NavLink>
        <NavLink href="/admin/plans">Plans</NavLink>
        <NavLink href="/admin/holidays">Public holidays</NavLink>
        <div className="section">Business view</div>
        <NavLink href="/dashboard">Open business dashboard</NavLink>
      </nav>
      <form action={logoutAction} className="signout">
        <small className="muted">{user.email}</small>
        <button type="submit" className="secondary small">
          Sign out
        </button>
      </form>
    </>
  );
  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <MobileMenu title="Steven Scale Solutions" subtitle="Conroy super admin">
        {menu}
      </MobileMenu>
      <aside className="sidebar">
        <div className="brand">Steven Scale Solutions</div>
        <small>Conroy super admin</small>
        {menu}
      </aside>
      <main className="content" id="main">
        {children}
      </main>
      <nav className="tabbar" aria-label="Main pages">
        <NavLink href="/admin" match={BUSINESSES}>
          Businesses
        </NavLink>
        <NavLink href="/admin/businesses/new">Onboard</NavLink>
        <NavLink href="/admin/usage">Usage</NavLink>
        <NavLink href="/admin/plans">Plans</NavLink>
      </nav>
    </div>
  );
}
