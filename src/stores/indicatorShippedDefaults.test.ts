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
 * FEAT-0681 — the shipped indicator defaults a lesson compares against must
 * stay detached from the live store.
 *
 * `shippedIndicatorDefaults()` copies the frozen shipped record, so a baseline
 * can neither follow the trader's edits nor be edited through the store. Before
 * BUG-0682 the store's fields *were* those objects, and a write through the
 * store landed in them, which made the baseline report every edit as already
 * shipped — the "your setting" marker would never appear. The write happens
 * *before* the baseline is read here, so this fails for anything that derives
 * the baseline lazily from live state instead of from a copy.
 */

import { describe, it, expect } from "vitest";
import { indicatorState, shippedIndicatorDefaults } from "./indicator.svelte";

describe("FEAT-0681 — shippedIndicatorDefaults", () => {
    it("stays detached from an edit made through the store", () => {
        // Read the shipped value out as a primitive *before* the write. Comparing
        // a later read against a baseline captured by the same accessor is what a
        // live, aliasing baseline would satisfy — a false guard.
        const shippedLength = shippedIndicatorDefaults().rsi.length;
        // Non-vacuity: the value this test moves must not already be the one it
        // moves it to, or the assertion below could not fail.
        expect(shippedLength).not.toBe(21);

        const previous = indicatorState.rsi.length;
        try {
            indicatorState.rsi.length = 21;

            // The store really did take the write...
            expect(indicatorState.rsi.length).toBe(21);
            // ...and a baseline read afterwards still reports what a new install
            // starts from, not what the store now holds.
            expect(shippedIndicatorDefaults().rsi.length).toBe(shippedLength);
        } finally {
            indicatorState.rsi.length = previous;
        }
    });
});
