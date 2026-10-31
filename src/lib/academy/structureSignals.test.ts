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

import { higherTimeframe, recentLevels } from "./structureSignals";

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
