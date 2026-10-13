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
import { defaultSettings } from "../../stores/settings/settingsTypes";

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
        expect(lessonParams(entry("rsi"), { rsi: { length: 21 } })).toEqual({ period: 21 });
    });

    it("names the parameters with the engine's own keys for a multi-parameter indicator", () => {
        expect(
            lessonParams(entry("macd"), { macd: { fastLength: 5, slowLength: 13, signalLength: 4 } }),
        ).toEqual({ fast_period: 5, slow_period: 13, signal_period: 4 });
    });

    it("reads the first moving average of a card that maps three", () => {
        expect(
            lessonParams(entry("ema"), {
                ema: { ema1: { length: 9 }, ema2: { length: 21 }, ema3: { length: 55 } },
            }),
        ).toEqual({ period: 9 });
    });

    it("falls back to the catalogue default per parameter the card cannot supply", () => {
        const rsi = entry("rsi");
        expect(lessonParams(rsi, { rsi: {} })).toEqual(defaultsOf(rsi));
        // Unreadable, not absent: the card is there but holds no usable number.
        expect(lessonParams(rsi, { rsi: { length: null } })).toEqual(defaultsOf(rsi));
    });

    it("returns no override at all when there is no card to read", () => {
        // The caller then computes on the catalogue defaults, which is the
        // pre-FEAT-0681 behaviour — not an error and not a half-filled ref.
        expect(lessonParams(entry("rsi"), {})).toEqual({});
        expect(lessonParams(entry("rsi"), { rsi: "not a card" })).toEqual({});
        expect(lessonParams({ ...entry("rsi"), id: "not-in-the-registry" }, {})).toEqual({});
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

    it("keeps every timeframe the default analysis setting offers selectable", () => {
        // Pins the relationship with the settings UI: a timeframe the analysis
        // setting offers but a lesson cannot draw is an empty selector for the
        // trader who selected only it.
        const offered = defaultSettings.analysisTimeframes;
        expect(offered.length).toBeGreaterThan(0);
        expect([...lessonTimeframeOptions(offered)].sort()).toEqual([...offered].sort());
    });
});
