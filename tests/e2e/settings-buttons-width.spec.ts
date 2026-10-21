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

/*
 * FEAT-0611, AC7 — the button migration touches the same settings components
 * the grid work did, so the window is checked at a width below 560 px and one
 * above 960 px. The migration normalises control geometry; a control that no
 * longer fits would show up as horizontal overflow of the document.
 *
 * `?action=settings` opens the window on load (`+layout.svelte`), which keeps
 * the spec independent of the rail's markup.
 */

import { test, expect } from "@playwright/test";

const WIDTHS = [540, 1024];

for (const width of WIDTHS) {
    test(`settings window does not overflow at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto("/?action=settings");

        const tabRail = page.locator('[role="tablist"]').first();
        await expect(tabRail).toBeVisible({ timeout: 10000 });

        const overflow = await page.evaluate(
            () =>
                document.documentElement.scrollWidth -
                document.documentElement.clientWidth,
        );

        expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(1);
    });
}
