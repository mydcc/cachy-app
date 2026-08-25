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
import { makeReactiveProps } from "./reactiveProps.helper.svelte.ts";

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
    const rangeSubscribers = new Set<(range: { from: number; to: number } | null) => void>();
    const timeScale = {
        subscribeVisibleLogicalRangeChange: vi.fn(
            (cb: (range: { from: number; to: number } | null) => void) => {
                rangeSubscribers.add(cb);
            },
        ),
        unsubscribeVisibleLogicalRangeChange: vi.fn(
            (cb: (range: { from: number; to: number } | null) => void) => {
                rangeSubscribers.delete(cb);
            },
        ),
        // Non-null range satisfying the scroll-left double check (from < 10).
        getVisibleLogicalRange: vi.fn(() => ({ from: 5, to: 30 })),
    };
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
        // BUG-0296: capture visible-range subscribers so tests can drive the
        // scroll-left handler without a real chart canvas.
        rangeSubscribers: rangeSubscribers,
        chart: {
            addSeries: vi.fn(() => candleSeries),
            applyOptions: vi.fn(),
            remove: vi.fn(),
            timeScale: vi.fn(() => timeScale),
        },
    };
});
vi.mock("lightweight-charts", () => ({
    createChart: vi.fn(() => chart.chart),
    ColorType: { Solid: 0 },
    CandlestickSeries: Symbol("candlestick"),
    LineSeries: Symbol("line"),
}));

const loadMoreHistoryMock = vi.hoisted(() => vi.fn());
vi.mock("../../../services/marketWatcher", () => ({
    marketWatcher: {
        register: vi.fn(),
        unregister: vi.fn(),
        loadMoreHistory: loadMoreHistoryMock,
    },
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
    accountState.openOrders = [];
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
    accountState.openOrders = [];
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
    function seedPositionAndPlans(unrealizedPnl: Decimal = new Decimal(0)) {
        accountState.positions = [
            {
                positionId: "p-1",
                symbol: "BTCUSDT",
                side: "long",
                size: new Decimal(1),
                entryPrice: new Decimal(100),
                leverage: new Decimal(10),
                unrealizedPnl,
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
        expect(prices).toEqual([80, 90, 100, 100, 120]); // Liq, SL, Entry, B/E, TP
    });

    it("colors the Entry line red when the position is underwater, green when in profit", async () => {
        seedPositionAndPlans(new Decimal(-5));
        component = mount(CandleChartView, {
            target: host,
            props: { symbol: "BTCUSDT", timeframe: "1m", window: fakeWindow },
        }) as never;
        await settle();

        const entryCallLoss = vi.mocked(chart.candleSeries.createPriceLine).mock.calls.find(
            ([opts]) => opts.title === "Entry",
        );
        expect(entryCallLoss?.[0].color).toBe("#ef5350");

        unmount(component as never);
        component = null;
        chart.priceLines.clear();
        vi.clearAllMocks();

        seedPositionAndPlans(new Decimal(5));
        component = mount(CandleChartView, {
            target: host,
            props: { symbol: "BTCUSDT", timeframe: "1m", window: fakeWindow },
        }) as never;
        await settle();

        const entryCallProfit = vi.mocked(chart.candleSeries.createPriceLine).mock.calls.find(
            ([opts]) => opts.title === "Entry",
        );
        expect(entryCallProfit?.[0].color).toBe("#26a69a");
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

    it("does not re-fetch positions when accountState.positions is already populated", async () => {
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
        // Orders would still be fetched (independent guard) — seed it too so
        // this test isolates the positions-skip behavior specifically.
        accountState.openOrders = [{ orderId: "o-1", symbol: "BTCUSDT" } as never];

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

/*
 * FEAT-0247 — a resting (unfilled) limit order must show a chart line even
 * before it fills into a position. Raised directly by the person testing
 * this against real Bitunix orders: they want to see it work for a pending
 * limit order first, before trusting it with money on a filled position.
 * accountState.openOrders has the same PositionsSidebar-only REST hydration
 * gap as accountState.positions (BUG-0249's root cause #2) — see the
 * "chart-only position hydration" describe block above.
 */
describe("FEAT-0247 — chart-only pending order hydration", () => {
    it("hydrates accountState.openOrders on mount when empty and API keys are configured", async () => {
        settingsState.apiKeys = { ...settingsState.apiKeys, bitunix: { key: "k", secret: "s" } };
        appFetchMock.mockImplementation((url: string) => {
            if (url === "/api/orders") {
                return Promise.resolve({
                    json: () =>
                        Promise.resolve({
                            orders: [
                                {
                                    orderId: "o-1",
                                    symbol: "BTCUSDT",
                                    side: "buy",
                                    type: "limit",
                                    price: "65000",
                                    amount: "1",
                                    filled: "0",
                                    status: "NEW",
                                    ctime: Date.now(),
                                },
                            ],
                        }),
                });
            }
            return Promise.resolve({ json: () => Promise.resolve({ success: true, data: { positions: [] } }) });
        });

        component = mount(CandleChartView, {
            target: host,
            props: { symbol: "BTCUSDT", timeframe: "1m", window: fakeWindow },
        }) as never;
        await settle();

        expect(appFetchMock).toHaveBeenCalledWith(
            "/api/orders",
            expect.objectContaining({ method: "POST" }),
        );
        expect(accountState.openOrders.some((o) => o.orderId === "o-1")).toBe(true);
    });

    it("renders a price line for the resting limit order", async () => {
        settingsState.apiKeys = { ...settingsState.apiKeys, bitunix: { key: "k", secret: "s" } };
        accountState.openOrders = [
            {
                orderId: "o-1",
                symbol: "BTCUSDT",
                side: "buy",
                type: "limit",
                price: new Decimal(65000),
                amount: new Decimal(1),
                filled: new Decimal(0),
                status: "NEW",
                timestamp: Date.now(),
            },
        ];

        component = mount(CandleChartView, {
            target: host,
            props: { symbol: "BTCUSDT", timeframe: "1m", window: fakeWindow },
        }) as never;
        await settle();

        const prices = [...chart.priceLines.values()].map((l) => l.price);
        expect(prices).toContain(65000);
    });
});

/*
 * BUG-0296 — history loading stays retryable.
 *
 * A transient kline fetch error used to be reported as `false` ("no more
 * history") by loadMoreHistory, and the chart turned that into
 * `allHistoryLoaded = true` — permanently disabling back-fill for every
 * timeframe of the window until reload. These tests drive the real
 * scroll-left handler through the captured visible-range subscribers:
 *
 * - "error" must NOT end history loading; the next scroll retries.
 * - "exhausted" (successful fetch, nothing older on the exchange) is the
 *   only result that ends it.
 * - switching symbol/timeframe re-arms loading for the new combination.
 */
describe("BUG-0296 — history loading stays retryable", () => {
    function fireScrollLeft(from = 5) {
        for (const cb of [...chart.rangeSubscribers]) {
            cb({ from, to: from + 25 });
        }
    }

    afterEach(() => {
        vi.useRealTimers();
    });

    it("keeps retrying after a failed load attempt (error is not exhaustion)", async () => {
        vi.useFakeTimers();
        seedHistory();
        loadMoreHistoryMock.mockResolvedValue("error");
        component = mount(CandleChartView, {
            target: host,
            props: { symbol: "BTCUSDT", timeframe: "1m", window: fakeWindow },
        }) as never;
        await settle();

        fireScrollLeft();
        // 200ms debounce before loadMore() actually fires
        await vi.advanceTimersByTimeAsync(200);
        expect(loadMoreHistoryMock).toHaveBeenCalledTimes(1);

        // The 500ms refire cooldown passes, then another scroll-left must
        // retry instead of being blocked by allHistoryLoaded.
        await vi.advanceTimersByTimeAsync(600);
        fireScrollLeft();
        await vi.advanceTimersByTimeAsync(200);
        expect(loadMoreHistoryMock).toHaveBeenCalledTimes(2);
    });

    it("stops loading only after an exhausted result", async () => {
        vi.useFakeTimers();
        seedHistory();
        loadMoreHistoryMock.mockResolvedValue("exhausted");
        component = mount(CandleChartView, {
            target: host,
            props: { symbol: "BTCUSDT", timeframe: "1m", window: fakeWindow },
        }) as never;
        await settle();

        fireScrollLeft();
        await vi.advanceTimersByTimeAsync(200);
        expect(loadMoreHistoryMock).toHaveBeenCalledTimes(1);

        // Exhausted -> further scroll-left events must not fetch again.
        await vi.advanceTimersByTimeAsync(600);
        fireScrollLeft();
        await vi.advanceTimersByTimeAsync(200);
        expect(loadMoreHistoryMock).toHaveBeenCalledTimes(1);
    });

    it("re-arms history loading when the timeframe changes", async () => {
        vi.useFakeTimers();
        seedHistory();
        loadMoreHistoryMock.mockResolvedValue("exhausted");
        // A reactive props proxy is the supported way to update a mounted
        // component's inputs — same as the parent window swapping the
        // timeframe without recreating CandleChartView.
        const reactiveProps = makeReactiveProps({
            symbol: "BTCUSDT",
            timeframe: "1m",
            window: fakeWindow,
        });
        component = mount(CandleChartView, {
            target: host,
            props: reactiveProps,
        }) as never;
        await settle();

        fireScrollLeft();
        await vi.advanceTimersByTimeAsync(200);
        expect(loadMoreHistoryMock).toHaveBeenCalledTimes(1);

        // Switch timeframe in the same chart window: the exhausted marker
        // from "1m" must not block "5m".
        reactiveProps.timeframe = "5m";
        await settle();

        fireScrollLeft();
        await vi.advanceTimersByTimeAsync(200);
        expect(loadMoreHistoryMock).toHaveBeenCalledTimes(2);
        expect(loadMoreHistoryMock).toHaveBeenLastCalledWith("BTCUSDT", "5m");
    });
});

/*
 * Chart settings tab wiring: the settings $effect must translate the stored
 * scale mode into lightweight-charts' PriceScaleMode without ever landing on
 * the rebasing modes (Percentage = 2 / IndexedTo100 = 3) — they made absolute
 * price lines unreadable and were removed from settings (#"% scale
 * confusion"). Also pins the secondsVisible toggle reaching the chart.
 */
describe("Chart settings — scale mode & time scale propagation", () => {
    function appliedChartOptions() {
        return vi.mocked(chart.chart.applyOptions).mock.calls.map(
            (call) => call[0] as Record<string, never>,
        );
    }

    it("applies the logarithmic scale by default", async () => {
        settingsState.chartPriceScaleMode = "log";
        component = mount(CandleChartView, {
            target: host,
            props: { symbol: "BTCUSDT", timeframe: "1m", window: fakeWindow },
        }) as never;
        await settle();

        const modeCalls = appliedChartOptions()
            .filter((o) => o.rightPriceScale && "mode" in o.rightPriceScale)
            .map((o) => (o.rightPriceScale as { mode: number }).mode);
        expect(modeCalls.length).toBeGreaterThan(0);
        for (const mode of modeCalls) {
            expect([0, 1]).toContain(mode);
        }
        expect(modeCalls.at(-1)).toBe(1);
    });

    it("maps linear to Normal (0)", async () => {
        settingsState.chartPriceScaleMode = "linear";
        component = mount(CandleChartView, {
            target: host,
            props: { symbol: "BTCUSDT", timeframe: "1m", window: fakeWindow },
        }) as never;
        await settle();

        const modeCalls = appliedChartOptions()
            .filter((o) => o.rightPriceScale && "mode" in o.rightPriceScale)
            .map((o) => (o.rightPriceScale as { mode: number }).mode);
        expect(modeCalls.at(-1)).toBe(0);

        settingsState.chartPriceScaleMode = "log";
    });

    it("propagates the secondsVisible toggle to chart.applyOptions", async () => {
        settingsState.chartSecondsVisible = false;
        component = mount(CandleChartView, {
            target: host,
            props: { symbol: "BTCUSDT", timeframe: "1m", window: fakeWindow },
        }) as never;
        await settle();
        vi.mocked(chart.chart.applyOptions).mockClear();

        settingsState.chartSecondsVisible = true;
        await settle();

        const tsCalls = appliedChartOptions()
            .filter((o) => o.timeScale)
            .map((o) => o.timeScale as { secondsVisible?: boolean });
        expect(tsCalls.length).toBeGreaterThan(0);
        expect(tsCalls.at(-1)?.secondsVisible).toBe(true);
        settingsState.chartSecondsVisible = false;
    });
});