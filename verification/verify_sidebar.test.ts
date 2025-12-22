import { test, expect } from '@playwright/test';

test('verify sidebar accessibility', async ({ page }) => {
  await page.goto('http://localhost:5173');
  // Wait for sidebar to be visible (it's hidden on mobile, assuming desktop view by default)
  // Check if header is button
  const sidebarHeader = page.locator('.w-80 > div:first-child');
  // It should have role button
  await expect(sidebarHeader).toHaveAttribute('role', 'button');
  await expect(sidebarHeader).toHaveAttribute('tabindex', '0');

  // Take screenshot
  await page.screenshot({ path: 'verification/sidebar.png' });
});
