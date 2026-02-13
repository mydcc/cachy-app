
import { test, expect } from '@playwright/test';

test.describe('Connection Indicator', () => {
  test('should verify connection status indicator visual states', async ({ page, context }) => {
    // Enable logging
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', exception => console.log(`PAGE ERROR: ${exception}`));

    try {
        // 1. Start App
        await page.goto('/');

        // Wait for body to be visible to ensure load
        await expect(page.locator('body')).toBeVisible();

        // 2. Locate Indicator
        const indicator = page.getByTestId('connection-status-dot');

        // Increase timeout for initial load/render
        await expect(indicator).toBeVisible({ timeout: 15000 });

        // 3. Verify Connected State (Green)
        await expect(indicator).toHaveClass(/bg-\[var\(--success-color\)\]/, { timeout: 10000 });

        // Screenshot Connected
        await page.screenshot({ path: 'verification_connected.png' });

        // 4. Simulate Offline
        await context.setOffline(true);

        // 5. Verify Disconnected State (Red Pulse)
        await expect(indicator).toHaveClass(/bg-\[var\(--danger-color\)\]/, { timeout: 10000 });
        await expect(indicator).toHaveClass(/animate-pulse/);

        // Screenshot Disconnected
        await page.screenshot({ path: 'verification_disconnected.png' });
    } catch (e) {
        console.error("Test failed", e);
        await page.screenshot({ path: 'verification_failure.png' });
        throw e;
    }
  });
});
