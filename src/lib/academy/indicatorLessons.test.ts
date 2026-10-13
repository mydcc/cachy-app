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
 * FEAT-0677 -- the lesson corpus against the catalogue it claims to describe.
 *
 * The prose under `academy.indicators.*` is written and merged, and until this
 * test nothing checked it against the indicators the engine actually computes:
 * a lesson could name an indicator that does not exist, or an indicator could
 * have shipped with a missing field, and only the "unused strings" list would
 * have hinted at it. The catalogue is already pinned to `rule_indicator_registry`
 * by `indicatorCatalogue.test.ts`, so pinning the lessons to the catalogue
 * carries the registry guarantee transitively -- which is what FEAT-0677's
 * "every lesson names an indicator the engine can compute" asks for.
 *
 * Every assertion states its expected count. A reader that resolves to an empty
 * object must fail, not agree with nothing -- the vacuous-pass failure mode that
 * the placement guard in `indicatorCatalogue.test.ts` shipped with once.
 */

import { describe, expect, it } from "vitest";

import { INDICATOR_CATALOGUE, INDICATOR_GROUP_ORDER } from "../alerts/indicatorCatalogue";
import { LESSON_FIELDS, lessonGroups, lessonKey } from "./indicatorLessons";
import de from "../../locales/locales/de.json";
import en from "../../locales/locales/en.json";

const LOCALES: readonly (readonly [string, Record<string, unknown>])[] = [
    ["en", en as Record<string, unknown>],
    ["de", de as Record<string, unknown>],
];

/** The `academy.indicators` subtree of a locale bundle, or `undefined`. */
function lessonSubtree(bundle: Record<string, unknown>): Record<string, unknown> | undefined {
    const academy = bundle.academy as Record<string, unknown> | undefined;
    return academy?.indicators as Record<string, unknown> | undefined;
}

describe("indicator lessons", () => {
    it("builds the key shape the locale files use", () => {
        expect(lessonKey("adx", "failureModes")).toBe("academy.indicators.adx.failureModes");
        expect(lessonKey("bollinger", "whatItMeasures")).toBe(
            "academy.indicators.bollinger.whatItMeasures",
        );
    });

    it("carries all four fields for every catalogue indicator, in both languages", () => {
        // Non-vacuity: the catalogue is not empty, and neither is the locale
        // subtree we are about to read.
        expect(INDICATOR_CATALOGUE.length).toBeGreaterThan(0);
        for (const [name, bundle] of LOCALES) {
            const subtree = lessonSubtree(bundle);
            expect(subtree, `${name}: academy.indicators missing`).toBeTypeOf("object");
            expect(Object.keys(subtree ?? {}).length).toBeGreaterThan(0);
        }

        const missing: string[] = [];
        for (const [name, bundle] of LOCALES) {
            const subtree = lessonSubtree(bundle) ?? {};
            for (const entry of INDICATOR_CATALOGUE) {
                const lesson = subtree[entry.id] as Record<string, unknown> | undefined;
                for (const field of LESSON_FIELDS) {
                    const value = lesson?.[field];
                    if (typeof value !== "string" || value.trim() === "") {
                        missing.push(`${name}:${entry.id}.${field}`);
                    }
                }
            }
        }
        expect(missing).toEqual([]);
    });

    it("has a lesson for every catalogue indicator and none for anything else", () => {
        const catalogueIds = INDICATOR_CATALOGUE.map((entry) => entry.id).sort();
        expect(catalogueIds.length).toBeGreaterThan(0);
        for (const [name, bundle] of LOCALES) {
            // Sorted on both sides, so this fails loudly on a missing lesson and
            // on a stray one -- the reverse-direction gap the placement guard had.
            expect(Object.keys(lessonSubtree(bundle) ?? {}).sort(), name).toEqual(catalogueIds);
        }
    });

    it("groups every indicator exactly once, in catalogue group order", () => {
        const groups = lessonGroups();
        expect(groups.map((g) => g.group)).toEqual([...INDICATOR_GROUP_ORDER]);

        const listed = groups.flatMap((g) => g.entries.map((e) => e.id));
        expect(listed.slice().sort()).toEqual(INDICATOR_CATALOGUE.map((e) => e.id).sort());
        expect(new Set(listed).size).toBe(listed.length);

        // Each entry sits under its own group, so a group filter cannot hide one.
        for (const { group, entries } of groups) {
            for (const entry of entries) {
                expect(entry.group, entry.id).toBe(group);
            }
        }
    });
});