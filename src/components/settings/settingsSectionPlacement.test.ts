/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU Affero General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option) any
 * later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE.  See the GNU Affero General Public License for more
 * details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * FEAT-0821 — one home per settings section, counted across `src/components`.
 *
 * A panel that configures exactly one thing must be built from one place. Two
 * render sites are not two bugs in the stores — both mount points read the same
 * store, so the value stays consistent — but they are two doors with no way for
 * a trader to tell whether the other one exists, which door the documentation
 * means, or whether closing one of them changes anything.
 *
 * The duplication this pins was real: `PaperTradingSettings` was rendered from
 * the Automation tab and from Trading → Paper Trading, and `RiskLimitsSettings`
 * from the Automation tab and from Trading → Risk & Kill Switch.
 *
 * The scan counts the component *identifier*, not a literal tag, in every
 * `.svelte` and `.ts` file under `src/components` (test files excluded). Any way
 * to render a second door — a plain tag, an import, a component map
 * (`paper: PaperTradingSettings`), `<svelte:component>` — has to name the
 * component in the file that builds it, so one scan covers all of them. The
 * root is `src/components` rather than the settings directory: a second door
 * under `alerts/` would be just as confusing as one in the next tab.
 *
 * The scan is textual on purpose. Mounting the settings window pulls in every
 * tab and its stores, so a failure would point at the harness; counting
 * mentions names the file that added the second door.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const COMPONENTS_ROOT = "src/components";

/**
 * Panels that configure one thing, and the single file allowed to build them.
 * Adding an entry here is the cheap way to keep a future panel from growing a
 * second home; it is not a list of every settings component.
 */
const SINGLE_HOME: Array<{ component: string; home: string }> = [
  {
    component: "PaperTradingSettings",
    home: "src/components/settings/tabs/TradingTab.svelte",
  },
  {
    component: "RiskLimitsSettings",
    home: "src/components/settings/tabs/TradingTab.svelte",
  },
];

/**
 * Every component source under the root. Tests are skipped on purpose: they
 * name the components in assertions, which is not a render site.
 */
function scannedFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return scannedFiles(path);
    if (/[.](test|spec)[.]ts$/.test(entry.name)) return [];
    return entry.name.endsWith(".svelte") || entry.name.endsWith(".ts")
      ? [path]
      : [];
  });
}

describe("settings sections have exactly one home", () => {
  const files = scannedFiles(COMPONENTS_ROOT);

  it("scans the component tree", () => {
    // A wrong root would make every case below pass with zero sites.
    expect(files.length).toBeGreaterThan(50);
  });

  it.each(SINGLE_HOME)("$component is named in $home only", ({ component, home }) => {
    // No `g` flag: a stateful `lastIndex` would make consecutive `test()` calls
    // on the same regex skip files and the case would pass for the wrong reason.
    const name = new RegExp(`\\b${component}\\b`);
    const sites = files.filter((file) => name.test(readFileSync(file, "utf8")));

    expect(sites.sort()).toEqual([home]);
  });
});
