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
 * fields flow into columns. The settings window is resizable, so a viewport
 * breakpoint (`sm:`/`md:`/`lg:`/`xl:`) is wrong there: the same tab would
 * change column count with the browser, not with the window.
 *
 * The scan is scoped to `src/components/settings`; the window chrome lives in
 * `src/components/shared/windows` and legitimately follows the viewport.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SETTINGS_ROOT = "src/components/settings";

function svelteFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return svelteFiles(path);
    return entry.name.endsWith(".svelte") ? [path] : [];
  });
}

describe("settings grid adoption (FEAT-0608)", () => {
  it("keeps viewport breakpoints out of settings column counts", () => {
    const offenders = svelteFiles(SETTINGS_ROOT).filter((file) =>
      /(?:sm|md|lg|xl):grid-cols-/.test(readFileSync(file, "utf8")),
    );

    expect(
      offenders,
      "use SettingsGrid; it follows the settings window width, not the viewport",
    ).toEqual([]);
  });

  it("adopts SettingsGrid in the two appearance tabs and IndicatorSettings", () => {
    for (const file of [
      "src/components/settings/tabs/VisualsAppearance.svelte",
      "src/components/settings/tabs/VisualsBackground.svelte",
      "src/components/settings/tabs/IndicatorSettings.svelte",
    ]) {
      expect(readFileSync(file, "utf8"), `${file} has no SettingsGrid`).toContain(
        "<SettingsGrid",
      );
    }
  });
});
