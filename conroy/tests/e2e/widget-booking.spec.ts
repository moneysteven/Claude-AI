import { expect, test } from "@playwright/test";
import { E2E, expectNoSeriousA11yIssues, login, widget } from "./helpers";

test.describe.serial("website widget: chat and booking", () => {
  let reference = "";

  test("answers a Patois question from the knowledge base, with the AI notice", async ({ page }) => {
    await page.goto("/demo/tashas-beauty-salon");
    const w = widget(page);
    await w.getByRole("button", { name: /Chat with Conroy/ }).click();
    await expect(w.getByText(/AI assistant/).first()).toBeVisible();
    await expect(w.getByRole("link", { name: "Privacy notice" })).toHaveAttribute("href", /\/p\/tashas-beauty-salon\/privacy$/);
    await w.getByLabel("Type your message").fill("how much fi a silk press?");
    await w.getByLabel("Type your message").press("Enter");
    await expect(w.locator(".msg.bot").last()).toContainText("J$6,500");
  });

  test("books an appointment end to end", async ({ page }) => {
    await page.goto("/demo/tashas-beauty-salon");
    const w = widget(page);
    await w.getByRole("button", { name: /Chat with Conroy/ }).click();
    await w.getByRole("tab", { name: "Book" }).click();
    await w.getByRole("button", { name: /Silk Press/ }).click();
    const anyone = w.getByRole("button", { name: "Anyone available" });
    if (await anyone.isVisible().catch(() => false)) await anyone.click();

    // First day (from tomorrow) with free times.
    const days = w.getByRole("group", { name: "Choose a day" }).getByRole("button");
    let picked = false;
    for (let i = 1; i < 12 && !picked; i++) {
      await days.nth(i).click();
      const times = w.getByRole("group", { name: "Choose a time" }).getByRole("button");
      await expect(w.getByText("Checking…")).toHaveCount(0);
      if ((await times.count()) > 0) {
        await times.first().click();
        picked = true;
      }
    }
    expect(picked).toBe(true);
    await expectNoSeriousA11yIssues(page, "#conroy-widget");

    await w.getByLabel("Your name").fill("Shanice Brown");
    await w.getByLabel("WhatsApp number").fill("(876) 555 0142");
    await w.getByRole("button", { name: "Confirm booking" }).click();
    // Consent is required.
    await expect(w.getByRole("checkbox")).toBeVisible();
    await w.getByRole("checkbox").check();
    await w.getByRole("button", { name: "Confirm booking" }).click();
    const done = w.getByRole("status");
    await expect(done).toContainText("You're booked!");
    reference = (await done.innerText()).match(/Reference: ([A-Z0-9]{1,2}-[A-Z0-9]{4})/)?.[1] ?? "";
    expect(reference).not.toBe("");
  });

  test("the owner sees the booking and the WhatsApp confirmation in the dashboard", async ({ page }) => {
    await login(page, E2E.owner.email, E2E.owner.password, /\/dashboard/);
    await page.goto("/dashboard/bookings");
    await expect(page.getByText(reference)).toBeVisible();
    await expect(page.getByText("Shanice Brown").first()).toBeVisible();
    await page.goto("/dashboard/inbox");
    await page.getByRole("link", { name: /Shanice|\(876\) 555-0142/ }).first().click();
    await expect(page.getByText(/is confirmed for/)).toBeVisible();
    await expect(page.getByText(/template booking_confirmation/)).toBeVisible();
  });

  test("widget works from the keyboard and Escape returns focus to the button", async ({ page }) => {
    await page.goto("/demo/tashas-beauty-salon");
    const launcher = widget(page).getByRole("button", { name: /Chat with Conroy/ });
    await launcher.focus();
    await page.keyboard.press("Enter");
    await expect(widget(page).getByRole("dialog")).toBeVisible();
    await expect(widget(page).getByLabel("Type your message")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(widget(page).getByRole("dialog")).toBeHidden();
    await expect(launcher).toBeFocused();
    await expect(launcher).toHaveAttribute("aria-expanded", "false");
  });
});
