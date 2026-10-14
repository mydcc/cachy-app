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

/*
 * FEAT-0685 — the window type scale is one contract across two files.
 *
 * `themes.css` holds the literals in `--type-*` and the root's `--text-*` reads
 * them; the window frame re-composes the six `--text-*` tokens with the window's
 * own factor. The re-composition has to happen in the frame, because a custom
 * property's `var()` is substituted on the element that *declares* it: a factor
 * set on the frame's content can never reach a token already resolved at the
 * root, which is exactly the defect this pairing fixes.
 *
 * Neither file shows that constraint alone, so it is pinned here — `zLayers.test.ts`
 * is the precedent for reading a stylesheet back in this repo. Reverting either
 * half leaves the A-/A+ buttons present and inert, which no other test can see.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const THEMES = readFileSync(join(process.cwd(), "src", "themes.css"), "utf-8");
const FRAME = readFileSync(
    join(process.cwd(), "src", "components", "shared", "windows", "WindowFrame.svelte"),
    "utf-8",
);

/** The six steps of the scale, Tailwind v4's own `--text-*` names. */
const SIZES = ["xs", "sm", "base", "lg", "xl", "2xl"] as const;

describe("FEAT-0685 — the window type scale", () => {
    it("keeps a literal for every size, and reads it from the root tokens", () => {
        for (const size of SIZES) {
            expect(THEMES, `--type-${size} literal`).toMatch(
                new RegExp(`--type-${size}:\\s*[\\d.]+rem;`),
            );
            // The root reads the literal, so outside a window the scale is
            // exactly what the app always shipped.
            expect(THEMES, `--text-${size} at the root`).toMatch(
                new RegExp(`--text-${size}:\\s*var\\(--type-${size}\\);`),
            );
        }
    });

    it("re-composes every token on the window's content, with the window's factor", () => {
        // On the element that also carries `--text-scale` — not at the root.
        for (const size of SIZES) {
            expect(FRAME, `--text-${size} in the frame`).toMatch(
                new RegExp(
                    `--text-${size}:\\s*calc\\(var\\(--type-${size}\\)\\s*\\*\\s*var\\(--text-scale,\\s*1\\)\\);`,
                ),
            );
        }
    });

    it("publishes the factor from the size, guarded, and only for an opted-in window", () => {
        // One source: the factor is derived from `fontSize` and the constant, so
        // there is no second piece of state to drift — and `textScale` is the
        // guard that keeps a stored non-number from becoming a set `NaN`.
        expect(FRAME).toMatch(/style:--text-scale=\{textScale\(win\.fontSize, win\.allowFontSize\)\}/);
        expect(FRAME).toMatch(/function textScale\(size: number, allowed: boolean\): number \{/);
    });
});
