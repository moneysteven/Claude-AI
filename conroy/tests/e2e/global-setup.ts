import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { E2E_DATABASE_URL } from "../../playwright.config";

export const E2E = {
  owner: { email: "tasha@example.com", password: "E2E-Owner-Pass-2026" },
  admin: { email: "admin@e2e.example", password: "E2E-Admin-Pass-2026" },
} as const;

/**
 * Fresh data for every run: apply migrations, empty every table, seed the
 * demo salon. Refuses any database whose name doesn't contain "e2e".
 */
export default async function globalSetup() {
  const dbName = new URL(E2E_DATABASE_URL).pathname.slice(1);
  if (!dbName.includes("e2e")) throw new Error("DATABASE_URL_E2E must point at a throwaway database whose name contains 'e2e'");
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: E2E_DATABASE_URL,
    NODE_ENV: "test",
    SESSION_SECRET: "e2e-session-secret-at-least-32-characters!!",
    DATA_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64"),
    SEED_OWNER_EMAIL: E2E.owner.email,
    SEED_OWNER_PASSWORD: E2E.owner.password,
    SEED_SUPERADMIN_EMAIL: E2E.admin.email,
    SEED_SUPERADMIN_PASSWORD: E2E.admin.password,
  };
  execSync("node_modules/.bin/prisma migrate deploy", { env, stdio: "ignore" });

  const db = new PrismaClient({ datasources: { db: { url: E2E_DATABASE_URL } } });
  try {
    const tables = await db.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
    if (tables.length) {
      await db.$executeRawUnsafe(`TRUNCATE TABLE ${tables.map((t) => `"public"."${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
    }
  } finally {
    await db.$disconnect();
  }
  execSync("node_modules/.bin/tsx prisma/seed.ts", { env, stdio: "ignore" });
}
