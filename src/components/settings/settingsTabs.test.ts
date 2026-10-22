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
 * FEAT-0607 — the settings tab lists are the single source for navigation.
 * These cases guard the properties that made the old window inconsistent:
 *
 *   1. Every tab label resolves to a key that exists in both locales.
 *   2. No tab label carries an `|| "English"` fallback that hides a missing
 *      key behind a plausible string.
 *   3. Every tab bar is the shared component, and the two windows whose panels
 *      are components render them from the array instead of an `{#if}` chain.
 *
 * The cases read source and locale files rather than mounting the components:
 * mounting `SettingsContent` pulls in all eight tabs and their stores, which
 * makes a failure point at the harness instead of the rule. The label keys are
 * read from the source, not derived from the ids — a copy-paste that points
 * every label at one key has to fail here.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CONTENT = "src/components/settings/SettingsContent.svelte";
const VISUALS = "src/components/settings/tabs/VisualsTab.svelte";
const TRADING = "src/components/settings/tabs/TradingTab.svelte";
const AI = "src/components/settings/tabs/AiTab.svelte";
const CONNECTIONS = "src/components/settings/tabs/ConnectionsTab.svelte";
const SYSTEM = "src/components/settings/tabs/SystemTab.svelte";
const INDICATORS = "src/components/settings/tabs/IndicatorSettings.svelte";

/** The tab list each file owns, pinned so a dropped tab cannot pass. */
const TAB_LISTS: Array<[file: string, ids: string[]]> = [
  [CONTENT, ["trading", "automation", "chart", "visuals", "ai", "connections", "system", "cloud"]],
  [VISUALS, ["appearance", "layout", "background"]],
  [TRADING, ["market", "chart", "risk", "paper", "audit"]],
  [AI, ["intelligence", "behavior", "agents"]],
  [CONNECTIONS, ["exchanges", "data", "rss"]],
  [SYSTEM, ["performance", "dashboard", "data", "maintenance", "controls"]],
  [INDICATORS, ["general", "oscillators", "trend", "volatility", "volume", "chart"]],
];

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

/**
 * The body of the file's tab array. `const tabs: TabDef[] = $derived([…]);`
 * and `const subTabs = […];` both end at the array's own closing bracket.
 */
function tabBlock(source: string): string {
  const match = source.match(
    /const (?:tabs|subTabs)[^=]*=\s*(?:\$derived\()?\s*\[([\s\S]*?)\n\s*\]\s*\)?\s*;/,
  );
  return match?.[1] ?? "";
}

function tabIds(source: string): string[] {
  return [...tabBlock(source).matchAll(/\bid: "([a-z]+)"/g)].map((match) => match[1]);
}

function labelKeys(source: string): string[] {
  return [...tabBlock(source).matchAll(/\$_\(\s*"([^"]+)"\s*\)/g)].map((match) => match[1]);
}

describe("settings tab wiring (FEAT-0607)", () => {
  const de = locale("src/locales/locales/de.json");
  const en = locale("src/locales/locales/en.json");

  it.each(TAB_LISTS)("%s owns the expected tabs, in order", (file, expected) => {
    expect(tabIds(read(file))).toEqual(expected);
  });

  it.each(TAB_LISTS)("%s labels every tab in DE and EN", (file) => {
    const source = read(file);
    const keys = labelKeys(source);

    expect(keys.length).toBe(tabIds(source).length);
    for (const key of keys) {
      expect(hasLabel(de, key), `${key} missing in de`).toBe(true);
      expect(hasLabel(en, key), `${key} missing in en`).toBe(true);
    }
  });

  it.each(TAB_LISTS)("%s uses no fallback string on a tab label", (file) => {
    // Scoped to the tab array: the four older tabs still carry unrelated
    // `|| "…"` body labels that this item does not touch.
    expect(tabBlock(read(file))).not.toMatch(/\$_\([^)]*\)\s*\|\|/);
  });

  it.each(TAB_LISTS)("%s renders its tabs through the shared bar", (file) => {
    expect(read(file)).toContain("<TabBar");
  });

  it.each([CONTENT, VISUALS])("%s renders the active panel from the tab array", (file) => {
    const source = read(file);

    expect(source).toMatch(/\{#each (tabs|subTabs) as tab \(tab\.id\)\}/);
    expect(source).toMatch(/\{@const ActiveTab = tab\.component( as Component)?\}/);
    expect(source).toContain("<ActiveTab />");
    // The chain the rewrite replaced: reinstating it would bypass the array.
    expect(source).not.toMatch(/\{#if active(Sub)?Tab ===/);
  });
});
