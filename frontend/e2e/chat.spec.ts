import { test, expect } from "@playwright/test";

test.describe("Chat page smoke test", () => {
  test("admin login page loads", async ({ page }) => {
    await page.goto("/admin/login");
    await expect(page.locator("body")).toBeVisible();
  });
});
