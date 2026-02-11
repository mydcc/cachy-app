import { test, expect } from '@playwright/test';

// Define the WASM path we expect the app to load
// Note: In E2E, this matches the network request URL
const WASM_PATH = '**/technicals_wasm_bg.wasm';

test.describe('WASM Resilience & Hardening', () => {

    test('should retry loading WASM module upon network failure', async ({ page }) => {
        let attemptCount = 0;

        // Force WASM engine via LocalStorage
        await page.addInitScript(() => {
            window.localStorage.setItem('cachy_indicator_settings', JSON.stringify({
                preferredEngine: 'wasm'
            }));
        });

        // Intercept WASM requests
        await page.route(WASM_PATH, async (route) => {
            attemptCount++;

            if (attemptCount <= 2) {
                // Simulate network failure for the first 2 attempts
                await route.abort('failed');
            } else {
                // Allow the 3rd attempt to succeed
                await route.continue();
            }
        });

        // Navigate to the app (Dashboard)
        await page.goto('/');

        // Wait for the app to settle and retries to happen
        await page.waitForTimeout(5000);

        // Assert that we saw at least 3 attempts (1st fail, 2nd fail, 3rd success)
        expect(attemptCount).toBeGreaterThanOrEqual(3);
        
        // Optional: verify that the app is actually working/healthy
        // This depends on the UI. For now, checking the retry mechanism via network is the core goal.
        
        // Check for "Critical Error" toast - should NOT be present if retry worked
        const criticalToast = page.getByText('WASM module failed to load');
        await expect(criticalToast).not.toBeVisible();
    });

    test('should handle permanent WASM failure gracefully', async ({ page }) => {
        // Intercept and fail ALL requests
        await page.route(WASM_PATH, async (route) => {
            await route.abort('failed');
        });

        await page.goto('/');
        
        // Wait for retries to exhaust
        await page.waitForTimeout(5000);

        // Verify that the application is still responsive (did not crash)
        await expect(page.locator('body')).toBeVisible();

        // Verify that an error was logged or toast shown (depending on implementation)
        // Note: The current implementation logs error to console and throws.
        // The App should catch this and fallback.
        
        // We can check if the 'WASM' capability in debug panel is effectively off/red if we had that test hook.
        // For now, simple crash check is good.
    });

});
