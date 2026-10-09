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
 *
 * Declared autosave tracking — ADR-0024 decision 1.
 *
 * The autosave `$effect` in `SettingsManager` used to track every field by
 * calling `toJSON()`: a dynamic index read over `PERSISTENCE_SCHEMA` that
 * happened to touch all 172 fields as a side effect. That ownership was
 * implicit — any optimisation of `toJSON()` (memoising it, cloning once
 * instead of indexing per field) silently un-saved the store, with no test
 * to catch it.
 *
 * This module is the declared list: the effect iterates it explicitly, and
 * the invariant "the list covers every field in `PERSISTENCE_SCHEMA`" is
 * testable (`tracking.test.ts` fails on a missing group rather than on a
 * field that stopped being read). The reads go through
 * `readSerializedField`, the same function `toJSON()` uses, so tracking
 * depth and save depth are identical by construction — including the
 * `$state.snapshot` deep reads that keep in-place mutations of object-valued
 * fields (accounts, trade-flow, galaxy) scheduling saves.
 *
 * Deliberately pure: no I/O, no store reads, no Svelte runes. The manager
 * supplies the `SaveSource` facade over its own `$state` fields, which is
 * also what makes the tracking list sub-store-ready: each future sub-store
 * contributes its group, and the coordinator reads them all.
 */

import {
    PERSISTENCE_SCHEMA,
    readSerializedField,
    type FieldSchema,
    type SaveSource,
} from "./persistenceSchema";

/**
 * The fields the autosave effect must read. Generated from the schema — the
 * single key table — so a setting without a schema row is untracked by
 * definition, and the exactness test in `persistenceSchema.test.ts` is what
 * refuses to let that happen.
 *
 * The `fields` parameter exists for the contract test: passing a subset
 * proves a missing group schedules no save for its fields, which is the
 * failure mode this module exists to make loud.
 */
export function trackAutosaveReads(
    source: SaveSource,
    fields: readonly FieldSchema[] = PERSISTENCE_SCHEMA,
): void {
    for (const field of fields) {
        readSerializedField(field, source);
    }
}
