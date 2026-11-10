import type { Metadata } from "next";
import { logoutAction } from "@/app/login/actions";
import { Icon } from "@/components/Icon";
import { MobileMenu } from "@/components/MobileMenu";
import { Motion } from "@/components/Motion";
import { NavLink } from "@/components/NavLink";
import { requireSuperAdmin } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { default: "Super admin", template: "%s | Conroy admin" } };

/** Matches the business list and any business's page, but not the onboarding form. */
const BUSINESSES = "^/admin(/businesses/(?!new)[^/]+.*)?$";

const TILE = {
  businesses: "linear-gradient(135deg,#4aa3ff,#007aff)",
  onboard: "linear-gradient(135deg,#4cd964,#2fb350)",
  usage: "linear-gradient(135deg,#ffb340,#ff9500)",
  plans: "linear-gradient(135deg,#c86dd7,#af52de)",
  holidays: "linear-gradient(135deg,#ff6961,#ff3b30)",
  dashboard: "linear-gradient(135deg,#7d7aff,#5856d6)",
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSuperAdmin();
  const menu = (
    <>
      <nav aria-label="Super admin">
        <NavLink href="/admin" match={BUSINESSES}>
          <Icon name="building" tile={TILE.businesses} /> Businesses
        </NavLink>
        <NavLink href="/admin/businesses/new">
          <Icon name="plus" tile={TILE.onboard} /> Onboard a business
        </NavLink>
        <NavLink href="/admin/usage">
          <Icon name="chart" tile={TILE.usage} /> Usage & billing
        </NavLink>
        <NavLink href="/admin/plans">
          <Icon name="list" tile={TILE.plans} /> Plans
        </NavLink>
        <NavLink href="/admin/holidays">
          <Icon name="flag" tile={TILE.holidays} /> Public holidays
        </NavLink>
        <div className="section">Business view</div>
        <NavLink href="/dashboard">
          <Icon name="arrow" tile={TILE.dashboard} /> Open business dashboard
        </NavLink>
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
      <Motion />
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
          <Icon name="building" /> Businesses
        </NavLink>
        <NavLink href="/admin/businesses/new">
          <Icon name="plus" /> Onboard
        </NavLink>
        <NavLink href="/admin/usage">
          <Icon name="chart" /> Usage
        </NavLink>
        <NavLink href="/admin/plans">
          <Icon name="list" /> Plans
        </NavLink>
      </nav>
    </div>
  );
}
