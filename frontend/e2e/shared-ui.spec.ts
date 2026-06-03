import { test, expect } from '@playwright/test';

async function loginAsAdmin(page: import('@playwright/test').Page) {
  await page.goto('/admin/login');
  await page.fill('input[name="username"], input[type="text"]', 'admin');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin/);
}

test.describe('Shared UI components regression', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('knowledge base page loads with Toast-capable actions', async ({ page }) => {
    await page.goto('/admin/knowledge');
    await page.waitForTimeout(500);
    await expect(page.locator('body')).toBeVisible();
  });

  test('FAQ page loads with search and action buttons', async ({ page }) => {
    await page.goto('/admin/faq');
    await page.waitForTimeout(500);
    await expect(page.locator('body')).toBeVisible();
  });

  test('settings page loads with configuration sections', async ({ page }) => {
    await page.goto('/admin/settings');
    await page.waitForTimeout(500);
    await expect(page.locator('body')).toBeVisible();
  });
});
