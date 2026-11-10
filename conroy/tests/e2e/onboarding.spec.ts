import { expect, test } from "@playwright/test";
import { E2E, login } from "./helpers";

test("super admin onboards a business; the new owner must choose a password", async ({ page, browser }) => {
  await login(page, E2E.admin.email, E2E.admin.password, /\/admin/);
  await page.goto("/admin/businesses/new");

  await page.getByLabel("Business name").fill("Blue Mountain Auto Care");
  await page.getByLabel("Type of business").selectOption("AUTO_SHOP");
  await page.getByRole("button", { name: /Use typical hours/ }).click();
  await page.getByLabel("Area / town").fill("Mandeville");
  await page.getByLabel("Parish").selectOption("Manchester");
  await page.getByRole("button", { name: "Next →" }).click();

  await page.getByLabel("Owner's name").fill("Devon Reid");
  await page.getByLabel(/Owner's email/).fill("devon@bluemountain.example");
  await page.getByLabel("Owner's WhatsApp").fill("876-555-0420");

  // Jump straight to review: the server validates everything.
  await page.getByRole("button", { name: /^10\. Review & create/ }).click();
  await page.getByRole("button", { name: "Create business" }).click();
  await expect(page.getByText("Owner login (shown once)")).toBeVisible({ timeout: 20_000 });
  const temp = (await page.locator("code").filter({ hasText: /^Conroy-/ }).first().innerText()).trim();
  expect(temp).toMatch(/^Conroy-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  await expect(page.getByText('data-business="blue-mountain-auto-care"')).toBeVisible();
  await expect(page.getByText("**61*1876XXXXXXX#")).toBeVisible();

  // The new owner signs in with the one-time password and must replace it.
  const owner = await (await browser.newContext()).newPage();
  await login(owner, "devon@bluemountain.example", temp, /\/account\?first=1/);
  await owner.goto("/dashboard");
  await expect(owner).toHaveURL(/\/account/);
  await owner.getByLabel("Temporary password").fill(temp);
  await owner.getByLabel("New password", { exact: true }).fill("Devon-Garage-2026!");
  await owner.getByLabel("Type the new password again").fill("Devon-Garage-2026!");
  await owner.getByRole("button", { name: "Save password" }).click();
  await expect(owner).toHaveURL(/\/dashboard/);
  await expect(owner.locator(".sidebar .brand")).toHaveText("Blue Mountain Auto Care");
});

test("the wizard points at the field that needs fixing", async ({ page }) => {
  await login(page, E2E.admin.email, E2E.admin.password, /\/admin/);
  await page.goto("/admin/businesses/new");
  await page.getByLabel("Business name").fill("Broken Phone Barber");
  await page.getByRole("button", { name: "Next →" }).click();
  await page.getByLabel("Owner's name").fill("Kev");
  await page.getByLabel(/Owner's email/).fill("kev@broken.example");
  await page.getByLabel("Owner's WhatsApp").fill("not a number");
  await page.getByRole("button", { name: /^10\. Review & create/ }).click();
  await page.getByRole("button", { name: "Create business" }).click();
  await expect(page.locator(".flash.error")).toContainText("Some answers need fixing");
  await page.getByRole("button", { name: "Fix" }).first().click();
  await expect(page.locator("#step-title")).toHaveText("2. Contacts & owner");
  await expect(page.getByLabel("Owner's WhatsApp")).toHaveAttribute("aria-invalid", "true");
});
