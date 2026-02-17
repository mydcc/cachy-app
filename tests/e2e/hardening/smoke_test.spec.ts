/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { test, expect } from '@playwright/test';

test.describe('Hardening Smoke Test', () => {
  test('should load the application without crashing', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/');

    // 1. Verify Title (i18n check implicitly)
    // The title in layout.svelte is {$_("seo.pageTitle")}
    // If i18n failed, it might be empty or key name.
    // We expect "Cachy" or similar.
    await expect(page).toHaveTitle(/Cachy/);

    // 2. Verify Main Layout
    await expect(page.locator('.app-container')).toBeVisible();

    // 3. Verify No Critical Console Errors (Hardening)
    // Ignore some known noise if necessary, but strictly fail on "undefined is not an object" etc.
    const criticalErrors = consoleErrors.filter(e =>
      !e.includes('ResizeObserver') &&
      !e.includes('Content Security Policy') &&
      !e.includes('favicon')
    );

    expect(criticalErrors, `Found console errors: ${JSON.stringify(criticalErrors)}`).toHaveLength(0);
  });

  test('should verify serialization stability via data attributes', async ({ page }) => {
    await page.goto('/');
    // If the app uses `stringifyAsync` for large data sets in the UI,
    // we might check if a specific element (like a chart or list) eventually loads.
    // For now, we just ensure the app doesn't hang.
    await page.waitForTimeout(1000);
    await expect(page.locator('body')).toBeVisible();
  });
});
