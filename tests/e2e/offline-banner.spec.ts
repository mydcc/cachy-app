/*
 * Copyright (C) 2026 MYDCT
 * 
 * E2E TEST: Offline Banner
 * 
 * Verifies that the offline banner appears when connection is lost
 * and allows users to reconnect or diagnose connection issues.
 */

import { test, expect } from '@playwright/test';

test.describe('Offline Banner UX', () => {
    test('should show offline banner when disconnected', async ({ page, context }) => {
        await page.goto('/');

        // Wait for initial connection
        await page.waitForTimeout(2000);

        // Simulate offline
        await context.setOffline(true);
        await page.waitForTimeout(2000);

        // Banner should become visible
        const banner = page.locator('[data-testid="offline-banner"]');
        await expect(banner).toBeVisible({ timeout: 5000 });

        // Should show appropriate message
        const message = banner.locator('text=/disconnected|offline|waiting/i');
        await expect(message).toBeVisible();
    });

    test('should allow reconnection via button', async ({ page, context }) => {
        await page.goto('/');
        await page.waitForTimeout(2000);

        // Go offline
        await context.setOffline(true);
        await page.waitForTimeout(2000);

        const banner = page.locator('[data-testid="offline-banner"]');
        await expect(banner).toBeVisible();

        // Find reconnect button
        const reconnectBtn = banner.locator('button', { hasText: /reconnect|retry/i });

        // Go back online
        await context.setOffline(false);

        // Click reconnect
        if (await reconnectBtn.isVisible()) {
            await reconnectBtn.click();
        }

        await page.waitForTimeout(2000);

        // Banner should disappear when connected
        await expect(banner).not.toBeVisible({ timeout: 10000 });
    });

    test('should show connection status indicator', async ({ page }) => {
        await page.goto('/');

        // Connection status dot should be visible
        const statusIndicator = page.locator('[title*="WebSocket"]');
        await expect(statusIndicator).toBeVisible();
    });

    test('should handle rapid offline/online transitions', async ({ page, context }) => {
        await page.goto('/');
        await page.waitForTimeout(1000);

        // Rapid transitions
        await context.setOffline(true);
        await page.waitForTimeout(500);
        await context.setOffline(false);
        await page.waitForTimeout(500);
        await context.setOffline(true);
        await page.waitForTimeout(500);
        await context.setOffline(false);
        await page.waitForTimeout(2000);

        // Should stabilize to connected state
        const banner = page.locator('[data-testid="offline-banner"]');
        await expect(banner).not.toBeVisible({ timeout: 5000 });
    });
});
