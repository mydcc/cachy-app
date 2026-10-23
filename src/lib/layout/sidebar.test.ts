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
 * FEAT-0617 — one clamp serves the drag preview, the persisted value and the
 * reset. A profile written before the key existed and a hand-edited blob both
 * have to reach the layout as a number the control can produce.
 */

import { describe, expect, it } from "vitest";
import {
  SIDEBAR_WIDTH_DEFAULT,
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_MIN,
  clampSidebarWidth,
} from "./sidebar";

describe("clampSidebarWidth (FEAT-0617)", () => {
  it.each([undefined, null, "", "420", Number.NaN, Infinity, -Infinity, {}, []])(
    "falls back to the shipped default for %s",
    (stored) => {
      expect(clampSidebarWidth(stored)).toBe(SIDEBAR_WIDTH_DEFAULT);
    },
  );

  it("keeps a value the control can produce", () => {
    expect(clampSidebarWidth(420)).toBe(420);
  });

  it("raises a value below the minimum", () => {
    expect(clampSidebarWidth(SIDEBAR_WIDTH_MIN - 1)).toBe(SIDEBAR_WIDTH_MIN);
  });

  it("lowers a value above the maximum", () => {
    expect(clampSidebarWidth(SIDEBAR_WIDTH_MAX + 1)).toBe(SIDEBAR_WIDTH_MAX);
  });

  it("rounds a fractional width instead of storing it", () => {
    expect(clampSidebarWidth(420.6)).toBe(421);
  });

  it("keeps the bounds in the order the clamp assumes", () => {
    expect(SIDEBAR_WIDTH_MIN).toBeLessThan(SIDEBAR_WIDTH_DEFAULT);
    expect(SIDEBAR_WIDTH_DEFAULT).toBeLessThan(SIDEBAR_WIDTH_MAX);
  });
});
