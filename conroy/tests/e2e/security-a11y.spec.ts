import { expect, test } from "@playwright/test";
import { E2E, expectNoSeriousA11yIssues, login, widget } from "./helpers";

test.describe("security", () => {
  test("pages carry a nonce-based Content Security Policy", async ({ page }) => {
    const res = await page.goto("/login");
    const csp = res?.headers()["content-security-policy"] ?? "";
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(res?.headers()["x-frame-options"]).toBe("DENY");
  });

  test("signed-out visitors can't reach the dashboard, admin or exports", async ({ page, request }) => {
    await page.goto("/dashboard/bookings");
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login/);
    expect((await request.get("/admin/usage/export")).status()).toBe(401);
    expect((await request.get("/dashboard/privacy/export?phone=8765550142")).status()).toBe(401);
  });

  test("a business owner can't open the super-admin area", async ({ page }) => {
    await login(page, E2E.owner.email, E2E.owner.password, /\/dashboard/);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/dashboard\?error=/);
  });

  test("forgot-password gives the same answer whether or not the email exists", async ({ page }) => {
    await page.goto("/login/forgot");
    await expect(page.getByRole("heading", { name: "Forgot your password?" })).toBeVisible();
    // No SMTP in the e2e environment: the page says so instead of pretending to send.
    await expect(page.getByText(/Email isn't set up on this server/)).toBeVisible();
  });
});

test.describe("accessibility (WCAG 2.1 AA, serious and critical issues)", () => {
  test("login page", async ({ page }) => {
    await page.goto("/login");
    await expectNoSeriousA11yIssues(page);
  });

  test("widget: chat and booking tabs", async ({ page }) => {
    await page.goto("/demo/tashas-beauty-salon");
    await widget(page).getByRole("button", { name: /Chat with Conroy/ }).click();
    await expectNoSeriousA11yIssues(page, "#conroy-widget");
    await widget(page).getByRole("tab", { name: "Book" }).click();
    await expect(widget(page).getByRole("button", { name: /Silk Press/ })).toBeVisible();
    await expectNoSeriousA11yIssues(page, "#conroy-widget");
  });

  test("dashboard overview and bookings", async ({ page }) => {
    await login(page, E2E.owner.email, E2E.owner.password, /\/dashboard/);
    await expectNoSeriousA11yIssues(page);
    await page.goto("/dashboard/bookings");
    await expectNoSeriousA11yIssues(page);
  });
});
