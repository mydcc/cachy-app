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
 * BUG-0478 -- every translation the indicator panel asks for exists.
 *
 * The panel builds most of its keys at render time: `op.${op}`,
 * `cross.${direction}`, `reference.${kind}` and `priceSource.${field}` from the
 * enums the condition form owns, and the names, outputs, parameters and group
 * headings through the five builders in `indicatorCatalogue.ts`. Nothing pinned
 * those to the locale files. `scripts/validate-i18n.js` compares DE against EN,
 * which keeps the two files equal but not complete -- a key deleted from *both*
 * leaves that check green while the panel renders the raw key. `schema.d.ts` is
 * no help either, since the templates are cast to `TranslationKey`.
 *
 * So this guard is absolute rather than differential: for every key the code
 * can build, both locales have to resolve it.
 */

import { describe, expect, it } from "vitest";

import de from "../../locales/locales/de.json";
import en from "../../locales/locales/en.json";
import {
    INDICATOR_CATALOGUE,
    INDICATOR_GROUP_ORDER,
    dimensionOf,
    groupHintKey,
    groupKey,
    nameKey,
    outputKey,
    paramKey,
} from "./indicatorCatalogue";
import { ALL_COMPARE_OPS, CROSS_DIRECTIONS, referenceKindsFor } from "./indicatorConditionForm";
import { PRICE_FIELDS } from "../rules/alertPathIndicators";

/** Resolves a dotted key, throwing instead of returning the key on a miss. */
function translatorFor(bundle: unknown): (key: string) => string {
    return (key) => {
        const raw = key.split(".").reduce<unknown>(
            (node, part) =>
                node && typeof node === "object"
                    ? (node as Record<string, unknown>)[part]
                    : undefined,
            bundle,
        );
        if (typeof raw !== "string") throw new Error(`missing locale key: ${key}`);
        return raw;
    };
}

const dt = translatorFor(de);
const et = translatorFor(en);

const PREFIX = "dashboard.alerts.indicators";

/**
 * Every key the panel can build, gathered from the same enums the tab renders
 * from, so an enum member added without a translation fails here rather than
 * reaching a trader as a raw key.
 */
const keys = new Set<string>();

for (const entry of INDICATOR_CATALOGUE) {
    keys.add(nameKey(entry.id));
    for (const output of entry.outputs) {
        keys.add(outputKey(output.name));
        // Over the catalogue rather than a hand-written list: which reference
        // kinds are reachable is `referenceKindsFor`'s to say, not this test's.
        for (const kind of referenceKindsFor(entry, dimensionOf(entry, output.name))) {
            keys.add(`${PREFIX}.reference.${kind}`);
        }
    }
    for (const param of entry.params) keys.add(paramKey(param.name));
}
for (const group of INDICATOR_GROUP_ORDER) {
    keys.add(groupKey(group));
    keys.add(groupHintKey(group));
}
for (const op of ALL_COMPARE_OPS) keys.add(`${PREFIX}.op.${op}`);
for (const direction of CROSS_DIRECTIONS) keys.add(`${PREFIX}.cross.${direction}`);
for (const field of PRICE_FIELDS) keys.add(`${PREFIX}.priceSource.${field}`);

// Spelled out in the template rather than looped over an enum, so nothing else
// reaches them: the relation selector and the window aggregate.
keys.add(`${PREFIX}.relationKind.compare`);
keys.add(`${PREFIX}.relationKind.cross`);
keys.add(`${PREFIX}.windowAgg.max`);
keys.add(`${PREFIX}.windowAgg.min`);

describe("the indicator panel's translations", () => {
    it("resolves every key it can build in both locales", () => {
        for (const key of [...keys].sort()) {
            expect(() => et(key), `en is missing ${key}`).not.toThrow();
            expect(() => dt(key), `de is missing ${key}`).not.toThrow();
        }
    });
});
