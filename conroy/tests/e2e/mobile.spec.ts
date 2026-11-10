import { expect, test } from "@playwright/test";
import { widget } from "./helpers";

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

  test("login page has no sideways scrolling", async ({ page }) => {
    await page.goto("/login");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
