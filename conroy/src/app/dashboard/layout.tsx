import { switchBusinessAction } from "@/app/admin/actions";
import { logoutAction } from "@/app/login/actions";
import { MobileMenu } from "@/components/MobileMenu";
import { NavLink } from "@/components/NavLink";
import { canEditSettings, requireTenant } from "@/lib/auth/session";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Business dashboard frame. Computers: a sidebar menu with the current page
 * highlighted. Phones: a slim top bar with a Menu button, plus a tab bar at
 * the bottom for the pages used every day.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, business, t } = await requireTenant();
  const isSuperAdmin = user.role === "SUPER_ADMIN";
  const [waiting, allBusinesses] = await Promise.all([
    t.conversation.count({ where: { status: "HUMAN" } }),
    isSuperAdmin ? db.business.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, status: true } }) : Promise.resolve([]),
  ]);
  const settings = canEditSettings(user);
  const subtitle = `${business.assistantName} AI receptionist${business.status !== "ACTIVE" ? ` (${business.status.toLowerCase()})` : ""}`;
  const waitingBadge = waiting > 0 ? <span className="badge warn" aria-label={`${waiting} waiting for a person`}>{waiting}</span> : null;

  const switcher = isSuperAdmin ? (
    <div className="card switcher">
      <NavLink href="/admin">&larr; Super admin</NavLink>
      <form action={switchBusinessAction} className="stack">
        <label>
          Business
          <select name="businessId" defaultValue={business.id}>
            {allBusinesses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
                {b.status !== "ACTIVE" ? ` (${b.status.toLowerCase()})` : ""}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="small secondary">
          Switch
        </button>
      </form>
    </div>
  ) : null;

  const menu = (
    <>
      <nav aria-label="Dashboard">
        <NavLink href="/dashboard" match="^/dashboard$">
          Overview
        </NavLink>
        <NavLink href="/dashboard/bookings">Bookings</NavLink>
        <NavLink href="/dashboard/inbox">Inbox {waitingBadge}</NavLink>
        <NavLink href="/dashboard/calls">Calls</NavLink>
        <NavLink href="/dashboard/leads">Leads</NavLink>
        <NavLink href="/dashboard/payments">Payments</NavLink>
        <NavLink href="/dashboard/report">Monthly report</NavLink>
        <div className="section">See it live</div>
        {/* A full page load (plain link), so the website's chat script runs as it would on a real site. */}
        <a href={`/demo/${business.slug}`}>Try your website chat</a>
        {settings ? (
          <>
            <div className="section">Settings</div>
            <NavLink href="/dashboard/settings" match="^/dashboard/settings$">
              Business & assistant
            </NavLink>
            <NavLink href="/dashboard/settings/hours">Hours & holidays</NavLink>
            <NavLink href="/dashboard/settings/services">Services & prices</NavLink>
            <NavLink href="/dashboard/settings/staff">Staff</NavLink>
            <NavLink href="/dashboard/settings/faqs">FAQs & policies</NavLink>
            <NavLink href="/dashboard/settings/payments">Payment links</NavLink>
            <NavLink href="/dashboard/settings/widget">Widget & phone setup</NavLink>
            <NavLink href="/dashboard/settings/team">Team</NavLink>
            <NavLink href="/dashboard/privacy">Privacy requests</NavLink>
          </>
        ) : null}
        <div className="section">You</div>
        <NavLink href="/account">My account</NavLink>
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
      <MobileMenu title={business.name} subtitle={subtitle}>
        {switcher}
        {menu}
      </MobileMenu>
      <aside className="sidebar">
        {switcher}
        <div className="brand">{business.name}</div>
        <small>{subtitle}</small>
        {menu}
      </aside>
      <main className="content" id="main">
        {children}
      </main>
      <nav className="tabbar" aria-label="Main pages">
        <NavLink href="/dashboard" match="^/dashboard$">
          Home
        </NavLink>
        <NavLink href="/dashboard/bookings">Bookings</NavLink>
        <NavLink href="/dashboard/inbox">Inbox {waitingBadge}</NavLink>
        <NavLink href="/dashboard/calls">Calls</NavLink>
        <NavLink href="/dashboard/leads">Leads</NavLink>
      </nav>
    </div>
  );
}
