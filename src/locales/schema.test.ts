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
 * writing to the tree; run `npm run i18n:types` to fix it, which the failure
 * message names too.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { flattenKeys } from "../../scripts/lib/i18nKeys.mjs";
import de from "./locales/de.json";
import en from "./locales/en.json";

const SCHEMA_PATH = resolve(process.cwd(), "src/locales/schema.d.ts");

/** Runnable command that repairs a failure here. */
const GENERATE_COMMAND = "npm run i18n:types";

/** The declaration the union members are read from. */
const UNION_DECLARATION = "export type TranslationKey =";

/**
 * Every member of the generated `TranslationKey` union, in file order.
 *
 * Scoped to the one `export type TranslationKey =` declaration rather than to
 * the whole file: `schema.d.ts` holds only that union today, but a helper type
 * with `| "…"` arms of its own would otherwise be read as phantom members.
 */
function unionMembers(source: string): string[] {
    const lines = source.split("\n");
    const start = lines.findIndex((line) => line.startsWith(UNION_DECLARATION));
    if (start === -1) return [];

    const members: string[] = [];
    for (const line of lines.slice(start)) {
        const member = /^\s*\| "(.*?)";?$/.exec(line)?.[1];
        if (member !== undefined) members.push(member);
        if (line.trimEnd().endsWith(";")) break;
    }
    return members;
}

describe("generated TranslationKey union", () => {
    it("lists every key of the English dictionary, and nothing else", () => {
        const dictionary = flattenKeys(en as Record<string, unknown>) as string[];
        expect(dictionary.length).toBeGreaterThan(0);

        const members = unionMembers(readFileSync(SCHEMA_PATH, "utf8"));
        expect(members.length).toBeGreaterThan(0);

        expect(
            members.slice().sort(),
            `the committed union is stale — run \`${GENERATE_COMMAND}\``,
        ).toEqual(dictionary.slice().sort());
    });
});

describe("windows.aria DE/EN parity (FEAT-0742)", () => {
    it("carries the same window aria keys in both languages", () => {
        const prefix = "windows.aria.";
        const enKeys = (
            flattenKeys(en as Record<string, unknown>) as string[]
        )
            .filter((key) => key.startsWith(prefix))
            .sort();
        const deKeys = (
            flattenKeys(de as Record<string, unknown>) as string[]
        )
            .filter((key) => key.startsWith(prefix))
            .sort();
        expect(enKeys.length).toBeGreaterThan(0);
        expect(deKeys).toEqual(enKeys);
    });
});

describe("academy.structure DE/EN parity (FEAT-0679 AC5)", () => {
    it("carries the same structure keys in both languages", () => {
        const prefix = "academy.structure.";
        const enKeys = (
            flattenKeys(en as Record<string, unknown>) as string[]
        )
            .filter((key) => key.startsWith(prefix))
            .sort();
        const deKeys = (
            flattenKeys(de as Record<string, unknown>) as string[]
        )
            .filter((key) => key.startsWith(prefix))
            .sort();
        expect(enKeys.length).toBeGreaterThan(0);
        expect(deKeys).toEqual(enKeys);
    });
});

describe("dashboard.alerts edit DE/EN parity (FEAT-0542)", () => {
    it("carries the same edit keys in both languages", () => {
        const prefix = "dashboard.alerts.edit";
        const enKeys = (
            flattenKeys(en as Record<string, unknown>) as string[]
        )
            .filter((key) => key.startsWith(prefix))
            .sort();
        const deKeys = (
            flattenKeys(de as Record<string, unknown>) as string[]
        )
            .filter((key) => key.startsWith(prefix))
            .sort();
        expect(enKeys.length).toBeGreaterThanOrEqual(4);
        expect(deKeys).toEqual(enKeys);
    });
});

describe("dashboard.alerts row detail DE/EN parity (FEAT-0543)", () => {
    function pick(dict: unknown, key: string): unknown {
        return key.split(".").reduce<unknown>((current, part) => {
            if (!current || typeof current !== "object") return undefined;
            return (current as Record<string, unknown>)[part];
        }, dict);
    }

    it("carries non-empty configuration and footer labels in both languages", () => {
        const keys = [
            "dashboard.alerts.configuration",
            "dashboard.alerts.panel.newAlert",
            "dashboard.alerts.panel.editingAlert",
        ];

        for (const key of keys) {
            expect(typeof pick(en, key), `missing EN ${key}`).toBe("string");
            expect(typeof pick(de, key), `missing DE ${key}`).toBe("string");
            expect(pick(en, key), `empty EN ${key}`).not.toBe("");
            expect(pick(de, key), `empty DE ${key}`).not.toBe("");
        }

        // "Editing alert" must not be the pencil's verb phrase in German.
        expect(pick(de, "dashboard.alerts.panel.editingAlert")).not.toBe(
            pick(de, "dashboard.alerts.editAlert"),
        );
    });
});

describe("dashboard.alerts suspended labels (BUG-0755)", () => {
    function pick(dict: unknown, key: string): unknown {
        return key.split(".").reduce<unknown>((current, part) => {
            if (!current || typeof current !== "object") return undefined;
            return (current as Record<string, unknown>)[part];
        }, dict);
    }

    it("carries non-empty text for every suspended reason in both languages", () => {
        const keys = [
            "dashboard.alerts.suspended",
            "dashboard.alerts.suspendedHint",
            "dashboard.alerts.suspendedDrawing",
            "dashboard.alerts.suspendedOrphan",
        ];

        for (const key of keys) {
            expect(typeof pick(en, key), `missing EN ${key}`).toBe("string");
            expect(typeof pick(de, key), `missing DE ${key}`).toBe("string");
            expect(pick(en, key), `empty EN ${key}`).not.toBe("");
            expect(pick(de, key), `empty DE ${key}`).not.toBe("");
        }
    });
});
