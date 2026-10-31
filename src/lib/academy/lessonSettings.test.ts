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
 * FEAT-0681 — the parameters and the timeframes a lesson reads from the user's
 * own settings.
 *
 * The point of the module is that the lesson, the chart window and the alert
 * seed cannot disagree about the same indicator, so the tests here assert the
 * *mapping* (settings card key → engine parameter name) rather than any one
 * indicator's numbers, which the seed's own suite already owns.
 */

import { describe, it, expect } from "vitest";
import {
    isDrawableTimeframe,
    lessonKlines,
    LESSON_CANDLE_WINDOW,
    LESSON_HISTORY_TARGET,
    lessonParams,
    settingsCardFor,
} from "./lessonSettings";
import type { Kline } from "../../services/technicalsTypes";
import { INDICATOR_CATALOGUE, catalogueEntry, type CatalogueEntry } from "../alerts/indicatorCatalogue";
import { ANALYSIS_TIMEFRAMES, TIMEFRAME_QUICK_PICKS } from "../constants";
import { defaultSettings } from "../../stores/settings/settingsTypes";
import { shippedIndicatorDefaults } from "../../stores/indicator.svelte";

/**
 * A baseline that resolves to the catalogue defaults: it has no cards at all, so
 * `modified` compares against `param.default` in these tests.
 */
const CATALOGUE_BASELINE = {};

/** The settings a new install starts from, copied once and never mutated here. */
const SHIPPED = shippedIndicatorDefaults();

function entry(id: string): CatalogueEntry {
    const found = catalogueEntry(id);
    if (!found) throw new Error(`no catalogue entry for ${id}`);
    return found;
}

function defaultsOf(item: CatalogueEntry): Record<string, unknown> {
    return Object.fromEntries(item.params.map((param) => [param.name, param.default]));
}

describe("FEAT-0681 — lesson parameters come from the user's settings", () => {
    it("finds a settings card for every catalogue indicator", () => {
        // Non-vacuity: an empty catalogue would make the loop below assert
        // nothing at all.
        expect(INDICATOR_CATALOGUE.length).toBeGreaterThan(0);

        for (const item of INDICATOR_CATALOGUE) {
            expect(settingsCardFor(item.id), item.id).not.toBeNull();
        }
    });

    it("reads the parameter out of the user's own card", () => {
        const read = lessonParams(entry("rsi"), { rsi: { length: 21 } }, CATALOGUE_BASELINE);
        expect(read.values).toEqual({ period: 21 });
    });

    it("names the parameters with the engine's own keys for a multi-parameter indicator", () => {
        const read = lessonParams(
            entry("macd"),
            { macd: { fastLength: 5, slowLength: 13, signalLength: 4 } },
            CATALOGUE_BASELINE,
        );
        expect(read.values).toEqual({ fast_period: 5, slow_period: 13, signal_period: 4 });
    });

    it("reads the first moving average of a card that maps three", () => {
        const read = lessonParams(
            entry("ema"),
            { ema: { ema1: { length: 9 }, ema2: { length: 21 }, ema3: { length: 55 } } },
            CATALOGUE_BASELINE,
        );
        expect(read.values).toEqual({ period: 9 });
    });

    it("falls back to the catalogue default per parameter the card cannot supply", () => {
        const rsi = entry("rsi");
        expect(lessonParams(rsi, { rsi: {} }, CATALOGUE_BASELINE).values).toEqual(defaultsOf(rsi));
        // Unreadable, not absent: the card is there but holds no usable number.
        expect(lessonParams(rsi, { rsi: { length: null } }, CATALOGUE_BASELINE).values).toEqual(
            defaultsOf(rsi),
        );
    });

    it("returns no override at all when there is no card to read", () => {
        // The caller then computes on the catalogue defaults, which is the
        // pre-FEAT-0681 behaviour — not an error and not a half-filled ref.
        expect(lessonParams(entry("rsi"), {}, CATALOGUE_BASELINE).values).toEqual({});
        expect(lessonParams(entry("rsi"), { rsi: "not a card" }, CATALOGUE_BASELINE).values).toEqual(
            {},
        );
        expect(
            lessonParams({ ...entry("rsi"), id: "not-in-the-registry" }, {}, CATALOGUE_BASELINE).values,
        ).toEqual({});
    });

    it("produces only parameter names the entry declares", () => {
        /*
         * The engine reads only the names an entry declares, so a misspelled one
         * would be merged into the document, ignored, and reported nowhere — the
         * hazard `indicatorSettingsSeed.mappingLines` exists for. The seed is what
         * keeps this true; this is the regression net between it and the lesson.
         */
        const withParams = INDICATOR_CATALOGUE.filter((item) => item.params.length > 0);
        // Non-vacuity: with no parameterised indicator the loop would assert
        // nothing at all.
        expect(withParams.length).toBeGreaterThan(0);

        for (const item of INDICATOR_CATALOGUE) {
            const declared = new Set(item.params.map((param) => param.name));
            for (const name of Object.keys(lessonParams(item, SHIPPED, SHIPPED).values)) {
                expect(declared.has(name), `${item.id}.${name}`).toBe(true);
            }
        }
    });

    it("carries the price the card draws the indicator over", () => {
        // The chart window computes over the card's `source`; a lesson that
        // dropped it would draw RSI over the close while the trader's chart draws
        // RSI over `hl2` — the mismatch this feature exists to remove.
        expect(
            lessonParams(entry("rsi"), { rsi: { length: 14, source: "hl2" } }, CATALOGUE_BASELINE)
                .field,
        ).toBe("hl2");

        // A card on the indicator's own source carries none: the seed drops a
        // default field, and the engine reads `field ?? alertPathSourceOf(id)`.
        expect(
            lessonParams(entry("rsi"), { rsi: { length: 14, source: "close" } }, CATALOGUE_BASELINE)
                .field,
        ).toBeUndefined();

        // CCI's own source is the typical price, so the close is the departure
        // and the shipped card names none.
        expect(
            lessonParams(entry("cci"), { cci: { length: 20, source: "hlc3" } }, CATALOGUE_BASELINE)
                .field,
        ).toBeUndefined();
        expect(
            lessonParams(entry("cci"), { cci: { length: 20, source: "close" } }, CATALOGUE_BASELINE)
                .field,
        ).toBe("close");

        // No card at all: nothing is claimed, and the engine falls back.
        expect(lessonParams(entry("rsi"), {}, CATALOGUE_BASELINE).field).toBeUndefined();
    });
});

describe("FEAT-0681 — a parameter is the trader's only if they moved it", () => {
    it("reports nothing modified against the store the trader never touched", () => {
        // The Technicals store ships its own defaults: its first EMA length is
        // 21 where the catalogue's alert default is 20. Comparing the effective
        // value against the *catalogue* default would call that the trader's own
        // configuration, on a first visit, for `ema`/`sma`/`wma`/`hma`.
        const ema = lessonParams(entry("ema"), SHIPPED, SHIPPED);
        expect(ema.values).toEqual({ period: 21 });
        expect([...ema.modified]).toEqual([]);

        // Every indicator the tab renders, not only the one that happens to
        // differ.
        for (const item of INDICATOR_CATALOGUE) {
            const shipped = lessonParams(item, SHIPPED, SHIPPED);
            expect([...shipped.modified], item.id).toEqual([]);
        }
    });

    it("reports the parameter the trader moved away from the shipped value", () => {
        const changed = lessonParams(
            entry("ema"),
            { ema: { ema1: { length: 55 }, ema2: { length: 50 }, ema3: { length: 200 } } },
            SHIPPED,
        );
        expect(changed.values).toEqual({ period: 55 });
        expect([...changed.modified]).toEqual(["period"]);
    });

    it("reports only the parameters of a multi-parameter indicator the trader moved", () => {
        const changed = lessonParams(
            entry("macd"),
            { macd: { fastLength: 5, slowLength: 26, signalLength: 9 } },
            SHIPPED,
        );
        expect(changed.values).toEqual({ fast_period: 5, slow_period: 26, signal_period: 9 });
        expect([...changed.modified]).toEqual(["fast_period"]);
    });
});

describe("FEAT-0684 — a lesson's timeframe is validated at the boundary", () => {
    it("accepts the app's own notation, including timeframes the grid omits", () => {
        // The dropdown's quick picks are not the universe — its custom field
        // exists so a trader can name one outside the grid — so the check is the
        // app's notation, not a membership test.
        for (const value of ["5m", "15m", "30m", "1h", "4h", "1d", "1w", "1M", "3m", "12h", "240m"]) {
            expect(isDrawableTimeframe(value), value).toBe(true);
        }
    });

    it("refuses anything that is not a timeframe", () => {
        /*
         * A hand-edited or migrated store, or a typed entry: the lesson must not
         * subscribe to a channel no candle will arrive on. `1H` is refused
         * because the app's own notation reserves the capital for months, and a
         * zero count is refused because a zero-length candle is not a timeframe
         * — the app's own parser says so, and the first version of this guard
         * accepted `0m` and persisted it.
         */
        for (const value of [
            "",
            "1",
            "h",
            "1x",
            "1H",
            "1 h",
            "-1h",
            "1hh",
            "1d ",
            "abc",
            "0",
            "0m",
            "0h",
            "0d",
            "0w",
            "00h",
        ]) {
            expect(isDrawableTimeframe(value), value).toBe(false);
        }
    });

    it("offers the panel's six quick picks, covering everything the setting can hold", () => {
        // The grid is fixed at six so it reads as two rows of three. `30m` is
        // the one pick the analysis setting does not offer, and dropping any of
        // them would change what the chip shows without another test noticing.
        expect([...TIMEFRAME_QUICK_PICKS]).toEqual(["5m", "15m", "30m", "1h", "4h", "1d"]);

        /*
         * The setting's own list must stay inside the grid, or a trader who
         * analyses everything the setting allows would have a button for each of
         * them — and a timeframe the setting offers but the grid hides would
         * force a typed entry every visit.
         */
        const picks = new Set<string>(TIMEFRAME_QUICK_PICKS);
        for (const timeframe of [
            ...ANALYSIS_TIMEFRAMES,
            ...defaultSettings.analysisTimeframes,
        ]) {
            expect(picks.has(timeframe), timeframe).toBe(true);
        }
    });
});

describe("FEAT-0763 — the lesson candle window", () => {
    function klines(count: number): Kline[] {
        return Array.from({ length: count }, (_, i) => ({
            time: 1_700_000_000_000 + i * 3_600_000,
        })) as unknown as Kline[];
    }

    it("draws and warms the same depth", () => {
        expect(LESSON_CANDLE_WINDOW).toBe(600);
        expect(LESSON_HISTORY_TARGET).toBe(LESSON_CANDLE_WINDOW);
    });

    it("returns the newest window, oldest first", () => {
        const rows = klines(700);
        const window = lessonKlines(rows);
        expect(window).toHaveLength(600);
        expect(window[0].time).toBe(rows[100].time);
        expect(window[599].time).toBe(rows[699].time);
    });

    it("drops non-finite and out-of-order candles before the chart sees them", () => {
        const rows = klines(10);
        rows[3] = { time: Number.NaN } as unknown as Kline;
        rows[4] = { time: 0 } as unknown as Kline;
        rows[5] = { ...rows[2] } as Kline; // duplicate timestamp: not ascending
        const window = lessonKlines(rows, 10);
        expect(window.map((kline) => kline.time)).toEqual([
            rows[0].time,
            rows[1].time,
            rows[2].time,
            rows[6].time,
            rows[7].time,
            rows[8].time,
            rows[9].time,
        ]);
    });

    it("handles missing history without inventing any", () => {
        expect(lessonKlines(undefined)).toEqual([]);
        expect(lessonKlines([])).toEqual([]);
    });
});
