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

/**
 * FEAT-0389 -- "Tabs are code-split; opening the panel does not load every
 * builder."
 *
 * This guards the shape of the loader map, not the emitted bundle. The
 * distinction matters, so it is written down rather than implied: whether
 * Vite actually emits six chunks is a build-time fact this suite does not
 * measure. What it does measure is the one property that decides it — every
 * tab reached through its own literal `import()` specifier.
 *
 * The failure this prevents is specific and quiet. Rewriting the map as
 * `import(`./tabs/${tab}.svelte`)` is shorter, keeps every test passing, and
 * keeps the panel working — while Vite, unable to resolve the specifier
 * statically, bundles all six builders into one chunk that the panel then
 * downloads on open. Nothing observable breaks; the acceptance criterion
 * just quietly stops being true.
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ALERT_PANEL_TABS } from "../../stores/alertPanel.svelte";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "AlertPanelView.svelte"), "utf8");

/** `templates` -> `TemplatesTab`, the shell's own naming for its tab modules. */
function moduleNameFor(tab: string): string {
  return `${tab.charAt(0).toUpperCase()}${tab.slice(1)}Tab`;
}

describe("FEAT-0389: the panel's tab loaders stay splittable", () => {
  it("covers every tab in the strip", () => {
    // Guards the guard: a seventh tab added to ALERT_PANEL_TABS without a
    // loader would otherwise sail past the assertions below.
    expect(ALERT_PANEL_TABS.length).toBe(6);
  });

  it.each([...ALERT_PANEL_TABS])("reaches %s through its own literal import", (tab) => {
    const specifier = `import("./tabs/${moduleNameFor(tab)}.svelte")`;
    expect(source).toContain(specifier);
  });

  it.each([...ALERT_PANEL_TABS])("has a real module behind %s", (tab) => {
    expect(existsSync(resolve(here, "tabs", `${moduleNameFor(tab)}.svelte`))).toBe(true);
  });

  it("imports no tab through a computed specifier", () => {
    // A template literal anywhere inside an import() is the failure mode
    // described above; a static string is the only form Vite can split.
    expect(source).not.toMatch(/import\(\s*`/);
  });

  it("never imports a tab statically, which would defeat the split entirely", () => {
    // A static `import X from "./tabs/XTab.svelte"` pulls the builder into
    // the shell's own chunk no matter how clean the dynamic map looks.
    expect(source).not.toMatch(/^\s*import\s+.*from\s+["']\.\/tabs\//m);
  });
});
