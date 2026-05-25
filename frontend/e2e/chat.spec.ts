import { test, expect } from "@playwright/test";

async function loginAsAdmin(page: import("@playwright/test").Page) {
  await page.goto("/admin/login");
  await page.fill('input[name="username"], input[type="text"]', "admin");
  await page.fill('input[type="password"]', "admin123");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin/);
}

test.describe("Chat page — admin portal", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("chat page loads with sidebar and input area", async ({ page }) => {
    await page.goto("/admin/conversations");
    await expect(page.locator("text=新建对话")).toBeVisible();
    await expect(page.locator("textarea")).toBeVisible();
  });

  test("can create a new conversation", async ({ page }) => {
    await page.goto("/admin/conversations");
    await page.click("text=新建对话");
    const textarea = page.locator("textarea");
    await expect(textarea).toBeVisible();
    await expect(textarea).toBeEnabled();
  });

  test("sidebar shows conversation history groups", async ({ page }) => {
    await page.goto("/admin/conversations");
    await page.waitForTimeout(1000);
    const sidebar = page.locator(".glass-card").first();
    await expect(sidebar).toBeVisible();
  });
});

test.describe("Chat page — student portal", () => {
  test("student login page loads", async ({ page }) => {
    await page.goto("/student/login");
    await expect(page.locator("body")).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });
});
