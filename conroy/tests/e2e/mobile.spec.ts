import { expect, test } from "@playwright/test";
import { E2E, login, widget } from "./helpers";

test.describe("phone-sized screens", () => {
  test("the widget opens full screen and the booking list is reachable", async ({ page }) => {
    await page.goto("/demo/tashas-beauty-salon");
    await widget(page).getByRole("button", { name: /Chat with Conroy/ }).click();
    const dialog = widget(page).getByRole("dialog");
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    const viewport = page.viewportSize()!;
    expect(box?.width).toBeGreaterThanOrEqual(viewport.width - 1);
    expect(box?.height).toBeGreaterThanOrEqual(viewport.height - 1);
    await widget(page).getByRole("tab", { name: "Book" }).click();
    await expect(widget(page).getByRole("button", { name: /Silk Press/ })).toBeVisible();
  });

  test("owner gets around with the Menu button and the bottom tabs, with no sideways scrolling", async ({ page }) => {
    await login(page, E2E.owner.email, E2E.owner.password, /\/dashboard/);
    const tabs = page.getByRole("navigation", { name: "Main pages" });
    await expect(tabs.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
    await tabs.getByRole("link", { name: "Bookings" }).click();
    await expect(page).toHaveURL(/\/dashboard\/bookings/);
    await expect(tabs.getByRole("link", { name: "Bookings" })).toHaveAttribute("aria-current", "page");

    // The full menu opens from the top bar and closes after choosing a page.
    await page.getByRole("button", { name: "Menu" }).click();
    const menu = page.locator("#mobile-menu");
    await expect(menu).toBeVisible();
    await menu.getByRole("link", { name: "Hours & holidays" }).click();
    await expect(page).toHaveURL(/\/dashboard\/settings\/hours/);
    await expect(menu).toBeHidden();
    await expect(page.getByRole("button", { name: "Menu" })).toHaveAttribute("aria-expanded", "false");

    for (const path of ["/dashboard", "/dashboard/bookings", "/dashboard/settings", "/dashboard/settings/hours", "/dashboard/settings/widget"]) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
    }

    // "Try your website chat" loads the real widget, with a way back.
    await page.getByRole("button", { name: "Menu" }).click();
    await menu.getByRole("link", { name: "Try your website chat" }).click();
    await expect(widget(page).getByRole("button", { name: /Chat with Conroy/ })).toBeVisible();
    await page.getByRole("link", { name: /Back to dashboard/ }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("login page has no sideways scrolling", async ({ page }) => {
    await page.goto("/login");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
