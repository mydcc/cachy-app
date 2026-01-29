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

import { test, expect } from "@playwright/test";

test("verify visual analysis chart renders correctly", async ({ page }) => {
  // 1. Set up local storage with predefined settings to skip onboarding and set dark theme
  await page.addInitScript(() => {
    localStorage.setItem(
      "cachy_settings",
      JSON.stringify({
        disclaimerAccepted: true,
        onboardingCompleted: true,
        theme: "dark", // Assuming 'dark' is a valid theme key
      }),
    );
  });

  // 2. Navigate to the main page
  await page.goto("/");

  // 3. Wait for the page to load and the calculator to be visible
  await page.waitForSelector(".calculator-wrapper");

  // 4. Fill in trade parameters to generate the chart
  // Account Size
  await page.fill("#account-size-input", "10000");

  // Risk Percentage
  await page.fill("#risk-percentage-input", "1");

  // Symbol
  await page.fill("#symbol-input", "BTCUSDT");

  // Entry Price (Simulate a Long trade)
  await page.fill("#entry-price-input", "50000");

  // Stop Loss
  await page.fill("#stop-loss-input", "49000"); // 1000 diff

  // Take Profit Targets (Add a target if none exist, or modify the first one)
  // Assuming there's a default TP row or we can add one.
  // Often there is a default TP. Let's try to set it.
  // If the inputs are dynamic, we might need to find them carefully.
  // Let's assume there is at least one TP row.
  const tpPriceInput = page
    .locator('.take-profit-row input[placeholder="Preis"]')
    .first();
  if (await tpPriceInput.isVisible()) {
    await tpPriceInput.fill("52000"); // 2R
  } else {
    // Click add button if needed
    await page.click('button[title="Weiteres Ziel hinzufügen"]');
    await tpPriceInput.fill("52000");
  }

  // 5. Wait for the chart to render
  // The container has class 'visual-bar-chart-wrapper' and aria-label 'Trade-Visualisierungsleiste'
  const visualBar = page.locator(".visual-bar-chart-wrapper");
  await expect(visualBar).toBeVisible();

  // 6. Verify Canvas existence
  const canvas = visualBar.locator("canvas");
  await expect(canvas).toBeVisible();

  // 7. Take a screenshot of the Visual Bar section
  await visualBar.screenshot({ path: "visual_analysis_chart.png" });
});
