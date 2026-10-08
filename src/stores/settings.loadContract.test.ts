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
 * The load side of the settings persistence contract.
 *
 * `settings.persistenceContract.test.ts` guards the save side: a setting the
 * store declares and serializes. It says nothing about the way back. `load()`
 * assigns through three methods -- itself, `applyCoreFields` and
 * `applyDisplayFields` -- and a key missing from all three is written on every
 * save and never read back: the user's change survives until they reload, then
 * silently reverts to the default. Same defect class as the save side, opposite
 * direction.
 *
 * That is not hypothetical. `marketAnalysisInterval`, `pauseAnalysisOnBlur` and
 * `analysisTimeframes` were all three declared in `defaultSettings`, read by
 * `toJSON()`, and written by `CalculationSettings.svelte` -- and none of them
 * was assigned on load. `marketAnalysisInterval` made it more confusing: it is
 * assigned inside `applyMarketMode`, which only the `marketMode` setter calls,
 * and `load()` assigns `_marketMode` directly, so that path never runs during a
 * load either.
 *
 * Source-level, not runtime, because a runtime check cannot enumerate the load
 * path without duplicating it. The trade-off is stated in the assertion below.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SETTINGS_KEYS } from "./settings.svelte";
import { stripNonCode, methodBody } from "./settings/sourceScan";

const SOURCE_PATH = fileURLToPath(
  new URL("../stores/settings.svelte.ts", import.meta.url),
);

/**
 * Keys the load path handles through an indirection this scan cannot see as a
 * plain `this.<key> =`. Each entry has to name the indirection, because the
 * whole point is that the reason survives the item.
 *
 * Empty, and asserted empty below. The three indirections that exist --
 * `apiProvider` and `marketMode` behind their accessors, `isPro` and
 * `isProLicenseActive` on the entitlement store -- are derived from the class
 * shape instead of listed here, so a renamed accessor cannot leave a stale
 * exemption behind.
 */
const NOT_A_PLAIN_ASSIGNMENT: Readonly<Record<string, string>> = {};

describe("settings load contract", () => {
  const source = stripNonCode(readFileSync(SOURCE_PATH, "utf8"));

  /**
   * The whole load path. `load()` is included because it assigns on its own --
   * `accounts` and `activeAccountId` come from the decrypt branch, and
   * `_apiProvider` is set there too.
   */
  const loadPath = [
    methodBody(source, /^\s*private load\(\)/),
    methodBody(source, /private applyCoreFields\(/),
    methodBody(source, /private applyDisplayFields\(/),
  ].join("\n");

  it("assigns every key the store declares", () => {
    const covered = new Set<string>();

    // Direct assignment: this.<key> = ...
    for (const m of loadPath.matchAll(/this\.([A-Za-z_][A-Za-z0-9_]*)\s*=(?!=)/g))
      covered.add(m[1]);

    // Accessor indirection: `this._key` backs a declared `get key()`. Derived,
    // not listed, so a renamed accessor cannot leave a stale exemption behind.
    const getters = new Set(
      [...source.matchAll(/^\s*get ([A-Za-z_][A-Za-z0-9_]*)\(\)/gm)].map((m) => m[1]),
    );
    const stateFields = new Set(
      [
        ...source.matchAll(
          /^\s*(?:private |public |protected )?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\$state/gm,
        ),
      ].map((m) => m[1]),
    );
    for (const m of loadPath.matchAll(/this\._([A-Za-z][A-Za-z0-9_]*)\s*=(?!=)/g)) {
      if (getters.has(m[1]) && stateFields.has(`_${m[1]}`)) covered.add(m[1]);
    }

    // Collaborator indirection: `this.<store>.<key>` where the field is a
    // `readonly x = new Store(...)`. `entitlement` holds isPro and
    // isProLicenseActive this way.
    const collaborators = new Set(
      [...source.matchAll(/^\s*readonly ([A-Za-z_][A-Za-z0-9_]*)\s*=\s*new /gm)].map(
        (m) => m[1],
      ),
    );
    for (const m of loadPath.matchAll(
      /this\.([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\s*=(?!=)/g,
    )) {
      if (collaborators.has(m[1])) covered.add(m[2]);
    }

    const unloaded = SETTINGS_KEYS.filter(
      (key) => !covered.has(key) && !(key in NOT_A_PLAIN_ASSIGNMENT),
    );

    expect(
      unloaded,
      `these settings are serialized by toJSON() but never assigned by the load ` +
        `path, so a user's change reverts to the default on reload: ` +
        `${unloaded.join(", ")}`,
    ).toEqual([]);
  });

  it("exempts nothing, so an exemption cannot quietly become a hiding place", () => {
    expect(Object.keys(NOT_A_PLAIN_ASSIGNMENT)).toEqual([]);
  });

  it("covers the fields the store declares", () => {
    // So the scan above cannot pass because the key list was empty.
    expect(SETTINGS_KEYS.length).toBeGreaterThan(0);
  });
});