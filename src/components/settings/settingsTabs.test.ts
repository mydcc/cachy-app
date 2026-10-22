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
 * FEAT-0607 — the settings tab list is the single source for navigation and
 * content. These cases guard the three properties that made the old window
 * inconsistent:
 *
 *   1. Every tab has a translated label in both locales.
 *   2. No tab label carries an `|| "English"` fallback that hides a missing
 *      key behind a plausible string.
 *   3. Both windows render their content from the tab array, not from a second
 *      `{#if}` chain that a new entry can miss.
 *
 * The cases read the source and the locale files rather than mounting the
 * components: mounting `SettingsContent` pulls in all eight tabs and their
 * stores, which makes a failure point at the harness instead of the rule.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SETTINGS_CONTENT = "src/components/settings/SettingsContent.svelte";
const VISUALS_TAB = "src/components/settings/tabs/VisualsTab.svelte";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function locale(path: string): Record<string, unknown> {
  return JSON.parse(read(path)) as Record<string, unknown>;
}

/** Walks a dotted key and returns whether it holds a non-empty string. */
function hasLabel(localeFile: Record<string, unknown>, key: string): boolean {
  let node: unknown = localeFile;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null) return false;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" && node.length > 0;
}

/** `id: "x"` entries of the tab array, in source order. */
function tabIds(source: string): string[] {
  return [...source.matchAll(/^\s+id: "([a-z]+)",$/gm)].map((match) => match[1]);
}

describe("settings tab wiring (FEAT-0607)", () => {
  const de = locale("src/locales/locales/de.json");
  const en = locale("src/locales/locales/en.json");

  it.each([
    [SETTINGS_CONTENT, "settings.tabs"],
    [VISUALS_TAB, "settings.visuals.subtabs"],
  ])("%s labels every tab in DE and EN", (file, prefix) => {
    const ids = tabIds(read(file));
    expect(ids.length).toBeGreaterThan(0);

    for (const id of ids) {
      expect(hasLabel(de, `${prefix}.${id}`), `${prefix}.${id} missing in de`).toBe(true);
      expect(hasLabel(en, `${prefix}.${id}`), `${prefix}.${id} missing in en`).toBe(true);
    }
  });

  it.each([SETTINGS_CONTENT, VISUALS_TAB])(
    "%s reads its labels from i18n without a fallback string",
    (file) => {
      const source = read(file);

      // The idiom the item removes: `$_(...) || "English"` hides a missing key.
      expect(source).not.toMatch(/\$_\([^)]*\)\s*\|\|/);
    },
  );

  it.each([SETTINGS_CONTENT, VISUALS_TAB])(
    "%s renders the active panel from the tab array",
    (file) => {
      const source = read(file);

      expect(source).toContain("<TabBar");
      // Keyed each + dynamic component is what makes a new tab one entry.
      expect(source).toMatch(/\{#each (tabs|subTabs) as tab \(tab\.id\)\}/);
      expect(source).toMatch(/\{@const ActiveTab = tab\.component\}/);
    },
  );

  it("keeps the density control's decided home in the item, not in code", () => {
    // AC10: the placement decision is recorded so FEAT-0614 does not choose
    // again. This asserts the decision survived the structural rewrite.
    const item = read(
      "docs/backlog/features/FEAT-0607-harmonize-settings-vocabulary-placement-and-tabs.md",
    );
    expect(item).toContain("Visuals → Layout");
  });
});
