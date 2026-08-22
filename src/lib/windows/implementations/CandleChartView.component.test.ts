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
    // Price === Y for createPriceLine/priceToCoordinate/coordinateToPrice —
    // same trivial 1:1 scale as priceLineManager.test.ts's fake series, so
    // FEAT-0247 drag tests can pick coordinates without a real chart.
    const priceLines = new Map<object, { price: number; title: string }>();
    const candleSeries = {
        update: vi.fn(),
        setData: vi.fn(),
        applyOptions: vi.fn(),
        createPriceLine: vi.fn((options: { price: number; title: string }) => {
            const state = { price: options.price, title: options.title };
            const handle = {
                applyOptions: (next: { price?: number; title?: string }) => {
                    if (next.price !== undefined) state.price = next.price;
                    if (next.title !== undefined) state.title = next.title;
                },
                options: () => ({ ...state }),
            };
            priceLines.set(handle, state);
            return handle;
        }),
        removePriceLine: vi.fn((line: object) => {
            priceLines.delete(line);
        }),
        priceToCoordinate: vi.fn((price: number) => price),
        coordinateToPrice: vi.fn((coordinate: number) => coordinate),
    };
    return {
        candleSeries,
        priceLines,
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

// FEAT-0247 position hydration: PositionsSidebar.svelte is the only other
// place that populates accountState.positions via REST — a chart window
// opened standalone (sidebar not mounted) needs its own fetch or the price
// lines never appear even for a real open position. appFetch is spied on
// directly so the hydration test can assert against it without a real
// network call.
const appFetchMock = vi.hoisted(() => vi.fn());
vi.mock("../../appAuth", () => ({
    appFetch: appFetchMock,
}));

// FEAT-0247 drag-to-modify: the exchange adapter and toast surface are
// spied on directly so the drop tests can assert against them without a
// real network call.
const modifyTpSlOrder = vi.hoisted(() => vi.fn().mockResolvedValue({}));
const activeExchangeMock = vi.hoisted(() =>
    vi.fn(() => ({
        supports: { tpSl: true },
        trading: { modifyTpSlOrder },
    })),
);
vi.mock("../../../services/exchange", () => ({
    activeExchange: activeExchangeMock,
}));
vi.mock("../../../services/toastService.svelte", () => ({
    toastService: { success: vi.fn(), error: vi.fn(), add: vi.fn() },
}));

import CandleChartView from "./CandleChartView.svelte";
import { JSIndicators } from "../../../utils/indicators";
import { toastService } from "../../../services/toastService.svelte";
import { accountState } from "../../../stores/account.svelte";
import { tpSlState } from "../../../stores/tpsl.svelte";
import { settingsState } from "../../../stores/settings.svelte";

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
    chart.priceLines.clear();
    accountState.positions = [];
    tpSlState.reset();
    settingsState.apiKeys = { ...settingsState.apiKeys, bitunix: { key: "", secret: "" } };
    appFetchMock.mockReset();
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component);
    component = null;
    host.remove();
    accountState.positions = [];
    tpSlState.reset();
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

/*
 * FEAT-0247 — dragging a TP/SL price line submits a modification.
 *
 * Exercises the actual wiring in CandleChartView (not just PriceLineManager
 * in isolation, see priceLineManager.test.ts): the component creates a
 * PriceLineManager against the real candleSeries, feeds it the position/TP/SL
 * plans from accountState/tpSlState, and on drop calls
 * `activeExchange().trading.modifyTpSlOrder` — the gated (FEAT-0011) path
 * reached through the exchange adapter (FEAT-0016), not tradeService
 * directly.
 */
describe("FEAT-0247 — dragging a chart TP/SL line", () => {
    function seedPositionAndPlans() {
        accountState.positions = [
            {
                positionId: "p-1",
                symbol: "BTCUSDT",
                side: "long",
                size: new Decimal(1),
                entryPrice: new Decimal(100),
                leverage: new Decimal(10),
                unrealizedPnl: new Decimal(0),
                margin: new Decimal(10),
                marginMode: "ISOLATED",
                liquidationPrice: new Decimal(80),
                markPrice: new Decimal(100),
                breakEvenPrice: new Decimal(100),
                marginRate: new Decimal(0),
                realizedPnl: new Decimal(0),
            },
        ] as never;

        vi.spyOn(tpSlState, "plansFor").mockReturnValue({
            profit: { orderId: "tp-1", symbol: "BTCUSDT", planType: "PROFIT", triggerPrice: "120", status: "NEW" } as never,
            loss: { orderId: "sl-1", symbol: "BTCUSDT", planType: "LOSS", triggerPrice: "90", status: "NEW" } as never,
        });
        vi.spyOn(tpSlState, "ensureFresh").mockResolvedValue(undefined);
        vi.spyOn(tpSlState, "invalidate").mockImplementation(() => {});
    }

    function dragSlLineTo(container: HTMLElement, fromY: number, toY: number) {
        container.dispatchEvent(new MouseEvent("mousedown", { clientY: fromY, bubbles: true }));
        container.dispatchEvent(new MouseEvent("mousemove", { clientY: toY, bubbles: true }));
        window.dispatchEvent(new MouseEvent("mouseup"));
    }

    it("renders Entry/Liquidation/TP/SL lines for the position", async () => {
        seedPositionAndPlans();
        component = mount(CandleChartView, {
            target: host,
            props: { symbol: "BTCUSDT", timeframe: "1m", window: fakeWindow },
        }) as never;
        await settle();

        const prices = [...chart.priceLines.values()].map((l) => l.price).sort((a, b) => a - b);
        expect(prices).toEqual([80, 90, 100, 120]);
    });

    it("submits modifyTpSlOrder through the exchange adapter on drop", async () => {
        seedPositionAndPlans();
        component = mount(CandleChartView, {
            target: host,
            props: { symbol: "BTCUSDT", timeframe: "1m", window: fakeWindow },
        }) as never;
        await settle();

        const container = host.querySelector(".chart-container") as HTMLElement;
        vi.spyOn(container, "getBoundingClientRect").mockReturnValue({
            top: 0, left: 0, bottom: 300, right: 300, width: 300, height: 300, x: 0, y: 0,
            toJSON: () => ({}),
        } as DOMRect);

        // SL line sits at price/coordinate 90 (tick size defaults to 0.01
        // here — no symbolMeta in this test's marketState mock).
        dragSlLineTo(container, 90, 95);
        await settle();

        expect(modifyTpSlOrder).toHaveBeenCalledWith(
            expect.objectContaining({
                orderId: "sl-1",
                symbol: "BTCUSDT",
                planType: "LOSS",
                triggerPrice: "95",
            }),
        );
        expect(toastService.success).toHaveBeenCalled();
        expect(tpSlState.invalidate).toHaveBeenCalled();
    });

    it("shows an error toast and still invalidates the cache when the modification is refused", async () => {
        modifyTpSlOrder.mockRejectedValueOnce(new Error("refused"));
        seedPositionAndPlans();
        component = mount(CandleChartView, {
            target: host,
            props: { symbol: "BTCUSDT", timeframe: "1m", window: fakeWindow },
        }) as never;
        await settle();

        const container = host.querySelector(".chart-container") as HTMLElement;
        vi.spyOn(container, "getBoundingClientRect").mockReturnValue({
            top: 0, left: 0, bottom: 300, right: 300, width: 300, height: 300, x: 0, y: 0,
            toJSON: () => ({}),
        } as DOMRect);

        dragSlLineTo(container, 90, 95);
        await settle();

        expect(toastService.error).toHaveBeenCalled();
        expect(tpSlState.invalidate).toHaveBeenCalled();
    });

    it("does not offer a drag when the exchange doesn't support TP/SL edits", async () => {
        modifyTpSlOrder.mockClear();
        seedPositionAndPlans();
        activeExchangeMock.mockReturnValueOnce({
            supports: { tpSl: false },
            trading: { modifyTpSlOrder },
        } as never);

        component = mount(CandleChartView, {
            target: host,
            props: { symbol: "BTCUSDT", timeframe: "1m", window: fakeWindow },
        }) as never;
        await settle();

        const container = host.querySelector(".chart-container") as HTMLElement;
        vi.spyOn(container, "getBoundingClientRect").mockReturnValue({
            top: 0, left: 0, bottom: 300, right: 300, width: 300, height: 300, x: 0, y: 0,
            toJSON: () => ({}),
        } as DOMRect);

        dragSlLineTo(container, 90, 95);
        await settle();

        expect(modifyTpSlOrder).not.toHaveBeenCalled();
    });
});

/*
 * FEAT-0247 — a chart window opened without PositionsSidebar mounted must
 * still see an already-open position.
 *
 * accountState.positions is otherwise only REST-hydrated from
 * PositionsSidebar.svelte's onMount (fetchPositions() ->
 * accountState.hydratePositions()) — see BUG-0249's root cause #2. A trader
 * who opens just the chart window, with an already-open real position and
 * no sidebar mounted, would see accountState.positions stay empty forever
 * and no price lines would ever render, even though nothing was wrong with
 * PriceLineManager or the symbol match.
 */
describe("FEAT-0247 — chart-only position hydration", () => {
    it("hydrates accountState.positions on mount when it is empty and API keys are configured", async () => {
        settingsState.apiKeys = { ...settingsState.apiKeys, bitunix: { key: "k", secret: "s" } };
        appFetchMock.mockResolvedValue({
            json: () =>
                Promise.resolve({
                    success: true,
                    data: {
                        positions: [
                            {
                                symbol: "BTCUSDT",
                                side: "long",
                                size: "1",
                                entryPrice: "100",
                                leverage: "10",
                                unrealizedPnl: "0",
                                margin: "10",
                                marginMode: "isolated",
                                liquidationPrice: "80",
                                markPrice: "100",
                                breakEvenPrice: "100",
                                marginRate: "0",
                                realizedPnl: "0",
                            },
                        ],
                    },
                }),
        });

        component = mount(CandleChartView, {
            target: host,
            props: { symbol: "BTCUSDT", timeframe: "1m", window: fakeWindow },
        }) as never;
        await settle();

        expect(appFetchMock).toHaveBeenCalledWith(
            "/api/positions",
            expect.objectContaining({ method: "POST" }),
        );
        expect(accountState.positions.some((p) => p.symbol === "BTCUSDT")).toBe(true);
    });

    it("does not fetch when accountState.positions is already populated", async () => {
        settingsState.apiKeys = { ...settingsState.apiKeys, bitunix: { key: "k", secret: "s" } };
        accountState.positions = [
            {
                positionId: "p-1",
                symbol: "BTCUSDT",
                side: "long",
                size: new Decimal(1),
                entryPrice: new Decimal(100),
                leverage: new Decimal(10),
                unrealizedPnl: new Decimal(0),
                margin: new Decimal(10),
                marginMode: "ISOLATED",
                liquidationPrice: new Decimal(80),
                markPrice: new Decimal(100),
                breakEvenPrice: new Decimal(100),
                marginRate: new Decimal(0),
                realizedPnl: new Decimal(0),
            },
        ] as never;

        component = mount(CandleChartView, {
            target: host,
            props: { symbol: "BTCUSDT", timeframe: "1m", window: fakeWindow },
        }) as never;
        await settle();

        expect(appFetchMock).not.toHaveBeenCalled();
    });

    it("does not fetch when no API keys are configured", async () => {
        component = mount(CandleChartView, {
            target: host,
            props: { symbol: "BTCUSDT", timeframe: "1m", window: fakeWindow },
        }) as never;
        await settle();

        expect(appFetchMock).not.toHaveBeenCalled();
    });
});