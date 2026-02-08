import { test, expect } from '@playwright/test';

test.describe('TradeFlow Visual Verification', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/'); 
        await page.waitForSelector('.trade-flow-container');
    });

    test('should render canvas and not be blank', async ({ page }) => {
        const canvas = page.locator('.trade-flow-container canvas');
        await expect(canvas).toBeVisible();
        
        // Wait for initialization
        await page.waitForTimeout(2000);
        
        const screenshot = await canvas.screenshot();
        expect(screenshot.length).toBeGreaterThan(0);
    });
});
