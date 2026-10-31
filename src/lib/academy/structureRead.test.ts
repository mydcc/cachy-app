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
 * FEAT-0765 — the mc.pine structure read on hand-built candles.
 *
 * Each fixture is a deterministic path where the expected event is the point
 * of the exercise: the trend-start BOS, the confirmed inducement crossing
 * that arms the next BOS, the wick sweep, and the CHoCH that flips the trend.
 * Assertions name the bar index and the level, so a rule that fires one bar
 * late or against the wrong reference fails loudly.
 */

import { describe, expect, it } from "vitest";
import { computeStructureRead, fibLevels, type StructureBar } from "./structureRead";

/**
 * A close path with ±0.5 intrabar extremes and open = previous close.
 * `wicks` overrides the high of a bar (index → high), so a sweep can be a
 * wick and nothing else.
 */
function barsFromCloses(
    closes: readonly number[],
    wicks: Readonly<Record<number, number>> = {},
): StructureBar[] {
    return closes.map((close, i) => ({
        time: 1_700_000_000_000 + i * 3_600_000,
        open: i === 0 ? close : closes[i - 1],
        high: wicks[i] ?? close + 0.5,
        low: close - 0.5,
        close,
    }));
}

/*
 * One bull leg (BOS at 17), then a pullback whose first low at 24 is only a
 * sub-swing (3 bars) — a lower low at 28 becomes the structure bottom, so the
 * close at 28 under 105.5 arms the inducement without breaking the structure.
 * The rally through 112.5 at 32 is the inducement-gated BOS; the wick to 124
 * at 36 closing back under the running high is the sweep; the fall through
 * the last swing low at 43 flips the structure.
 */
const BULL_THEN_FLIP = [
    100, 101, 102, 103, 104, 105, 106, 105, 104, 103, 102, 101, // 0-11 first leg + pullback
    102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, // 12-22 second leg
    108, 106, 107, 108, 107, 105, 107, 110, 112, 114, // 23-32 sub-swing low, inducement, BOS
    116, 118, 117, 118, // 33-36 extension, wick at 36
    116, 114, 112, 110, 108, 106, 104, 102, 100, 98, // 37-46 fall
    96, 94, 92, 90, 88, 89, 90, 91, 92, // 47-55 bottom
    93, 94, 92, 91, 90, 89, // 56-61 bounce, sub-swing high at 57
];

describe("FEAT-0765 — the mc.pine structure read", () => {
    it("reads trend BOS, inducement-gated BOS, sweep and CHoCH in order", () => {
        const read = computeStructureRead(barsFromCloses(BULL_THEN_FLIP, { 36: 124 }));

        expect(read.events.map((event) => [event.index, event.kind, event.price])).toEqual([
            [17, "BOS-up", 106.5],
            [32, "BOS-up", 112.5],
            [36, "Sweep-up", 118.5],
            [43, "CHOCH-down", 104.5],
        ]);

        // The swings the ATR-amplitude filter keeps: the legs' extremes, the
        // lower low that became the structure bottom, and the swept wick top.
        expect(
            read.swings.map((swing) => [swing.index, swing.side, swing.price]),
        ).toEqual([
            [6, "high", 106.5],
            [11, "low", 100.5],
            [22, "high", 112.5],
            [28, "low", 104.5],
            [36, "high", 124],
            [51, "low", 87.5],
            [57, "high", 94.5],
        ]);
    });

    it("carries the post-flip range and inducement for the Fibonacci lesson", () => {
        const read = computeStructureRead(barsFromCloses(BULL_THEN_FLIP, { 36: 124 }));

        // After the flip the range runs from the bottom to the swept top.
        expect(read.range).toEqual({ low: 87.5, high: 124, direction: -1 });
        // Review follow-up: the inducement is re-derived after the flip, so
        // the line is the post-flip sub-swing high, not the pre-flip top.
        expect(read.inducement).toEqual({ index: 57, price: 94.5, side: "high" });

        const levels = fibLevels(read.range);
        expect(levels.map((level) => level.price)).toEqual([
            expect.closeTo(87.5 + 36.5 * 0.236, 8),
            expect.closeTo(87.5 + 36.5 * 0.382, 8),
            expect.closeTo(87.5 + 36.5 * 0.5, 8),
            expect.closeTo(87.5 + 36.5 * 0.618, 8),
            expect.closeTo(87.5 + 36.5 * 0.786, 8),
            expect.closeTo(87.5 + 36.5 * 0.886, 8),
        ]);
    });

    it("counts a wick one bar after the extreme as a sweep (review follow-up)", () => {
        // The extreme 118.5 sits at bar 34; the wick to 124 is at bar 35.
        const read = computeStructureRead(barsFromCloses(BULL_THEN_FLIP, { 35: 124 }));
        expect(read.events.map((event) => [event.index, event.kind])).toEqual([
            [17, "BOS-up"],
            [32, "BOS-up"],
            [35, "Sweep-up"],
            [43, "CHOCH-down"],
        ]);
    });

    it("breaks on the wick when breakOnClose is false (review follow-up)", () => {
        // Bar 16 closes at 106 (below the 106.5 high) but its wick reaches 107.5.
        const bars = barsFromCloses(BULL_THEN_FLIP, { 16: 107.5 });
        const closeBreak = computeStructureRead(bars);
        expect(closeBreak.events[0]).toMatchObject({ index: 17, kind: "BOS-up" });

        const wickBreak = computeStructureRead(bars, { breakOnClose: false });
        expect(wickBreak.events[0]).toMatchObject({ index: 16, kind: "BOS-up" });
    });

    it("keeps a flat, noisy path free of swings and events", () => {
        const closes = Array.from({ length: 40 }, (_, i) => 100 + (i % 2 === 0 ? 0.2 : -0.2));
        const read = computeStructureRead(barsFromCloses(closes));
        expect(read.swings).toEqual([]);
        expect(read.events).toEqual([]);
        expect(read.range).toBeNull();
    });

    it("measures Fibonacci levels down from the high in an uptrend", () => {
        const levels = fibLevels({ low: 100, high: 200, direction: 1 }, [0.5, 0.618]);
        expect(levels).toEqual([
            { price: 150, side: "resistance" },
            { price: expect.closeTo(200 - 100 * 0.618, 8), side: "resistance" },
        ]);
        expect(fibLevels(null)).toEqual([]);
    });
});
