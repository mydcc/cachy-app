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

import { test, expect } from "@playwright/test";

// FEAT-0050: the touch behaviour BUG-0042 fixed (touch-action: none,
// pointercancel handling on WindowFrame's drag handlers) is what unit tests
// model least well -- this drives an actual mobile-emulated drag gesture.
// Sized like devices['iPhone 13'], applied manually (not spread from
// `devices`) so this still runs under the repo's "chromium" project --
// `devices['iPhone 13']` itself defaults to WebKit, which isn't installed
// in every environment this suite runs in.
test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
});

test.describe("Window drag on a mobile viewport (BUG-0042/FEAT-0050)", () => {
    test("dragging a window by its header moves it and does not scroll the page", async ({
        page,
    }) => {
        await page.goto("/");

        // The 'assistant' window type is not isResponsive (unlike 'modal'/
        // 'academy'), so it opens at its normal floating size instead of
        // auto-maximizing edge-to-edge on a small viewport -- required for
        // a drag to be observable at all.
        const assistantButton = page.getByTitle("AI Assistant", { exact: true });
        await assistantButton.click();

        const frame = page
            .locator(".window-frame")
            .filter({ hasText: /AI Assistant|Quick Notes|Global Chat/ })
            .first();
        await expect(frame).toBeVisible();

        const header = frame.locator(".header-spacer").first();
        const headerBox = await header.boundingBox();
        expect(headerBox).not.toBeNull();
        if (!headerBox) return;

        const scrollBefore = await page.evaluate(
            () => document.scrollingElement?.scrollTop ?? 0,
        );
        const positionBefore = await frame.boundingBox();
        expect(positionBefore).not.toBeNull();
        if (!positionBefore) return;

        const startX = headerBox.x + headerBox.width / 2;
        const startY = headerBox.y + headerBox.height / 2;

        await page.mouse.move(startX, startY);
        await page.mouse.down();
        for (let i = 1; i <= 10; i++) {
            await page.mouse.move(startX + i * 8, startY + i * 6);
        }
        await page.mouse.up();

        const positionAfter = await frame.boundingBox();
        expect(positionAfter).not.toBeNull();
        if (!positionAfter) return;

        const scrollAfter = await page.evaluate(
            () => document.scrollingElement?.scrollTop ?? 0,
        );

        // The window followed the gesture...
        expect(
            Math.abs(positionAfter.x - positionBefore.x) > 20 ||
                Math.abs(positionAfter.y - positionBefore.y) > 20,
        ).toBe(true);
        // ...and the page underneath it did not scroll instead.
        expect(scrollAfter).toBe(scrollBefore);
    });
});
