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
 * above 960 px.
 *
 * `?action=settings` opens the window on load (`+layout.svelte`), which keeps
 * the spec independent of the rail's markup.
 *
 * The migration is measured, not the page: the default view renders none of
 * the migrated controls, and `.window-content` clips its overflow, so a
 * document-level scroll check alone passes without ever looking at a migrated
 * button (review on #4192). The spec therefore navigates to a sub-tab that
 * renders them, requires them to be present, and asserts none is clipped.
 */

import { test, expect } from "@playwright/test";

const WIDTHS = [540, 1024];

for (const width of WIDTHS) {
    test(`settings window keeps its migrated buttons inside the frame at ${width}px`, async ({
        page,
    }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto("/?action=settings");

        const tabRail = page.locator('[role="tablist"]').first();
        await expect(tabRail).toBeVisible({ timeout: 10000 });

        // The risk sub-tab holds the most migrated controls (the kill switch
        // and close-all actions). "Kill Switch" is the label in both locales.
        await page
            .locator(".window-content button", { hasText: /Kill Switch/ })
            .first()
            .click();

        const migrated = page.locator(".window-content .btn-base");
        await expect(migrated.first()).toBeVisible({ timeout: 10000 });
        expect(
            await migrated.count(),
            "no migrated control on screen — the check would measure nothing",
        ).toBeGreaterThan(0);

        const clipped = await page.evaluate(() => {
            const content = document.querySelector(".window-content");
            if (!content) return ["no .window-content"];
            const box = content.getBoundingClientRect();
            return [...content.querySelectorAll<HTMLElement>(".btn-base")]
                .filter((el) => el.getBoundingClientRect().right > box.right + 1)
                .map((el) => (el.textContent || "").trim().slice(0, 30));
        });
        expect(clipped, `buttons clipped at ${width}px`).toEqual([]);

        const overflow = await page.evaluate(
            () =>
                document.documentElement.scrollWidth -
                document.documentElement.clientWidth,
        );
        expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(1);
    });
}
