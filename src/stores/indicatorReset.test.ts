// @vitest-environment happy-dom
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
 * BUG-0682 — the store's fields used to be live references to the very objects
 * the module-level defaults literal holds, so a write through the store landed
 * in the literal itself and `reset()` restored the trader's own edits as the
 * "defaults".
 *
 * The frozen literal is what gives the "untouched" assertions their teeth: where
 * a field still aliases it, a write through the store lands on a frozen object
 * and throws instead of silently succeeding. That is an *identity* property, not
 * a reactive one — it holds whichever build resolves `$state`, so these guards
 * do not depend on the browser/server split that made this bug hard to observe.
 *
 * The store is the app-wide singleton, so every test restores it in `afterEach`
 * through the public `update()`; a leaked write would make every later test in
 * this file — and any suite that reads the shipped values — observe the edit.
 * (The freeze itself is process-wide, but Vitest isolates test files by default
 * — `isolate: true` in `vite.config.ts` — so it cannot reach another file. If
 * that ever changes, this file's freeze would follow the module into every suite
 * in the worker.)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DEFAULT_INDICATOR_SETTINGS, indicatorState } from "./indicator.svelte";
import type { IndicatorSettings } from "../types/indicators";

vi.mock("$app/env", () => ({ browser: true }));

const STORE_KEY = "cachy_indicator_settings";

/** The settings that hold an object, i.e. every one that can alias the literal. */
const OBJECT_KEYS = Object.entries(DEFAULT_INDICATOR_SETTINGS)
    .filter(([, value]) => value !== null && typeof value === "object")
    .map(([key]) => key as keyof IndicatorSettings);

/**
 * Writes a distinctly different value into the first leaf of `target`, keeping
 * the leaf's type so the store's own typing cannot reject it.
 *
 * Used to drive a write through *every* object-valued card: comparing the
 * references instead would prove nothing, because `$state` hands out a proxy and
 * a proxy is never `===` its target even when writes still reach it.
 */
function pokeFirstLeaf(target: Record<string, unknown>, marker: number): boolean {
    for (const [key, child] of Object.entries(target)) {
        if (child !== null && typeof child === "object") {
            if (pokeFirstLeaf(child as Record<string, unknown>, marker)) return true;
            continue;
        }
        if (typeof child === "number") target[key] = marker;
        else if (typeof child === "boolean") target[key] = !child;
        else if (typeof child === "string") target[key] = `${child}-edited`;
        else continue;
        return true;
    }
    return false;
}

let snapshot: IndicatorSettings;

beforeEach(() => {
    localStorage.clear();
    snapshot = indicatorState.toJSON();
});

afterEach(() => {
    indicatorState.update(() => snapshot);
    localStorage.clear();
});

describe("BUG-0682 — indicator reset", () => {
    it("freezes the shipped record deeply, so a forgotten copy cannot corrupt it quietly", () => {
        // The invariant the whole fix rests on, pinned where it is enforced.
        expect(Object.isFrozen(DEFAULT_INDICATOR_SETTINGS)).toBe(true);
        // Deep: a nested field is what a shallow copy would still share.
        expect(Object.isFrozen(DEFAULT_INDICATOR_SETTINGS.panelSections)).toBe(true);
        expect(Object.isFrozen(DEFAULT_INDICATOR_SETTINGS.ema.ema1)).toBe(true);

        // And the freeze has teeth: a write into an object that still references
        // the shipped record throws instead of corrupting the defaults. This is
        // what makes the module-level literal un-corruptible by *any* caller,
        // not only by the store.
        expect(() => {
            DEFAULT_INDICATOR_SETTINGS.rsi.length = 21;
        }).toThrow(TypeError);
    });

    it("restores the shipped values after a change, twice in a row", () => {
        indicatorState.rsi.length = 21;
        indicatorState.macd.fastLength = 5;
        // Nested: `ema1` is an object inside the card, so a shallow copy would
        // still share it with the defaults.
        indicatorState.ema.ema1.length = 99;

        // Non-vacuity: the writes really took effect, so the assertions below
        // observe the reset rather than a write that never happened.
        expect(indicatorState.rsi.length).toBe(21);

        indicatorState.reset();

        expect(indicatorState.rsi.length).toBe(14);
        expect(indicatorState.macd.fastLength).toBe(12);
        expect(indicatorState.ema.ema1.length).toBe(21);

        // A second cycle with different values: a fix that hands out one copy
        // but re-aliases it on reset would pass once and fail here.
        indicatorState.rsi.length = 30;
        indicatorState.reset();
        expect(indicatorState.rsi.length).toBe(14);
    });

    it("leaves the module-level defaults object untouched", () => {
        const before = structuredClone(DEFAULT_INDICATOR_SETTINGS);
        // Non-vacuity: the loop below is the guard, and it would assert nothing
        // on a settings record with no object-valued entries.
        expect(OBJECT_KEYS.length).toBeGreaterThan(5);

        /*
         * A write through *every* object-valued card, not a sample of three: the
         * fix touches all of them, and one missed copy would reintroduce the bug
         * with a spot check still green.
         *
         * What this can and cannot prove, learned the hard way: the freeze above
         * makes the literal un-corruptible, and the value comparison below is the
         * signal. On the environment this suite runs in, `$state` hands out a
         * clone, so an aliasing regression cannot be *reproduced* here — the
         * browser build that the bug reached is the one where a field really is
         * the literal. The loop therefore covers every card as a property check;
         * the guards with a reproducible RED in this environment are the freeze
         * above, the reset/load cases below, and the persistence case.
         */
        const poked = OBJECT_KEYS.filter((key) =>
            pokeFirstLeaf(indicatorState[key] as unknown as Record<string, unknown>, 424242),
        );
        expect(poked, "every object-valued card must have been written through").toEqual(
            OBJECT_KEYS,
        );

        expect(DEFAULT_INDICATOR_SETTINGS).toEqual(before);
    });

    it("still restores a stored blob through load", () => {
        // The `merge()` this fix deep-copies is on the load path: pin that a
        // persisted edit survives the round trip and that reset still returns
        // to the shipped values afterwards.
        localStorage.setItem(
            STORE_KEY,
            JSON.stringify({ rsi: { length: 21 }, ema: { ema1: { length: 33 } } }),
        );
        (indicatorState as unknown as { load(): void }).load();

        expect(indicatorState.rsi.length).toBe(21);
        // `ema` builds its own object instead of going through `merge()`, so it
        // needs its own case — without it only the cloned fallback branch runs.
        expect(indicatorState.ema.ema1.length).toBe(33);

        // ...and the loaded cards are detached: editing them must not move the
        // literal the next load merges against.
        indicatorState.rsi.length = 22;
        indicatorState.ema.ema1.length = 44;
        expect(DEFAULT_INDICATOR_SETTINGS.rsi.length).toBe(14);
        expect(DEFAULT_INDICATOR_SETTINGS.ema.ema1.length).toBe(21);

        indicatorState.reset();
        expect(indicatorState.rsi.length).toBe(14);
        expect(indicatorState.ema.ema1.length).toBe(21);
    });

    it("persists the record without a second copy of itself, and loads it back", () => {
        indicatorState.rsi.length = 21;
        (indicatorState as unknown as { save(): void }).save();

        const stored = JSON.parse(localStorage.getItem(STORE_KEY) ?? "null") as Record<
            string,
            unknown
        > | null;
        expect(stored?.rsi).toEqual(expect.objectContaining({ length: 21 }));
        // The cached JSON is a cache key for in-memory consumers. Persisting it
        // stored a second full copy of the settings inside the same blob, and
        // nothing read it back.
        expect(stored).not.toHaveProperty("_cachedJson");

        // The round trip: what was written is what loads.
        indicatorState.rsi.length = 14;
        (indicatorState as unknown as { load(): void }).load();
        expect(indicatorState.rsi.length).toBe(21);
    });
});
