import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("fixture browser: clarification, sources, approvals, receipts, reload, recovery, responsive accessibility", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page).toHaveTitle(/InboxOps/);
  await expect(
    page.getByText("Fixture sandbox", { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Process new mail" }).click();
  await expect(page.getByText("A little context is needed")).toBeVisible();
  await page
    .getByLabel("Start (ISO 8601 with offset)")
    .fill(new Date(Date.now() + 7 * 86400000).toISOString());
  await page.getByLabel("IANA time zone").fill("UTC");
  await page.getByLabel("I confirm this date").check();
  await page.getByRole("button", { name: "Process new mail" }).click();
  await expect(
    page.getByRole("heading", { name: "Why this plan" }),
  ).toBeVisible();
  await expect(
    page
      .locator("blockquote footer")
      .filter({ hasText: "Meeting preferences.md" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Approve & send" }),
  ).toBeDisabled();
  for (const [name, width, height] of [
    ["desktop", 1440, 1000],
    ["tablet", 768, 1024],
    ["mobile", 390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.screenshot({
      path: `evidence/fixture-${name}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    const a11y = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(
      a11y.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
  }
  await page.getByLabel("Create this draft").check();
  await page
    .locator(".approval-row")
    .filter({ hasText: "Create this draft" })
    .getByRole("button", { name: "Approve", exact: true })
    .click();
  await expect(
    page.getByText("draft · verified", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Create this calendar hold").check();
  await page
    .locator(".approval-row")
    .filter({ hasText: "Create this calendar hold" })
    .getByRole("button", { name: "Approve", exact: true })
    .click();
  await expect(
    page.getByText("event · verified", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Send this exact reply").check();
  await page.getByRole("button", { name: "Approve & send" }).click();
  await expect(
    page.getByText("send · verified", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("send · verified", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "evidence/fixture-receipts-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  await page.getByLabel("Search query").fill("galaxy astronomy");
  await page.getByRole("button", { name: "Search sources" }).click();
  await expect(page.getByText("No relevant sources found.")).toBeVisible();
  await page.getByLabel("Document title").fill("invalid.exe");
  await page.getByLabel("Preference text").fill("Hello");
  await page.getByLabel("I approve this document").check();
  await page
    .getByRole("button", { name: "Import / update preferences" })
    .click();
  await expect(page.getByRole("alert")).toContainText("Invalid input");
  await page.screenshot({
    path: "evidence/fixture-error-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
