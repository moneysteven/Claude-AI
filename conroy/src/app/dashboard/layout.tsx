import { switchBusinessAction } from "@/app/admin/actions";
import { logoutAction } from "@/app/login/actions";
import { Icon } from "@/components/Icon";
import { MobileMenu } from "@/components/MobileMenu";
import { Motion } from "@/components/Motion";
import { NavLink } from "@/components/NavLink";
import { canEditSettings, requireTenant } from "@/lib/auth/session";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** iOS Settings-style tile colours for each menu item. */
const TILE = {
  overview: "linear-gradient(135deg,#7d7aff,#5856d6)",
  bookings: "linear-gradient(135deg,#ff6961,#ff3b30)",
  inbox: "linear-gradient(135deg,#4cd964,#28a745)",
  calls: "linear-gradient(135deg,#5ac8fa,#1e9bd7)",
  leads: "linear-gradient(135deg,#ffb340,#ff9500)",
  payments: "linear-gradient(135deg,#c86dd7,#af52de)",
  report: "linear-gradient(135deg,#ff5e7e,#ff2d55)",
  live: "linear-gradient(135deg,#9b4fd6,#6a1b9a)",
  business: "linear-gradient(135deg,#a1a1a6,#7c7c80)",
  hours: "linear-gradient(135deg,#ffc04d,#ff9f0a)",
  services: "linear-gradient(135deg,#ff6b8b,#e8335c)",
  staff: "linear-gradient(135deg,#70d7ff,#34aadc)",
  faqs: "linear-gradient(135deg,#4aa3ff,#007aff)",
  paylinks: "linear-gradient(135deg,#4cd964,#2fb350)",
  widget: "linear-gradient(135deg,#7d7aff,#5856d6)",
  team: "linear-gradient(135deg,#64d2ff,#30a2d6)",
  privacy: "linear-gradient(135deg,#8e8e93,#636366)",
  account: "linear-gradient(135deg,#a1a1a6,#7c7c80)",
};

/**
 * Business dashboard frame. Computers: a frosted sidebar with iOS-style icon
 * tiles and the current page highlighted. Phones: a slim frosted top bar with
 * a Menu button, plus an icon tab bar at the bottom for the daily pages.
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
  const waitingBadge =
    waiting > 0 ? (
      <span className="badge warn nav-badge" aria-label={`${waiting} waiting for a person`}>
        {waiting}
      </span>
    ) : null;

  const switcher = isSuperAdmin ? (
    <div className="card switcher">
      <NavLink href="/admin">
        <Icon name="back" size={16} /> Super admin
      </NavLink>
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
          <Icon name="home" tile={TILE.overview} /> Overview
        </NavLink>
        <NavLink href="/dashboard/bookings">
          <Icon name="calendar" tile={TILE.bookings} /> Bookings
        </NavLink>
        <NavLink href="/dashboard/inbox">
          <Icon name="chat" tile={TILE.inbox} /> Inbox {waitingBadge}
        </NavLink>
        <NavLink href="/dashboard/calls">
          <Icon name="phone" tile={TILE.calls} /> Calls
        </NavLink>
        <NavLink href="/dashboard/leads">
          <Icon name="star" tile={TILE.leads} /> Leads
        </NavLink>
        <NavLink href="/dashboard/payments">
          <Icon name="card" tile={TILE.payments} /> Payments
        </NavLink>
        <NavLink href="/dashboard/report">
          <Icon name="chart" tile={TILE.report} /> Monthly report
        </NavLink>
        <div className="section">See it live</div>
        {/* A full page load (plain link), so the website's chat script runs as it would on a real site. */}
        <a href={`/demo/${business.slug}`}>
          <Icon name="sparkles" tile={TILE.live} /> Try your website chat
        </a>
        {settings ? (
          <>
            <div className="section">Settings</div>
            <NavLink href="/dashboard/settings" match="^/dashboard/settings$">
              <Icon name="sliders" tile={TILE.business} /> Business & assistant
            </NavLink>
            <NavLink href="/dashboard/settings/hours">
              <Icon name="clock" tile={TILE.hours} /> Hours & holidays
            </NavLink>
            <NavLink href="/dashboard/settings/services">
              <Icon name="tag" tile={TILE.services} /> Services & prices
            </NavLink>
            <NavLink href="/dashboard/settings/staff">
              <Icon name="people" tile={TILE.staff} /> Staff
            </NavLink>
            <NavLink href="/dashboard/settings/faqs">
              <Icon name="question" tile={TILE.faqs} /> FAQs & policies
            </NavLink>
            <NavLink href="/dashboard/settings/payments">
              <Icon name="link" tile={TILE.paylinks} /> Payment links
            </NavLink>
            <NavLink href="/dashboard/settings/widget">
              <Icon name="globe" tile={TILE.widget} /> Widget & phone setup
            </NavLink>
            <NavLink href="/dashboard/settings/team">
              <Icon name="key" tile={TILE.team} /> Team
            </NavLink>
            <NavLink href="/dashboard/privacy">
              <Icon name="shield" tile={TILE.privacy} /> Privacy requests
            </NavLink>
          </>
        ) : null}
        <div className="section">You</div>
        <NavLink href="/account">
          <Icon name="user" tile={TILE.account} /> My account
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
          <Icon name="home" /> Home
        </NavLink>
        <NavLink href="/dashboard/bookings">
          <Icon name="calendar" /> Bookings
        </NavLink>
        <NavLink href="/dashboard/inbox">
          <Icon name="chat" /> Inbox {waitingBadge}
        </NavLink>
        <NavLink href="/dashboard/calls">
          <Icon name="phone" /> Calls
        </NavLink>
        <NavLink href="/dashboard/leads">
          <Icon name="star" /> Leads
        </NavLink>
      </nav>
    </div>
  );
}
