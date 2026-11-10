import "../src/lib/env-bootstrap";

import { db } from "../src/lib/db";
import { createUser } from "../src/lib/users";

/**
 * Create the Steven Scale Solutions super-admin login on a fresh server,
 * without putting a password in .env or shell history. Prints a one-time
 * password; you choose your own at first sign-in.
 *
 *   docker compose run --rm app node_modules/.bin/tsx scripts/create-admin.ts --email you@example.com --name "Steven"
 *   npm run admin:create -- --email you@example.com --name "Steven"
 */
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = arg("email");
  const name = arg("name") ?? "Steven Scale Solutions";
  if (!email) throw new Error('Usage: create-admin.ts --email you@example.com [--name "Your Name"]');
  const { user, tempPassword } = await createUser({
    businessId: null,
    email,
    name,
    role: "SUPER_ADMIN",
    actor: { id: null, role: "SUPER_ADMIN" },
  });
  console.log(`Super admin created: ${user.email}`);
  console.log(`One-time password: ${tempPassword}`);
  console.log("Sign in at APP_URL/login; you'll be asked to choose your own password.");
}

main()
  .catch((err) => {
    console.error((err as Error).message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
