import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

export { E2E } from "./global-setup";

export async function login(page: Page, email: string, password: string, expectPath: RegExp = /\/(dashboard|admin)/) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(expectPath);
}

/** The widget lives in a Shadow DOM; Playwright's CSS locators pierce it. */
export const widget = (page: Page) => page.locator("#conroy-widget");

/** WCAG 2.1 AA scan; fails on serious or critical problems. */
export async function expectNoSeriousA11yIssues(page: Page, include?: string) {
  // axe ships typings for a newer Playwright than the pinned one; the runtime API is the same.
  let builder = new AxeBuilder({ page } as unknown as ConstructorParameters<typeof AxeBuilder>[0]).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]);
  if (include) builder = builder.include(include);
  const results = await builder.analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.help} (${v.nodes.length}x) ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
}
