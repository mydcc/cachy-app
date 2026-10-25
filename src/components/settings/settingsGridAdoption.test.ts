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
 * FEAT-0608 — `SettingsGrid` is the only place that decides how settings
 * layouts flow into columns and rows. The settings window is resizable, so a
 * viewport breakpoint (`sm:`/`md:`/`lg:`/`xl:`, `2xl:`, arbitrary
 * `min-[…]:`) is wrong there: the same tab would change shape with the
 * browser, not with the window. The same applies to a child's
 * `col-span`/`grid-rows`: a viewport span on a container-query parent
 * creates an implicit track at narrow widths (the review's HIGH).
 *
 * The scan reads `class="…"` values only, so a comment or a `@container`
 * variant cannot trigger it. The window chrome lives in
 * `src/components/shared/windows` and legitimately follows the viewport.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SETTINGS_ROOT = "src/components/settings";
const LAYOUT_PROPERTIES = "grid-cols|col-span|grid-rows|grid-flow|auto-cols|auto-rows";

/** A viewport variant on a layout property. `@min-[…]` is a container query. */
export function hasViewportLayoutClass(classValue: string): boolean {
  return classValue.split(/\s+/).some((token) => {
    if (!token || token.startsWith("@")) return false;
    const match = token.match(
      /^(?:(?:sm|md|lg|xl|2xl):|max-(?:sm|md|lg|xl|2xl):|(?:min|max)-\[[^\]]+\]:)(.*)$/,
    );
    if (!match) return false;
    return new RegExp(`^(?:${LAYOUT_PROPERTIES})-`).test(match[1]);
  });
}

function svelteFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return svelteFiles(path);
    return entry.name.endsWith(".svelte") ? [path] : [];
  });
}

function classValues(source: string): string[] {
  return [...source.matchAll(/class="([^"]*)"/g)].map((match) => match[1]);
}

describe("settings grid adoption (FEAT-0608)", () => {
  it.each([
    ["grid grid-cols-1 sm:grid-cols-2", true],
    ["grid md:col-span-2", true],
    ["grid 2xl:grid-cols-4", true],
    ["grid max-sm:grid-cols-1", true],
    ["grid min-[600px]:grid-cols-2", true],
    ["grid @min-[560px]:grid-cols-2", false],
    ["grid @sm:grid-cols-2", false],
    ["grid grid-cols-2", false],
    ["flex md:flex-row", false],
  ])("classifies %s as viewport layout: %s", (classes, expected) => {
    expect(hasViewportLayoutClass(classes)).toBe(expected);
  });

  it("keeps viewport breakpoints out of settings layouts", () => {
    const offenders = svelteFiles(SETTINGS_ROOT).filter((file) =>
      classValues(readFileSync(file, "utf8")).some(hasViewportLayoutClass),
    );

    expect(
      offenders,
      "use SettingsGrid and col-span-full; settings follow the window width, not the viewport",
    ).toEqual([]);
  });
});
