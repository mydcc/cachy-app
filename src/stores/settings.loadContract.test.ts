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
 * The load side of the settings persistence contract.
 *
 * `settings.persistenceContract.test.ts` guards the save side: a setting the
 * store declares and serializes. It says nothing about the way back. A key
 * written on every save but never read back survives until reload, then
 * silently reverts to the default. Same defect class as the save side,
 * opposite direction.
 *
 * That is not hypothetical. `marketAnalysisInterval`, `pauseAnalysisOnBlur` and
 * `analysisTimeframes` were all three declared in `defaultSettings`, read by
 * `toJSON()`, and written by `CalculationSettings.svelte` -- and none of them
 * was assigned on load.
 *
 * Since FEAT-0342 slice E the load mapping lives in the persistence schema
 * (`settings/persistenceSchema.ts`), not in hand-written `apply*` bodies.
 * The coverage below is therefore two halves: `load()` still assigns
 * `accounts`, `activeAccountId` and `_apiProvider` directly (checked
 * textually, as before), and every other declared key must have a schema load
 * entry whose driver the `apply*` methods actually call. Deleting a schema row
 * or unwiring a driver fails here by name. Source-level, because a runtime
 * check cannot enumerate the load path without duplicating it.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SETTINGS_KEYS } from "./settings.svelte";
import { stripNonCode, methodBody } from "./settings/sourceScan";
import {
    LOAD_BODY_KEYS,
    LOAD_SECRET_KEYS,
    loadSchemaEntries,
    PERSISTENCE_SCHEMA,
} from "./settings/persistenceSchema";

const SOURCE_PATH = fileURLToPath(
  new URL("../stores/settings.svelte.ts", import.meta.url),
);

/**
 * The `methodBody` counterpart for assertions that need the string literals
 * `stripNonCode` blanks — currently only the section arguments of the apply
 * drivers. Single-level bodies only (no nested braces): both drivers are one
 * `applySchemaLoad` call, so a negated-brace match is exact here. Do not
 * reuse this for methods with control flow — extend `sourceScan.ts` instead.
 */
function rawMethodBody(source: string, signature: RegExp): string {
    // Lazy to the first `{` (parameter lists hold no braces), then a
    // negated-brace capture for the single-level body.
    const match = source.match(
        new RegExp(`${signature.source}[\\s\\S]*?\\{([^}]*)\\}`),
    );
    if (!match) throw new Error(`method not found: ${signature}`);
    return match[1];
}

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
   * `load()` still owns its direct assignments -- `accounts` and
   * `activeAccountId` from the decrypt branch, `_apiProvider` from the venue
   * resolution. The schema carries no load entry for these by design.
   */
  const loadBody = methodBody(source, /^\s*private load\(\)/);

  it("assigns the schema-external keys in load()", () => {
    for (const key of LOAD_BODY_KEYS) {
      const plain = new RegExp(`this\\.${key}\\s*=(?!=)`);
      const backing = new RegExp(`this\\._${key}\\s*=(?!=)`);
      expect(
        plain.test(loadBody) || backing.test(loadBody),
        `load() no longer assigns ${key}, but the schema carries no load entry for it`,
      ).toBe(true);
    }
  });

  it("assigns the encryption flag and blobs in load()", () => {
    // Otherwise a stored encrypted profile loads as unencrypted with every
    // contract green: the schema carries `load: null` for these keys by
    // design, so only this pin sees the assignment disappear.
    for (const key of LOAD_SECRET_KEYS) {
      const plain = new RegExp(`this\\.${key}\\s*=(?!=)`);
      expect(
        plain.test(loadBody),
        `load() no longer assigns ${key}: an encrypted profile would silently load as unencrypted`,
      ).toBe(true);
    }
  });

  it("assigns every other declared key through the schema", () => {
    const schemaCovered = new Set(
      PERSISTENCE_SCHEMA.filter((field) => field.load !== null).map(
        (field) => field.key,
      ),
    );
    const unloaded = SETTINGS_KEYS.filter(
      (key) =>
        !schemaCovered.has(key) &&
        !(LOAD_BODY_KEYS as readonly string[]).includes(key) &&
        !(key in NOT_A_PLAIN_ASSIGNMENT),
    );

    expect(
      unloaded,
      `these settings are serialized by toJSON() but never assigned by the load ` +
        `path, so a user's change reverts to the default on reload: ` +
        `${unloaded.join(", ")}`,
    ).toEqual([]);
  });

  it("wires each apply driver to its schema section", () => {
    // Otherwise the table above is decoration: a row nobody iterates assigns
    // nothing, and the previous assertion still passes.
    const applyCore = methodBody(source, /private applyCoreFields\(/);
    const applyDisplay = methodBody(source, /private applyDisplayFields\(/);
    // Note: string literals are stripped by `stripNonCode`, so the section
    // argument is invisible here — section routing is pinned by the schema
    // test (`routes core and display entries to their apply driver`).
    expect(applyCore).toMatch(/loadSchemaEntries\(\s*\)/);
    expect(applyDisplay).toMatch(/loadSchemaEntries\(\s*\)/);
    expect(loadSchemaEntries("core").length).toBeGreaterThan(0);
    expect(loadSchemaEntries("display").length).toBeGreaterThan(0);
  });

  it("routes each apply driver to its own section, not the other's", () => {
    // The assertion above cannot see this: `stripNonCode` blanks the string
    // literals, so `loadSchemaEntries("core")` and `("display")` collapse to
    // the same text and a swapped driver pair stays green — every section
    // then reloads from defaults. Read the raw source here, where the
    // section argument is still visible.
    const raw = readFileSync(SOURCE_PATH, "utf8");
    const coreBody = rawMethodBody(raw, /private applyCoreFields\(/);
    const displayBody = rawMethodBody(raw, /private applyDisplayFields\(/);
    expect(coreBody).toMatch(/loadSchemaEntries\("core"\)/);
    expect(displayBody).toMatch(/loadSchemaEntries\("display"\)/);
    expect(coreBody).not.toMatch(/loadSchemaEntries\("display"\)/);
    expect(displayBody).not.toMatch(/loadSchemaEntries\("core"\)/);
  });

  it("exempts nothing, so an exemption cannot quietly become a hiding place", () => {
    expect(Object.keys(NOT_A_PLAIN_ASSIGNMENT)).toEqual([]);
  });

  it("covers the fields the store declares", () => {
    // So the scan above cannot pass because the key list was empty.
    expect(SETTINGS_KEYS.length).toBeGreaterThan(0);
  });
});
