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
 * The generated `TranslationKey` union against the dictionary it comes from.
 *
 * `schema.d.ts` is committed and marked auto-generated, but nothing regenerates
 * it: `scripts/generate-i18n-types.js` is wired into no npm script and no CI
 * step. By the time the first code to consume the lesson keys landed it had
 * drifted by exactly the 92 `academy.indicators.*` keys added in #4051/#4053,
 * so those keys were absent from the union -- and each one resolved at the call
 * site through a `string` to `TranslationKey` cast, which is always legal and
 * checks nothing.
 *
 * This makes the next drift a failure instead of a cast. It reads the file on
 * disk rather than regenerating it, so a stale union fails without the test
 * writing to the tree; run `node scripts/generate-i18n-types.js` to fix it.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { flattenKeys } from "../../scripts/lib/i18nKeys.mjs";
import en from "./locales/en.json";

const SCHEMA_PATH = resolve(process.cwd(), "src/locales/schema.d.ts");

/** Every member of the generated `TranslationKey` union, in file order. */
function unionMembers(source: string): string[] {
    return source
        .split("\n")
        .map((line) => /^\s*\| "(.*?)";?$/.exec(line)?.[1])
        .filter((key): key is string => key !== undefined);
}

describe("generated TranslationKey union", () => {
    it("lists every key of the English dictionary, and nothing else", () => {
        const dictionary = flattenKeys(en as Record<string, unknown>) as string[];
        expect(dictionary.length).toBeGreaterThan(0);

        const members = unionMembers(readFileSync(SCHEMA_PATH, "utf8"));
        expect(members.length).toBeGreaterThan(0);

        expect(members.slice().sort()).toEqual(dictionary.slice().sort());
    });
});
