/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

// @ts-nocheck
import { test, expect } from '@playwright/test';

test.describe('Offline Banner UX', () => {
    test('should show offline banner when disconnected', async ({ page, context }) => {
        await page.goto('/');

        // Simulate offline
        await context.setOffline(true);

        const banner = page.locator('.offline-banner');
        await expect(banner).toBeVisible({ timeout: 5000 });
        await expect(banner).toContainText('Verbindung unterbrochen');
    });

    test('should allow reconnection via button', async ({ page, context }) => {
        await page.goto('/');

        await context.setOffline(true);
        const banner = page.locator('.offline-banner');
        await expect(banner).toBeVisible();

        // Restore network but app doesn't know yet (simulated)
        await context.setOffline(false);

        // Click reconnect
        const reconnectBtn = banner.locator('button', { hasText: 'Neu verbinden' });
        await reconnectBtn.click();

        // Banner should disappear
        await expect(banner).not.toBeVisible();
    });

    test('should show connection status indicator', async ({ page }) => {
        await page.goto('/');

        const status = page.locator('.connection-status');
        await expect(status).toBeVisible();
        // Check for green dot or "Connected" text
        // Implementation detail specific
    });

    test('should handle rapid offline/online transitions', async ({ page, context }) => {
        await page.goto('/');

        await context.setOffline(true);
        await page.waitForTimeout(500);
        await context.setOffline(false);
        await page.waitForTimeout(500);
        await context.setOffline(true);

        const banner = page.locator('.offline-banner');
        await expect(banner).toBeVisible();
    });
});
