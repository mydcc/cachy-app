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
 * FEAT-0617 — the 384 px default lives in TypeScript for the reset and in
 * themes.css for the pre-hydration fallback. A drift between the two is
 * invisible in unit tests that import only one side, so pin the pair.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SIDEBAR_WIDTH_DEFAULT } from "./lib/layout/sidebar";

const CSS = readFileSync("src/themes.css", "utf8");

describe("sidebar width token (FEAT-0617)", () => {
  it("keeps the CSS fallback in sync with the reset constant", () => {
    const match = CSS.match(/--sidebar-width:\s*(\d+)px/);
    expect(match, "--sidebar-width missing from themes.css").not.toBeNull();
    expect(Number(match?.[1])).toBe(SIDEBAR_WIDTH_DEFAULT);
  });
});
