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

/*
 * BUG-0576 — the chart offers timeframes Bitget does not serve. The server
 * refuses any interval outside Bitget's native set, so the client must fetch
 * the base granularity it divides and rebuild the requested one. These cases
 * pin the wiring (base interval + multiplied limit) and the aggregation.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./requestManager", () => ({
    requestManager: {
        schedule: (_key: string, fn: (signal: AbortSignal) => Promise<unknown>) =>
            fn(new AbortController().signal),
    },
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import { fetchBitgetKlines } from "./marketData";

// 12:00:00 UTC — a clean 6m boundary.
const T = Date.UTC(2026, 7, 21, 12, 0, 0);

interface Row {
    timestamp: number;
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
}

function klineResponse(rows: Row[]) {
    return {
        ok: true,
        status: 200,
        headers: {
            get: (name: string) => (name === "content-type" ? "application/json" : null),
        },
        text: async () => JSON.stringify(rows),
    };
}

function row(t: number, o: string, h: string, l: string, c: string, v: string): Row {
    return { timestamp: t, open: o, high: h, low: l, close: c, volume: v };
}

describe("Bitget klines aggregate non-native timeframes (BUG-0576)", () => {
    beforeEach(() => {
        fetchMock.mockReset();
    });

    it("fetches 3m as the base for 6m and collapses it into 6m buckets", async () => {
        fetchMock.mockResolvedValue(klineResponse([
            row(T, "100", "102", "99", "101", "2"),
            row(T + 180_000, "101", "105", "98", "103", "3"),
            row(T + 360_000, "103", "104", "102", "104", "1"),
        ]));

        const candles = await fetchBitgetKlines("BTCUSDT", "6m", 15);

        const url = fetchMock.mock.calls[0][0] as string;
        expect(url).toContain("interval=3m");
        expect(url).toContain("limit=30");

        // The 12:00 and 12:03 base candles collapse into the 12:00 6m bucket;
        // 12:06 stays its own bucket.
        expect(candles).toHaveLength(2);
        expect(candles[0].time).toBe(T);
        expect(candles[0].open.toString()).toBe("100");
        expect(candles[0].high.toString()).toBe("105");
        expect(candles[0].low.toString()).toBe("98");
        expect(candles[0].close.toString()).toBe("103");
        expect(candles[0].volume.toString()).toBe("5");
        expect(candles[1].time).toBe(T + 360_000);
        expect(candles[1].open.toString()).toBe("103");
    });

    it("passes a native timeframe through unchanged", async () => {
        fetchMock.mockResolvedValue(klineResponse([
            row(T, "100", "101", "99", "100", "1"),
        ]));

        const candles = await fetchBitgetKlines("BTCUSDT", "3m", 15);

        const url = fetchMock.mock.calls[0][0] as string;
        expect(url).toContain("interval=3m");
        expect(url).toContain("limit=15");
        expect(candles).toHaveLength(1);
        expect(candles[0].open.toString()).toBe("100");
    });
});
