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

/**
 * FEAT-0393 -- the lifecycle footer must not squeeze the builder off screen.
 *
 * The regression is a layout one: with `.tab-body { min-height: 0 }` the body was
 * the first thing the flex column sacrificed, so the footer growing collapsed the
 * builder — and the Arm button — to zero height. The fix is an `8rem` floor.
 *
 * A DOM component test cannot reach it. happy-dom applies no component CSS, so
 * `getComputedStyle` sees no floor, and no headless DOM simulates flex
 * distribution; an assertion that the button is "visible" there would be
 * theatre. What *is* checkable is the property that decides it: the `.tab-body`
 * rule keeps a non-zero `min-height`. Reverting to zero fails this test by name
 * instead of silently hiding the button until somebody opens the panel by hand.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
// Comments first, so the paragraph that *explains* the floor — and quotes
// `min-height: 0` — cannot be mistaken for the declaration itself.
const css = readFileSync(resolve(here, "AlertPanelView.svelte"), "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    "",
);

describe("FEAT-0393: builder body floor", () => {
    it("keeps a non-zero min-height, so a grown footer cannot collapse the builder", () => {
        const rule = css.match(/\.tab-body\s*\{([^}]*)\}/);
        expect(rule, "`.tab-body` must still be a rule in AlertPanelView.svelte").toBeTruthy();

        const minHeight = rule![1].match(/min-height:\s*([^;]+);/);
        expect(minHeight, "`.tab-body` must declare a min-height").toBeTruthy();
        expect(minHeight![1].trim()).not.toMatch(/^0(px|rem|em|%)?$/);
    });
});
