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
 * is fixed by ADR-0025; the strings are pinned to `REGISTRY_CATALOGUE` by
 * `indicatorLessons.test.ts`, which is what makes them a reviewed corpus rather
 * than dead weight.
 *
 * Pure TypeScript, no runes, so it is unit-testable without a component mount
 * -- the same reason `patternI18n.ts` sits next to it.
 */

import {
    INDICATOR_CATALOGUE,
    INDICATOR_GROUP_ORDER,
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
 * Locale key for one field of one lesson.
 *
 * Returns a plain `string`, matching `nameKey`/`outputKey` in the catalogue:
 * callers cast at the use site, where the `TranslationKey` union is already in
 * scope.
 */
export function lessonKey(id: string, field: LessonField): string {
    return `academy.indicators.${id}.${field}`;
}

/** One group of the lesson list, entries in catalogue order. */
export interface LessonGroup {
    readonly group: IndicatorGroup;
    readonly entries: readonly CatalogueEntry[];
}

/**
 * The lesson list, grouped in `INDICATOR_GROUP_ORDER`.
 *
 * Derived from the catalogue on every call rather than stored, so adding an
 * indicator to `INDICATOR_CATALOGUE` adds a lesson row with no edit here --
 * the property FEAT-0677 asks for.
 */
export function lessonGroups(): readonly LessonGroup[] {
    return INDICATOR_GROUP_ORDER.map((group) => ({
        group,
        entries: INDICATOR_CATALOGUE.filter((entry) => entry.group === group),
    }));
}