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
 * BUG-0682 — the store's fields used to be `$state` proxies over the very
 * objects the module-level defaults literal holds, so a write through the store
 * landed in the literal itself and `reset()` restored the trader's own edits as
 * the "defaults".
 *
 * The store is the app-wide singleton, so every test restores it in `afterEach`
 * through the public `update()`; a leaked write would make every later test in
 * this file — and any suite that reads the shipped values — observe the edit.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { defaultSettings, indicatorState } from "./indicator.svelte";
import type { IndicatorSettings } from "../types/indicators";

vi.mock("$app/env", () => ({ browser: true }));

const STORE_KEY = "cachy_indicator_settings";

let snapshot: IndicatorSettings;

function deepFreeze(value: unknown): void {
    if (value === null || typeof value !== "object") return;
    if (Object.isFrozen(value)) return;
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
}

beforeEach(() => {
    localStorage.clear();
    snapshot = indicatorState.toJSON();
    /*
     * The shipped record must be immutable: on a build with live `$state`
     * proxies, a store field that still aliases the literal would throw here
     * on the first write below instead of silently corrupting the defaults.
     * Where proxies are decoupled by construction (server builds) this changes
     * nothing — the writes land in private clones either way.
     */
    deepFreeze(defaultSettings);
});

afterEach(() => {
    indicatorState.update(() => snapshot);
    localStorage.clear();
});

describe("BUG-0682 — indicator reset", () => {
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
        indicatorState.rsi.length = 21;
        indicatorState.ema.ema1.length = 99;
        indicatorState.bollingerBands.stdDev = 5;

        expect(defaultSettings.rsi.length).toBe(14);
        expect(defaultSettings.ema.ema1.length).toBe(21);
        expect(defaultSettings.bollingerBands.stdDev).toBe(2);
    });

    it("still restores a stored blob through load", () => {
        // The `merge()` this fix deep-copies is on the load path: pin that a
        // persisted edit survives the round trip and that reset still returns
        // to the shipped values afterwards.
        localStorage.setItem(STORE_KEY, JSON.stringify({ rsi: { length: 21 } }));
        (indicatorState as unknown as { load(): void }).load();

        expect(indicatorState.rsi.length).toBe(21);

        // ...and the loaded card is detached: editing it must not move the
        // literal the next load merges against.
        indicatorState.rsi.length = 22;
        expect(defaultSettings.rsi.length).toBe(14);

        indicatorState.reset();
        expect(indicatorState.rsi.length).toBe(14);
    });
});
