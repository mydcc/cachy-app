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
 * FEAT-0686 — computed structure readings: fractal swings, break events and
 * nearest levels over synthetic candles. Names describe behaviour, and every
 * case pins a boundary the cockpit depends on: ties mark nothing, empty input
 * breaks nothing, equal closes hold their level.
 */

import { describe, expect, it } from "vitest";

import {
    detectBreaks,
    findSwings,
    higherTimeframe,
    recentLevels,
    type PriceBar,
} from "./structureSignals";

function bar(high: number, low: number, close: number): PriceBar {
    return { high, low, close };
}

describe("higherTimeframe", () => {
    it("steps roughly four times up the quick-pick ladder", () => {
        expect(higherTimeframe("5m")).toBe("30m");
        expect(higherTimeframe("15m")).toBe("1h");
        expect(higherTimeframe("1h")).toBe("4h");
        expect(higherTimeframe("4h")).toBe("1d");
    });

    it("returns the input at the top of the ladder or off it", () => {
        expect(higherTimeframe("1d")).toBe("1d");
        expect(higherTimeframe("nonsense")).toBe("nonsense");
    });
});

describe("findSwings", () => {
    const bars = [
        bar(10, 9, 9.5),
        bar(12, 10, 11),
        bar(11, 8.5, 10),
        bar(13, 11, 12.5),
        bar(12, 10.5, 11),
    ];

    it("marks strict fractal highs and lows", () => {
        expect(findSwings(bars, 1)).toEqual([
            { index: 1, price: 12, side: "high" },
            { index: 2, price: 8.5, side: "low" },
            { index: 3, price: 13, side: "high" },
        ]);
    });

    it("marks nothing on ties, short input or empty input", () => {
        const tied = [bar(10, 9, 9.5), bar(10, 9, 9.5), bar(10, 9, 9.5)];
        expect(findSwings(tied, 1)).toEqual([]);
        expect(findSwings(bars.slice(0, 2), 1)).toEqual([]);
        expect(findSwings([], 2)).toEqual([]);
    });
});

describe("detectBreaks", () => {
    const bars = [
        bar(10, 9, 9.5),
        bar(12, 10, 11),
        bar(11, 8.5, 10),
        bar(13, 11, 12.5),
        bar(12, 10.5, 11),
    ];
    const swings = findSwings(bars, 1);

    it("names the trend with the first break, then tracks BOS and CHOCH", () => {
        const closes = [9.5, 11, 10, 12.5, 11, 8, 7.5];
        expect(detectBreaks(closes, swings)).toEqual([
            { index: 3, price: 12.5, kind: "BOS-up" },
            { index: 5, price: 8, kind: "CHOCH-down" },
            { index: 6, price: 7.5, kind: "BOS-down" },
        ]);
    });

    it("holds the level on an equal close and breaks nothing without swings", () => {
        const closes = [9.5, 11, 10, 12.5, 11, 8, 8.5];
        expect(detectBreaks(closes, swings).map((event) => event.index)).toEqual([3, 5]);
        expect(detectBreaks([9.5, 11, 10], [])).toEqual([]);
    });
});

describe("recentLevels", () => {
    const swings = [
        { index: 1, price: 12, side: "high" as const },
        { index: 2, price: 8.5, side: "low" as const },
        { index: 3, price: 13, side: "high" as const },
    ];

    it("returns resistance above and support below, nearest first", () => {
        expect(recentLevels(swings, 11)).toEqual([
            { price: 12, side: "resistance" },
            { price: 13, side: "resistance" },
            { price: 8.5, side: "support" },
        ]);
    });

    it("caps each side at the requested count", () => {
        expect(recentLevels(swings, 11, 1)).toEqual([
            { price: 12, side: "resistance" },
            { price: 8.5, side: "support" },
        ]);
    });
});
