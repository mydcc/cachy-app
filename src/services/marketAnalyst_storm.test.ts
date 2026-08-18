// @vitest-environment jsdom
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
 * BUG-0230 regression guard.
 *
 * The analyst used to gate its freshness check on the QUALITY of the previous
 * result ("re-run unless the 4h trend is non-neutral") rather than on its AGE.
 * Because a missing EMA 200 also rendered as "neutral", and because the fetch
 * path could not supply enough candles for EMA 200 to converge, that condition
 * could never be satisfied: every cycle re-fetched every timeframe of every
 * favourite at the 2s fast-path interval, indefinitely.
 *
 * These tests pin the termination property, not the implementation: given a
 * feed that never produces an EMA 200, the analyst must still converge to its
 * configured interval instead of looping at 2s forever.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const fetchKlines = vi.fn(async () => HISTORY);

// Klines are plentiful, but the technicals never yield an EMA 200 -- the exact
// shape that used to make the loop non-terminating.
const HISTORY = Array.from({ length: 600 }, (_, i) => ({
    open: 100, high: 101, low: 99, close: 100, volume: 1, time: i * 60_000,
}));

vi.mock("../stores/market.svelte", () => ({
    marketState: { data: {}, updateTelemetry: vi.fn() },
}));

vi.mock("./technicalsService", () => ({
    technicalsService: {
        calculateTechnicals: vi.fn(async () => ({
            movingAverages: [],           // <- no EMA 200, ever
            oscillators: [{ name: "RSI", value: 50 }],
            confluence: { score: 50 },
        })),
    },
}));

vi.mock("./apiService", () => ({
    apiService: {
        fetchBitunixKlines: (...a: unknown[]) => fetchKlines(...(a as [])),
        fetchBitgetKlines: (...a: unknown[]) => fetchKlines(...(a as [])),
    },
}));
// Mutable so individual tests can widen the favourites list or flip the
// analyze-all toggle without re-declaring the module mock.
const favourites = { items: ["BTCUSDT", "ETHUSDT", "SOLUSDT", "LINKUSDT"] };
const settings = {
    apiProvider: "bitunix",
    analysisTimeframes: ["1h", "4h"],
    marketAnalysisInterval: 60,
    marketCacheSize: 20,
    analyzeAllFavorites: false,
};

vi.mock("../stores/favorites.svelte", () => ({ favoritesState: favourites }));
vi.mock("../stores/settings.svelte", () => ({ settingsState: settings }));
vi.mock("../stores/indicator.svelte", () => ({
    indicatorState: { toJSON: () => ({ ema: { ema3: {} } }) },
}));
vi.mock("./toastService.svelte", () => ({ toastService: { error: vi.fn() } }));
vi.mock("../locales/i18n", () => ({ _: { subscribe: (f: (v: unknown) => void) => { f(() => ""); return () => {}; } } }));
vi.mock("./logger", () => ({
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import type { analysisState as AnalysisState } from "../stores/analysis.svelte";

const FAVOURITES = 4;
const TIMEFRAMES = 4; // 15m/1h/4h/1d after the required-timeframe union

/**
 * Each test gets a fresh module instance: marketAnalyst is a singleton whose
 * currentSymbolIndex and in-flight promises otherwise leak across tests and
 * mask exactly the looping behaviour under test.
 */
async function freshAnalyst() {
    vi.resetModules();
    fetchKlines.mockClear();
    // Import BOTH from the fresh registry: after resetModules the analyst gets
    // its own analysis-store instance, so a store imported at file scope would
    // be a different object and always look empty.
    const [{ marketAnalyst }, { analysisState }] = await Promise.all([
        import("./marketAnalyst"),
        import("../stores/analysis.svelte"),
    ]);
    return { analyst: marketAnalyst, analysisState: analysisState as typeof AnalysisState };
}

/** Advance fake time in slices so chained setTimeout+await actually progress. */
async function advance(ms: number, step = 250) {
    for (let elapsed = 0; elapsed < ms; elapsed += step) {
        await vi.advanceTimersByTimeAsync(step);
    }
}

describe("marketAnalyst scheduling (BUG-0230)", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        favourites.items = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "LINKUSDT"];
        settings.analyzeAllFavorites = false;
    });
    afterEach(() => vi.useRealTimers());

    it("visits every favourite and records a result for each", async () => {
        const { analyst, analysisState } = await freshAnalyst();
        analyst.start();
        await advance(30_000);
        analyst.stop();

        expect(Object.keys(analysisState.results).sort())
            .toEqual(["BTCUSDT", "ETHUSDT", "LINKUSDT", "SOLUSDT"]);

        // Every one is flagged partial -- the EMA 200 genuinely never arrived --
        // but a partial result is still a RESULT, not a licence to keep spinning.
        for (const sym of Object.keys(analysisState.results)) {
            expect(analysisState.results[sym].quality).toBe("partial");
            expect(analysisState.results[sym].trends?.["4h"]).toBe("unknown");
        }
    });

    it("settles instead of re-fetching every cycle when EMA 200 never converges", async () => {
        const { analyst } = await freshAnalyst();
        analyst.start();

        // Phase 1: initial fill. 4 favourites x 4 timeframes = 16 backfills.
        await advance(30_000);
        const initialFill = fetchKlines.mock.calls.length;

        // Phase 2: two quiet minutes. Under the quality-gated freshness check
        // this was a hot loop -- one full pass per 2s, ~60 passes, ~960 calls.
        // With age-gated freshness plus partial backoff (30s, then 60s, 120s...)
        // only a handful of symbols come due.
        fetchKlines.mockClear();
        await advance(120_000);
        const duringQuiet = fetchKlines.mock.calls.length;

        analyst.stop();

        // A 2s hot loop over 120s would be ~60 passes. Anything at or below one
        // pass per 30s is the backoff working.
        const passesDuringQuiet = duringQuiet / TIMEFRAMES;
        expect(initialFill).toBe(FAVOURITES * TIMEFRAMES);
        expect(passesDuringQuiet).toBeLessThanOrEqual(FAVOURITES * 2);
    });

    it("requests a backfill depth sufficient for EMA 200 warm-up", async () => {
        const { analyst } = await freshAnalyst();
        analyst.start();
        await advance(10_000);
        analyst.stop();

        expect(fetchKlines).toHaveBeenCalled();
        for (const call of fetchKlines.mock.calls) {
            const [, , limit] = call as unknown as [string, string, number];
            // 3x the EMA period. apiService pages past the venue's 200-row cap
            // to actually deliver this (BUG-0231); before that, asking for it
            // silently returned 200 and the indicator could not converge.
            expect(limit).toBeGreaterThanOrEqual(600);
        }
    });

    it("does not write history into the store the visible UI renders from", async () => {
        const { analyst } = await freshAnalyst();
        const { marketState } = await import("../stores/market.svelte");
        analyst.start();
        await advance(20_000);
        analyst.stop();

        expect(fetchKlines.mock.calls.length).toBeGreaterThan(0);

        // Routing the analyst through marketWatcher.ensureHistory() was tried
        // and reverted: sharing the store means sharing its reactivity, and a
        // sweep over every favourite x every timeframe then fires the effects
        // that every visible tile and the technicals panel recalculate from --
        // continuously, without the Market Overview window even being open.
        // Background work stays out of the foreground's store.
        expect(Object.keys(marketState.data)).toHaveLength(0);
    });

    it("analyses only the top 4 favourites while analyzeAllFavorites is off", async () => {
        favourites.items = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "LINKUSDT", "XRPUSDT", "ADAUSDT"];
        settings.analyzeAllFavorites = false;

        const { analyst, analysisState } = await freshAnalyst();
        analyst.start();
        await advance(40_000);
        analyst.stop();

        expect(Object.keys(analysisState.results)).toHaveLength(4);
        expect(analysisState.results.XRPUSDT).toBeUndefined();
    });

    it("analyses every favourite once analyzeAllFavorites is on", async () => {
        favourites.items = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "LINKUSDT", "XRPUSDT", "ADAUSDT"];
        settings.analyzeAllFavorites = true;

        const { analyst, analysisState } = await freshAnalyst();
        analyst.start();
        await advance(40_000);
        analyst.stop();

        // The Settings UI has always offered this toggle; nothing read it, so
        // symbols past the first few never received a score no matter what the
        // user configured (BUG-0232).
        expect(Object.keys(analysisState.results).sort()).toEqual([
            "ADAUSDT", "BTCUSDT", "ETHUSDT", "LINKUSDT", "SOLUSDT", "XRPUSDT",
        ]);
    });

    it("does not wait forever on symbols outside the analysis scope", async () => {
        // Six favourites, scope of four: `anyNeedsUpdate` must be measured
        // against the scope, or the scheduler stays pinned to its 2s fast path
        // waiting for work it will never do.
        favourites.items = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "LINKUSDT", "XRPUSDT", "ADAUSDT"];
        settings.analyzeAllFavorites = false;

        const { analyst } = await freshAnalyst();
        analyst.start();
        await advance(40_000);

        fetchKlines.mockClear();
        await advance(120_000);
        const duringQuiet = fetchKlines.mock.calls.length;
        analyst.stop();

        expect(duringQuiet / TIMEFRAMES).toBeLessThanOrEqual(FAVOURITES * 2);
    });
});
