import type { UserRole } from "@prisma/client";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Flash } from "@/components/Flash";
import { requireTenant, SETTINGS_ROLES } from "@/lib/auth/session";
import { decryptJson } from "@/lib/crypto";
import { db } from "@/lib/db";
import { formatDateTimeShort } from "@/lib/time";
import { canManageRole } from "@/lib/users";
import { addUserAction, changeRoleAction, resetPasswordAction, setActiveAction } from "./actions";
import { ClearTempPassword } from "./ClearTempPassword";

export const metadata: Metadata = { title: "Team" };

const ROLES: { value: Exclude<UserRole, "SUPER_ADMIN">; label: string; help: string }[] = [
  { value: "OWNER", label: "Owner", help: "everything, including settings and team" },
  { value: "MANAGER", label: "Manager", help: "everything except managing owners and managers" },
  { value: "STAFF", label: "Staff", help: "bookings, inbox, calls, leads and payments; no settings" },
];

export default async function TeamPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { user: actor, business } = await requireTenant(SETTINGS_ROLES);
  const users = await db.user.findMany({
    where: { businessId: business.id },
    orderBy: [{ active: "desc" }, { role: "asc" }, { name: "asc" }],
  });
  const raw = (await cookies()).get("conroy_flash_secret")?.value;
  const secret = raw ? decryptJson<{ email: string; password: string }>(raw) : null;
  const assignable = ROLES.filter((r) => canManageRole(actor.role, r.value));

  return (
    <>
      <h1>Team</h1>
      <Flash searchParams={sp} />
      {secret ? (
        <div className="card" style={{ borderColor: "var(--brand)", borderWidth: 2 }} role="status">
          <h2 style={{ marginTop: 0 }}>Temporary password for {secret.email}</h2>
          <pre className="code" style={{ fontSize: "1.2rem" }}>
            {secret.password}
          </pre>
          <p>
            Share this with them by WhatsApp; it works once and they must change it when they sign in at the dashboard. It won&apos;t be shown
            again: if it gets lost, reset the password.
          </p>
          <ClearTempPassword />
        </div>
      ) : null}
      <p className="muted">
        Everyone who can sign in to {business.name}&apos;s dashboard. New accounts get a temporary password and must choose their own at first
        sign-in.
      </p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Person</th>
              <th>Role</th>
              <th>Status</th>
              <th>Last sign-in</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const manageable = u.id !== actor.id && canManageRole(actor.role, u.role);
              return (
                <tr key={u.id}>
                  <td>
                    {u.name}
                    {u.id === actor.id ? <span className="badge" style={{ marginLeft: 6 }}>you</span> : null}
                    <br />
                    <small>{u.email}</small>
                  </td>
                  <td>
                    {manageable ? (
                      <form action={changeRoleAction} className="inline">
                        <input type="hidden" name="userId" value={u.id} />
                        <select name="role" defaultValue={u.role} aria-label={`Role for ${u.name}`}>
                          {assignable.map((r) => (
                            <option key={r.value} value={r.value}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                        <button className="small secondary">Change</button>
                      </form>
                    ) : (
                      u.role.toLowerCase()
                    )}
                  </td>
                  <td>
                    <span className={`badge ${u.active ? "ok" : "danger"}`}>{u.active ? "active" : "deactivated"}</span>
                    {u.mustChangePassword ? (
                      <>
                        <br />
                        <span className="badge warn">temporary password</span>
                      </>
                    ) : null}
                  </td>
                  <td>{u.lastLoginAt ? formatDateTimeShort(u.lastLoginAt, business.timezone) : "never"}</td>
                  <td>
                    {manageable ? (
                      <div className="row">
                        <form action={resetPasswordAction} className="inline">
                          <input type="hidden" name="userId" value={u.id} />
                          <button className="small secondary">Reset password</button>
                        </form>
                        <form action={setActiveAction} className="inline">
                          <input type="hidden" name="userId" value={u.id} />
                          <input type="hidden" name="active" value={u.active ? "false" : "true"} />
                          <button className={`small ${u.active ? "danger" : ""}`}>{u.active ? "Deactivate" : "Re-activate"}</button>
                        </form>
                      </div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {assignable.length > 0 ? (
        <form action={addUserAction} className="stack card">
          <h2 style={{ marginTop: 0 }}>Add someone</h2>
          <div className="row">
            <label>
              Name
              <input name="name" required maxLength={120} />
            </label>
            <label>
              Email (used to sign in)
              <input name="email" type="email" required maxLength={200} />
            </label>
          </div>
          <label>
            Role
            <select name="role" defaultValue="STAFF">
              {assignable.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}: {r.help}
                </option>
              ))}
            </select>
          </label>
          <button type="submit">Create account</button>
        </form>
      ) : null}
    </>
  );
}
