import Link from "next/link";
import { switchBusinessAction } from "@/app/admin/actions";
import { logoutAction } from "@/app/login/actions";
import { canEditSettings, requireTenant } from "@/lib/auth/session";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, business, t } = await requireTenant();
  const isSuperAdmin = user.role === "SUPER_ADMIN";
  const [waiting, allBusinesses] = await Promise.all([
    t.conversation.count({ where: { status: "HUMAN" } }),
    isSuperAdmin ? db.business.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, status: true } }) : Promise.resolve([]),
  ]);
  const settings = canEditSettings(user);
  return (
    <div className="shell">
      <aside className="sidebar">
        {isSuperAdmin ? (
          <div className="card" style={{ padding: "0.6rem", marginBottom: "0.75rem" }}>
            <Link href="/admin">&larr; Super admin</Link>
            <form action={switchBusinessAction} className="stack" style={{ marginTop: "0.5rem", gap: "0.4rem" }}>
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
        ) : null}
        <div className="brand">{business.name}</div>
        <small>
          {business.assistantName} AI receptionist
          {business.status !== "ACTIVE" ? ` (${business.status.toLowerCase()})` : ""}
        </small>
        <nav aria-label="Dashboard">
          <Link href="/dashboard">Overview</Link>
          <Link href="/dashboard/bookings">Bookings</Link>
          <Link href="/dashboard/inbox">
            Inbox{waiting > 0 ? <span className="badge warn" style={{ marginLeft: 6 }}>{waiting}</span> : null}
          </Link>
          <Link href="/dashboard/calls">Calls</Link>
          <Link href="/dashboard/leads">Leads</Link>
          <Link href="/dashboard/payments">Payments</Link>
          <Link href="/dashboard/report">Monthly report</Link>
          {settings ? (
            <>
              <div className="section">Settings</div>
              <Link href="/dashboard/settings">Business & assistant</Link>
              <Link href="/dashboard/settings/hours">Hours & holidays</Link>
              <Link href="/dashboard/settings/services">Services</Link>
              <Link href="/dashboard/settings/staff">Staff</Link>
              <Link href="/dashboard/settings/faqs">FAQs & policies</Link>
              <Link href="/dashboard/settings/payments">Payment links</Link>
              <Link href="/dashboard/settings/widget">Widget & phone setup</Link>
              <Link href="/dashboard/settings/team">Team</Link>
              <Link href="/dashboard/privacy">Privacy requests</Link>
            </>
          ) : null}
          <div className="section">You</div>
          <Link href="/account">My account</Link>
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
