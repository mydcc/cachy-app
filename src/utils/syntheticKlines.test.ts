// @vitest-environment happy-dom
/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
    aggregateIntoSyntheticBucket,
    resetSyntheticCandles,
} from "./syntheticKlines";

// 12:00:00 UTC in epoch ms — a clean 3m/5m bucket boundary.
const T0 = Date.UTC(2026, 7, 21, 12, 0, 0);

function candle(time: number, o: number, h: number, l: number, c: number, v: number = 1) {
    return { time, open: o, high: h, low: l, close: c, volume: v };
}

describe("aggregateIntoSyntheticBucket", () => {
    beforeEach(() => {
        resetSyntheticCandles();
    });

    it("floor-aligns the base candle time to the target timeframe boundary", () => {
        // 1m push at 12:01:30 lands in the 12:00 3m bucket.
        const merged = aggregateIntoSyntheticBucket("BTCUSDT", "3m", candle(T0 + 90_000, 100, 101, 99, 100.5));
        expect(merged).not.toBeNull();
        expect(merged!.time).toBe(T0);
        expect(merged!.open).toBe(100);
    });

    it("merges pushes within the same bucket: max high, min low, latest close, summed volume", () => {
        aggregateIntoSyntheticBucket("BTCUSDT", "3m", candle(T0, 100, 102, 99, 101, "2"));
        const merged = aggregateIntoSyntheticBucket("BTCUSDT", "3m", candle(T0 + 60_000, 101, 105, 98, 103, "3"));

        expect(merged!.time).toBe(T0);
        expect(merged!.open).toBe(100);
        expect(merged!.high).toBe(105);
        expect(merged!.low).toBe(98);
        expect(merged!.close).toBe(103);
        expect(Number(merged!.volume)).toBe(5);
    });

    it("starts a fresh candle when the push crosses the bucket boundary", () => {
        aggregateIntoSyntheticBucket("BTCUSDT", "3m", candle(T0, 100, 102, 99, 101));
        const next = aggregateIntoSyntheticBucket("BTCUSDT", "3m", candle(T0 + 180_000, 110, 112, 109, 111));

        expect(next!.time).toBe(T0 + 180_000);
        expect(next!.open).toBe(110); // open comes from the incoming candle, not the old one
        expect(next!.high).toBe(112);
        expect(next!.low).toBe(109);
    });

    it("keeps buckets of different symbols and timeframes separate", () => {
        const a = aggregateIntoSyntheticBucket("BTCUSDT", "3m", candle(T0, 100, 101, 99, 100));
        const b = aggregateIntoSyntheticBucket("ETHUSDT", "3m", candle(T0, 2000, 2001, 1999, 2000));
        const c = aggregateIntoSyntheticBucket("BTCUSDT", "9m", candle(T0, 300, 301, 299, 300));

        expect(a!.open).toBe(100);
        expect(b!.open).toBe(2000);
        expect(c!.open).toBe(300);
    });

    it("returns null for an unparseable timeframe", () => {
        expect(aggregateIntoSyntheticBucket("BTCUSDT", "", candle(T0, 1, 2, 0.5, 1.5))).toBeNull();
    });
});
