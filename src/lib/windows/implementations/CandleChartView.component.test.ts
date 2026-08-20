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
 * BUG-0248 regression tests — CandleChartView live-tick reactivity.
 *
 * The chart freeze had two documented root causes, both fixed but never
 * covered by the acceptance-criterion regression test:
 *
 * 1. Svelte 5 reactivity gap (PR #2096): the data `$effect` only read
 *    `marketState.data[symbol]?.klines?.[timeframe]`. `klineBuffers.ts`
 *    updates the forming candle in place (`existingHistory[lastIdx] = …`),
 *    so the array reference never changed and the effect never re-ran — the
 *    fast path (`candleSeries.update()`) never fired on live WebSocket
 *    flushes. The fix references `marketData?.lastUpdated` in the effect.
 * 2. Polling skip (PR #2100): per-timeframe `klinesLastUpdated` staleness.
 *
 * These tests mount the real component against a real Svelte 5 `$state` store
 * proxy (marketState.helper.svelte.ts) and prove the acceptance criteria:
 * in-place updates to `marketState.data[symbol].klines` trigger the fast-path
 * `candleSeries.update()` on every flush, without rebuilding the full series.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import { Decimal } from "decimal.js";
import type { MarketData } from "../../../stores/market/types";

// Reactive store proxy (rune-compiled in .svelte.ts) standing in for the real
// marketState — it exposes the read-only surface the component uses.
vi.mock("../../../stores/market.svelte", async () => {
    const { marketState } = await import("./marketState.helper.svelte.ts");
    return { marketState };
});
import { marketState } from "./marketState.helper.svelte.ts";

// lightweight-charts needs a canvas the happy-dom test env lacks; the series
// mocks double as the spy surface the regression asserts on.
const chart = vi.hoisted(() => {
    const candleSeries = {
        update: vi.fn(),
        setData: vi.fn(),
        applyOptions: vi.fn(),
    };
    return {
        candleSeries,
        chart: {
            addSeries: vi.fn(() => candleSeries),
            applyOptions: vi.fn(),
            remove: vi.fn(),
            timeScale: vi.fn(() => ({
                subscribeVisibleLogicalRangeChange: vi.fn(),
                unsubscribeVisibleLogicalRangeChange: vi.fn(),
                getVisibleLogicalRange: vi.fn(() => null),
            })),
        },
    };
});
vi.mock("lightweight-charts", () => ({
    createChart: vi.fn(() => chart.chart),
    ColorType: { Solid: 0 },
    CandlestickSeries: Symbol("candlestick"),
    LineSeries: Symbol("line"),
}));

vi.mock("../../../services/marketWatcher", () => ({
    marketWatcher: { register: vi.fn(), unregister: vi.fn() },
}));

vi.mock("../../../stores/indicator.svelte", () => ({
    indicatorState: {
        ema: {
            enabled: true,
            ema1: { length: 9 },
            ema2: { length: 21 },
            ema3: { length: 50 },
        },
    },
}));

vi.mock("../../../utils/indicators", () => ({
    JSIndicators: { ema: vi.fn((closes: number[]) => closes.map((c) => c)) },
}));

import CandleChartView from "./CandleChartView.svelte";
import { JSIndicators } from "../../../utils/indicators";

let host: HTMLElement;
let component: Record<string, unknown> | null = null;
const fakeWindow = { showRightScale: true, currentPrice: undefined as string | undefined };

function makeKlines(times: number[], base = 60000) {
    return times.map((t) => ({
        time: t,
        open: new Decimal(base),
        high: new Decimal(base + 100),
        low: new Decimal(base - 100),
        close: new Decimal(base + 50),
        volume: new Decimal("1000"),
    }));
}

const CANDLE_TIMES = [1700000000000, 1700000060000, 1700000120000];

function seedHistory(symbol = "BTCUSDT") {
    const data: MarketData = {
        symbol,
        lastPrice: null,
        indexPrice: null,
        markPrice: null,
        fundingRate: null,
        nextFundingTime: null,
        klines: { "1m": makeKlines(CANDLE_TIMES) },
        klinesBuffers: new Map(),
        lastUpdated: Date.now(),
    };
    marketState.data[symbol] = data;
}

async function settle(rounds = 4) {
    for (let i = 0; i < rounds; i++) {
        flushSync();
        await Promise.resolve();
    }
    flushSync();
}

beforeEach(() => {
    vi.clearAllMocks();
    marketState.data = {};
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component);
    component = null;
    host.remove();
});

describe("BUG-0248 — CandleChartView live tick reactivity (fast path)", () => {
    it("renders the initial history via the slow path (full series)", async () => {
        component = mount(CandleChartView, {
            target: host,
            props: { symbol: "BTCUSDT", timeframe: "1m", window: fakeWindow },
        }) as never;
        await settle();
        seedHistory();
        await settle();

        expect(chart.candleSeries.setData).toHaveBeenCalled();
    });

    it("triggers candleSeries.update() on in-place updates to the forming candle", async () => {
        component = mount(CandleChartView, {
            target: host,
            props: { symbol: "BTCUSDT", timeframe: "1m", window: fakeWindow },
        }) as never;
        await settle();
        seedHistory();
        await settle();
        vi.clearAllMocks();

        // klineBuffers.applySymbolKlines() in-place path: the last element is
        // replaced, the array reference is unchanged, and lastUpdated bumps.
        const arr = marketState.data["BTCUSDT"].klines["1m"];
        arr[arr.length - 1] = {
            ...arr[arr.length - 1],
            close: new Decimal("66000"),
            high: new Decimal("66200"),
        };
        marketState.data["BTCUSDT"].lastUpdated = Date.now();
        await settle();

        expect(chart.candleSeries.update).toHaveBeenCalledTimes(1);
        expect(chart.candleSeries.update).toHaveBeenCalledWith(
            expect.objectContaining({ close: 66000, high: 66200 }),
        );
        // Fast path must not rebuild the whole series
        expect(chart.candleSeries.setData).not.toHaveBeenCalled();
    });

    it("re-triggers the effect when only lastUpdated changes (array reference stays the same)", async () => {
        component = mount(CandleChartView, {
            target: host,
            props: { symbol: "BTCUSDT", timeframe: "1m", window: fakeWindow },
        }) as never;
        await settle();
        seedHistory();
        await settle();
        vi.clearAllMocks();

        // `seedHistory` also used Date.now(); on fast runners both land in the
        // same millisecond, so the value would not change and the effect could
        // not re-run. Bump by one instead of re-reading the clock.
        const stored = marketState.data["BTCUSDT"];
        stored.lastUpdated = stored.lastUpdated + 1;
        await settle();

        expect(chart.candleSeries.update).toHaveBeenCalledTimes(1);
        expect(chart.candleSeries.setData).not.toHaveBeenCalled();
    });

    it("still full-renders when a new candle extends the history", async () => {
        component = mount(CandleChartView, {
            target: host,
            props: { symbol: "BTCUSDT", timeframe: "1m", window: fakeWindow },
        }) as never;
        await settle();
        seedHistory();
        await settle();
        vi.clearAllMocks();

        // New candle -> array grows through the store proxy, lastUpdated bumps.
        const data = marketState.data["BTCUSDT"];
        const arr = data.klines["1m"];
        const last = arr[arr.length - 1];
        arr.push({
            time: last.time + 60000,
            open: last.close,
            high: last.close.plus(100),
            low: last.close.minus(100),
            close: last.close.plus(50),
            volume: new Decimal("1000"),
        });
        data.lastUpdated = Date.now();
        await settle();

        expect(chart.candleSeries.setData).toHaveBeenCalledTimes(1);
    });

    it("keeps live updates flowing when the slow-path indicator step throws", async () => {
        vi.mocked(JSIndicators.ema).mockImplementation((_closes: number[]) => {
            throw new Error("simulated indicator failure");
        });

        component = mount(CandleChartView, {
            target: host,
            props: { symbol: "BTCUSDT", timeframe: "1m", window: fakeWindow },
        }) as never;
        await settle();
        seedHistory();
        await settle();

        // Slow path: setData succeeded, so the fast path is armed even though
        // the indicator step threw.
        expect(chart.candleSeries.setData).toHaveBeenCalled();
        vi.clearAllMocks();

        const arr = marketState.data["BTCUSDT"].klines["1m"];
        arr[arr.length - 1] = {
            ...arr[arr.length - 1],
            close: new Decimal("70000"),
        };
        marketState.data["BTCUSDT"].lastUpdated = Date.now();
        await settle();

        expect(chart.candleSeries.update).toHaveBeenCalledWith(
            expect.objectContaining({ close: 70000 }),
        );
        expect(chart.candleSeries.setData).not.toHaveBeenCalled();
    });
});