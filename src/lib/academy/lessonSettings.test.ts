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
    LESSON_TIMEFRAME_FALLBACK,
    lessonParams,
    lessonTimeframeOptions,
    settingsCardFor,
} from "./lessonSettings";
import { INDICATOR_CATALOGUE, catalogueEntry, type CatalogueEntry } from "../alerts/indicatorCatalogue";
import { ANALYSIS_TIMEFRAMES } from "../constants";
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

describe("FEAT-0681 — lesson timeframes come from the user's settings", () => {
    it("keeps only the offered timeframes a lesson can draw, in a stable order", () => {
        expect(lessonTimeframeOptions(["4h", "1h"])).toEqual(["1h", "4h"]);
        expect(lessonTimeframeOptions(["1h", "1M"])).toEqual(["1h"]);
    });

    it("falls back to one option rather than rendering an empty selector", () => {
        expect(lessonTimeframeOptions([])).toEqual([LESSON_TIMEFRAME_FALLBACK]);
        expect(lessonTimeframeOptions(["nonsense"])).toEqual([LESSON_TIMEFRAME_FALLBACK]);
    });

    it("survives a stored value that is not a list at all", () => {
        // A hand-edited or migrated persistence blob. `.includes` on this would
        // throw during render and take the whole tab down with it.
        expect(lessonTimeframeOptions(5 as unknown as readonly string[])).toEqual([
            LESSON_TIMEFRAME_FALLBACK,
        ]);
    });

    it("keeps every timeframe the setting itself offers selectable", () => {
        // One list, shared with the settings UI: the setting can only hold a
        // member of it, so refusing any of them would leave a trader who picked
        // only that one with an empty selector.
        expect([...lessonTimeframeOptions(ANALYSIS_TIMEFRAMES)]).toEqual([...ANALYSIS_TIMEFRAMES]);
    });

    it("keeps the shipped analysis setting selectable", () => {
        const offered = defaultSettings.analysisTimeframes;
        expect(offered.length).toBeGreaterThan(0);
        expect([...lessonTimeframeOptions(offered)].sort()).toEqual([...offered].sort());
    });
});
