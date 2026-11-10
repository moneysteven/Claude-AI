import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { E2E_DATABASE_URL } from "../../playwright.config";
import { E2E, expectNoSeriousA11yIssues, login } from "./helpers";

test("super admin exports a leaving client's data, then deletes the business", async ({ page }) => {
  // A small business of its own, so the demo salon used by other tests is untouched.
  const db = new PrismaClient({ datasources: { db: { url: E2E_DATABASE_URL } } });
  let businessId = "";
  try {
    await db.business.deleteMany({ where: { slug: "leaving-barber" } });
    const b = await db.business.create({
      data: { slug: "leaving-barber", name: "Leaving Barber Shop", category: "BARBER", voiceNumber: "+18765550177", phoneMain: "+18765550170" },
    });
    businessId = b.id;
    await db.contact.create({ data: { businessId, phone: "+18765550188", name: "Marlon Client" } });
  } finally {
    await db.$disconnect();
  }

  await login(page, E2E.admin.email, E2E.admin.password, /\/admin/);
  await page.goto(`/admin/businesses/${businessId}`);
  const section = page.locator("section", { has: page.getByRole("heading", { name: /Client leaving/ }) });
  await expect(section.getByText("Not downloaded yet.")).toBeVisible();
  await expect(section.getByText(/first set its status to Disabled/)).toBeVisible();

  // Export downloads a JSON file with the customer in it.
  const download = page.waitForEvent("download");
  await section.getByRole("link", { name: "Download all data (JSON)" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^conroy-leaving-barber-full-export-\d{4}-\d{2}-\d{2}\.json$/);
  const exported = JSON.parse(await readFile(await file.path(), "utf8"));
  expect(exported.contacts[0].name).toBe("Marlon Client");

  // Disable, then delete with the typed confirmation.
  await page.getByLabel("Status").selectOption("DISABLED");
  await page.locator("form", { has: page.getByLabel("Status") }).getByRole("button", { name: "Save" }).click();
  await expect(page.locator("div.flash.ok")).toContainText("Business disabled");
  await expect(section.getByText(/Last downloaded/)).toBeVisible();
  await expectNoSeriousA11yIssues(page, "main");

  await section.getByLabel(/The client has their data export/).check();
  await section.getByLabel(/to confirm/).fill("wrong-name");
  await section.getByRole("button", { name: "Delete Leaving Barber Shop" }).click();
  await expect(page.locator("div.flash.error")).toContainText("type the business's short name exactly: leaving-barber");

  await section.getByLabel(/The client has their data export/).check();
  await section.getByLabel(/to confirm/).fill("leaving-barber");
  await section.getByRole("button", { name: "Delete Leaving Barber Shop" }).click();
  await expect(page).toHaveURL(/\/admin\?ok=/);
  await expect(page.locator("div.flash.ok")).toContainText("Leaving Barber Shop and all its data were deleted");
  const followUps = page.locator("section", { has: page.getByRole("heading", { name: /finish by hand/ }) });
  await expect(followUps.getByText(/\(876\) 555-0177/)).toBeVisible();
  await expect(followUps.getByText(/##002#/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Leaving Barber Shop" })).toHaveCount(0);
});
