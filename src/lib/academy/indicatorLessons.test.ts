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
 * FEAT-0677 -- the lesson corpus against the indicators the engine computes.
 *
 * The prose under `academy.indicators.*` is written and merged, and until this
 * test nothing checked it against the registry: a lesson could name an
 * indicator that does not exist, or an indicator could have shipped with a
 * missing field, and only the "unused strings" report would have hinted at it.
 * The corpus is pinned to `REGISTRY_CATALOGUE`, not to the alert-filtered
 * `INDICATOR_CATALOGUE` -- a lesson explains an indicator, so it outlives the
 * indicator leaving the alert path. `indicatorCatalogue.test.ts` pins the
 * registry to `rule_indicator_registry`, which carries the engine guarantee.
 *
 * Every key is resolved through `lessonKey`, never through a property path
 * spelled out here. That is the point of the file. An earlier revision read the
 * bundle with its own interpolation and pinned the builder with two literal
 * pairs, which left `howToRead` and `confirmation` unchecked: a builder emitting
 * the wrong field name for either passed all four cases while the renderer
 * painted raw keys for half the corpus.
 *
 * Every assertion states its expected count. A reader that resolves to an empty
 * object must fail, not agree with nothing -- the vacuous-pass failure mode the
 * placement guard in `indicatorCatalogue.test.ts` shipped with once.
 */

import { describe, expect, it } from "vitest";

import { INDICATOR_CATALOGUE, REGISTRY_CATALOGUE } from "../alerts/indicatorCatalogue";
import { LESSON_FIELDS, LESSON_GROUPS, LESSON_NAMESPACE, lessonKey } from "./indicatorLessons";
import de from "../../locales/locales/de.json";
import en from "../../locales/locales/en.json";

type Bundle = Record<string, unknown>;

const LOCALES: readonly (readonly [string, Bundle])[] = [
    ["en", en as Bundle],
    ["de", de as Bundle],
];

/** Read a dotted locale path, so resolution goes the same way the view reads. */
function lookup(bundle: Bundle, dotted: string): unknown {
    return dotted
        .split(".")
        .reduce<unknown>((node, part) => (node as Bundle | undefined)?.[part], bundle);
}

/** The `academy.indicators` subtree of a locale bundle, or `undefined`. */
function lessonSubtree(bundle: Bundle): Bundle | undefined {
    return lookup(bundle, LESSON_NAMESPACE) as Bundle | undefined;
}

describe("indicator lessons", () => {
    it("builds the key shape the locale files use", () => {
        // Documentation rather than proof: the corpus case below resolves every
        // id and field through `lessonKey`, which is what actually pins it.
        expect(lessonKey("adx", "confirmation")).toBe("academy.indicators.adx.confirmation");
    });

    it("resolves all four fields through the builder, for every registry indicator, in both languages", () => {
        // Non-vacuity: the registry is not empty, and neither is the subtree we
        // are about to read.
        expect(REGISTRY_CATALOGUE.length).toBeGreaterThan(0);
        for (const [name, bundle] of LOCALES) {
            const subtree = lessonSubtree(bundle);
            expect(subtree, `${name}: ${LESSON_NAMESPACE} missing`).toBeTypeOf("object");
            expect(Object.keys(subtree ?? {}).length).toBeGreaterThan(0);
        }

        const missing: string[] = [];
        for (const [name, bundle] of LOCALES) {
            for (const entry of REGISTRY_CATALOGUE) {
                for (const field of LESSON_FIELDS) {
                    const key = lessonKey(entry.id, field);
                    const value = lookup(bundle, key);
                    if (typeof value !== "string" || value.trim() === "") {
                        missing.push(`${name}:${key}`);
                    }
                }
            }
        }
        expect(missing).toEqual([]);
    });

    it("has a lesson for every registry indicator and none for anything else", () => {
        const registryIds = REGISTRY_CATALOGUE.map((entry) => entry.id).sort();
        expect(registryIds.length).toBeGreaterThan(0);
        for (const [name, bundle] of LOCALES) {
            // Sorted on both sides, so this fails loudly on a missing lesson and
            // on a stray one -- the reverse-direction gap the placement guard had.
            expect(Object.keys(lessonSubtree(bundle) ?? {}).sort(), name).toEqual(registryIds);
        }
    });

    it("carries exactly the four ADR-0025 fields, and no fifth, per lesson", () => {
        const expected = [...LESSON_FIELDS].sort();
        for (const [name, bundle] of LOCALES) {
            for (const entry of REGISTRY_CATALOGUE) {
                const lesson = lookup(bundle, `${LESSON_NAMESPACE}.${entry.id}`) as
                    | Bundle
                    | undefined;
                // Checked per locale, so a field present in one language and not
                // the other fails here as well.
                expect(Object.keys(lesson ?? {}).sort(), `${name}:${entry.id}`).toEqual(expected);
            }
        }
    });

    it("groups every offered indicator exactly once, with no empty group", () => {
        const listed = LESSON_GROUPS.flatMap((group) => group.entries.map((entry) => entry.id));
        const offered = INDICATOR_CATALOGUE.map((entry) => entry.id);
        expect(offered.length).toBeGreaterThan(0);
        expect(listed.slice().sort()).toEqual(offered.slice().sort());
        expect(new Set(listed).size).toBe(listed.length);

        // An empty group renders a heading over nothing.
        for (const { group, entries } of LESSON_GROUPS) {
            expect(entries.length, group).toBeGreaterThan(0);
        }
    });
});
