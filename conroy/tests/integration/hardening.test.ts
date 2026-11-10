import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET as healthGET } from "@/app/api/health/route";
import { consumeLoginLink, requestLoginLink } from "@/lib/auth/login-links";
import { canResetWithoutCurrentPassword } from "@/lib/auth/session";
import { randomToken, sha256Hex } from "@/lib/crypto";
import { db } from "@/lib/db";
import { beat, workerStatus, WORKER_STALE_AFTER_MS } from "@/lib/heartbeat";
import { changeOwnPassword } from "@/lib/users";
import { verifyPassword } from "@/lib/auth/password";
import { ensureTestDb, resetDb } from "./helpers";

async function makeUser(active = true) {
  return db.user.create({ data: { email: `u${Date.now()}@x.example`, name: "Pat Doe", role: "SUPER_ADMIN", passwordHash: "scrypt$1$1$1$AA==$AA==", active } });
}

async function makeLink(userId: string, minutesFromNow = 20) {
  const token = randomToken(32);
  await db.loginToken.create({ data: { userId, tokenHash: sha256Hex(token), expiresAt: new Date(Date.now() + minutesFromNow * 60_000) } });
  return token;
}

describe("emailed sign-in links", () => {
  beforeAll(ensureTestDb);
  beforeEach(resetDb);

  it("says so when the server can't send email (no SMTP configured)", async () => {
    expect(await requestLoginLink("anyone@x.example")).toBe("no_email_service");
  });

  it("works exactly once, then forces a new password", async () => {
    const user = await makeUser();
    const token = await makeLink(user.id);
    const signedIn = await consumeLoginLink(token);
    expect(signedIn?.id).toBe(user.id);
    expect(signedIn?.mustChangePassword).toBe(true);
    expect(await consumeLoginLink(token)).toBeNull(); // second use
    // Only the hash is stored.
    expect(await db.loginToken.count({ where: { tokenHash: token } })).toBe(0);
  });

  it("refuses expired links, deactivated users and malformed tokens", async () => {
    const user = await makeUser();
    expect(await consumeLoginLink(await makeLink(user.id, -1))).toBeNull();
    const inactive = await makeUser(false);
    expect(await consumeLoginLink(await makeLink(inactive.id))).toBeNull();
    expect(await consumeLoginLink("../../etc/passwd")).toBeNull();
  });

  it("a fresh link session may set a password without the old one; only briefly", async () => {
    const user = await makeUser();
    const fresh = { viaLink: true, createdAt: new Date(), user: { mustChangePassword: true } };
    expect(canResetWithoutCurrentPassword(fresh)).toBe(true);
    expect(canResetWithoutCurrentPassword({ ...fresh, createdAt: new Date(Date.now() - 31 * 60_000) })).toBe(false);
    expect(canResetWithoutCurrentPassword({ ...fresh, viaLink: false })).toBe(false);
    await changeOwnPassword(user.id, "", "a-brand-new-password", undefined, { skipCurrentCheck: true });
    expect(await verifyPassword("a-brand-new-password", (await db.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash)).toBe(true);
  });
});

describe("health and worker heartbeat", () => {
  beforeEach(resetDb);

  it("reports app-only health for Docker and full health (incl. worker) for uptime monitors", async () => {
    const full = () => healthGET(new Request("http://localhost/api/health"));
    const app = () => healthGET(new Request("http://localhost/api/health?scope=app"));
    // Tests run with JOBS_ENABLED=false: the worker is reported as disabled, not failing.
    expect((await full()).status).toBe(200);
    expect((await (await full()).json()).worker).toBe("disabled");
    expect((await app()).status).toBe(200);
    expect((await (await app()).json()).worker).toBe("skipped");
  });

  it("marks the worker stale when its heartbeat stops", async () => {
    expect((await workerStatus()).status).toBe("never");
    await beat("worker", { pid: 1 });
    expect((await workerStatus()).status).toBe("ok");
    expect((await workerStatus(new Date(Date.now() + WORKER_STALE_AFTER_MS + 1000))).status).toBe("stale");
  });
});
