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
 * FEAT-0677 -- the indicator lesson model.
 *
 * One place names the four prose fields and builds their locale keys, so the
 * lesson view cannot invent a key the locale files do not carry. The field set
 * is fixed by ADR-0025. `indicatorLessons.test.ts` resolves every key through
 * `lessonKey` for every registry indicator in both languages, so the builder
 * and the corpus cannot drift apart -- not even for a single field.
 *
 * Two sets, on purpose:
 *
 * - `LESSON_GROUPS` renders from `INDICATOR_CATALOGUE`, the list the alert
 *   panel offers -- FEAT-0677 criterion 2 names it for the rendered list.
 * - The corpus pin in the test uses `REGISTRY_CATALOGUE`, everything the engine
 *   computes -- criterion 3. A lesson explains an indicator, so it survives the
 *   indicator leaving the alert path. Pinning the corpus to the offered subset
 *   instead would fail in the wrong direction on divergence: it would demand
 *   that reviewed prose be deleted, or that an indicator be wired into the
 *   alert path for a content reason.
 *
 * Pure TypeScript, no runes, so it is unit-testable without a component mount
 * -- the same reason `patternI18n.ts` sits next to it.
 */

import {
    INDICATOR_GROUP_ORDER,
    indicatorsInGroup,
    type CatalogueEntry,
    type IndicatorGroup,
} from "../alerts/indicatorCatalogue";

/** The four prose fields a lesson carries. ADR-0025 fixes the set at four. */
export const LESSON_FIELDS = [
    "whatItMeasures",
    "howToRead",
    "failureModes",
    "confirmation",
] as const;

export type LessonField = (typeof LESSON_FIELDS)[number];

/**
 * The locale namespace a lesson lives under, and only lessons.
 *
 * Tab chrome -- the heading, the search placeholder, the empty state -- belongs
 * under `academy.*` beside this subtree, not inside it. The corpus test pins the
 * ids here to the catalogue, so a chrome string placed inside would read as a
 * lesson for an indicator that does not exist.
 */
export const LESSON_NAMESPACE = "academy.indicators";

/**
 * Locale key for one field of one lesson.
 *
 * Returns a plain `string`, matching `nameKey`/`outputKey` in the catalogue:
 * callers cast at the use site, where the `TranslationKey` union is already in
 * scope.
 */
export function lessonKey(id: string, field: LessonField): string {
    return `${LESSON_NAMESPACE}.${id}.${field}`;
}

/** One group of the lesson list, entries in catalogue order. */
export interface LessonGroup {
    readonly group: IndicatorGroup;
    readonly entries: readonly CatalogueEntry[];
}

/**
 * The lesson list to render, grouped in `INDICATOR_GROUP_ORDER`.
 *
 * A constant rather than a function: both inputs are import-time constants, so
 * deriving per call buys nothing and would hand every caller a fresh array --
 * no `next !== prev` guard would be possible, and Svelte would re-diff the whole
 * list on each recompute. Derived from the catalogue and never hand-kept, so
 * adding an indicator adds a row with no edit here.
 */
export const LESSON_GROUPS: readonly LessonGroup[] = INDICATOR_GROUP_ORDER.map((group) => ({
    group,
    entries: indicatorsInGroup(group),
}));
