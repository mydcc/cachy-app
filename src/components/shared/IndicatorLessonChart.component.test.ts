// @vitest-environment happy-dom
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
 * FEAT-0677 — AC 8 and AC 9, at the component level.
 *
 * AC 8: the chart draws the *currently selected symbol's* klines and follows a
 * symbol change. The selected symbol is `tradeState.symbol` — the app-wide
 * selection — so the test seeds `marketState` and switches `tradeState.symbol`.
 *
 * AC 9: one line series per declared catalogue output. The fan-out itself
 * (`computeLessonSeries`) is pinned against the engine in
 * `indicatorLessonSeries.test.ts`; here the real component draws its result, and
 * the mock chart records exactly how many line series it created. A truncating
 * bug (one line for a three-line indicator) fails as too few series — an
 * observable that cannot be satisfied by a canvas nobody can read.
 *
 * lightweight-charts needs a canvas happy-dom lacks, so it is mocked; every
 * other module (the catalogue, the engine, the derivation) is real.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import { Decimal } from "decimal.js";
import en from "../../locales/locales/en.json";

function lookup(key: string): string {
    return key
        .split(".")
        .reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], en) as string;
}

vi.mock("../../locales/i18n", async () => {
    const { readable } = await import("svelte/store");
    return {
        _: readable((key: string) => lookup(key) ?? key),
        locale: readable("en"),
        setLocale: vi.fn(),
    };
});

/*
 * The canvas mock. `LineSeries` / `CandlestickSeries` are the same sentinels the
 * component passes to `addSeries`, so the recorded split is by series type, and
 * `paneIndex` is kept so placement can be asserted.
 */
const lw = vi.hoisted(() => {
    const CandlestickSeries = Symbol("candlestick");
    const LineSeries = Symbol("line");
    const candleSeries = { setData: vi.fn(), applyOptions: vi.fn(), paneIndex: 0 };
    const lineSeries: Array<{
        options: Record<string, unknown>;
        paneIndex: number;
        setData: ReturnType<typeof vi.fn>;
        applyOptions: ReturnType<typeof vi.fn>;
    }> = [];
    let paneCount = 0;
    const chart = {
        // Models the library's real clamp: a requested pane index beyond the
        // panes that exist is clamped to the pane a new one creates, so the test
        // cannot pass against a skip-index the library would silently merge.
        addSeries: vi.fn((definition: unknown, options: Record<string, unknown>, paneIndex = 0) => {
            if (definition === CandlestickSeries) {
                paneCount = Math.max(paneCount, 1);
                candleSeries.paneIndex = 0;
                return candleSeries;
            }
            const effective = Math.min(paneCount, paneIndex);
            if (effective === paneCount) paneCount += 1;
            const series = {
                options,
                paneIndex: effective,
                setData: vi.fn(),
                applyOptions: vi.fn(),
            };
            lineSeries.push(series);
            return series;
        }),
        removeSeries: vi.fn(),
        applyOptions: vi.fn(),
        remove: vi.fn(),
        resetPanes: () => {
            paneCount = 0;
        },
    };
    return { CandlestickSeries, LineSeries, candleSeries, lineSeries, chart };
});

vi.mock("lightweight-charts", () => ({
    createChart: vi.fn(() => {
        lw.chart.resetPanes();
        return lw.chart;
    }),
    ColorType: { Solid: 0 },
    CandlestickSeries: lw.CandlestickSeries,
    LineSeries: lw.LineSeries,
}));

vi.mock("../../services/marketWatcher", () => ({
    marketWatcher: { register: vi.fn(), unregister: vi.fn() },
}));

vi.mock("../../stores/market.svelte", async () => {
    const { marketState } = await import(
        "../../lib/windows/implementations/marketState.helper.svelte"
    );
    return { marketState };
});

import { marketState } from "../../lib/windows/implementations/marketState.helper.svelte";
import { marketWatcher } from "../../services/marketWatcher";
import { tradeState } from "../../stores/trade.svelte";
import { catalogueEntry, REGISTRY_CATALOGUE } from "../../lib/alerts/indicatorCatalogue";
import { normalizeSymbol } from "../../utils/symbolUtils";
import type { MarketData } from "../../stores/market/types";
import type { Kline } from "../../services/technicalsTypes";
import IndicatorLessonChart from "./IndicatorLessonChart.svelte";

/** The timeframe the component draws on; kept here so the seed matches. */
const TIMEFRAME = "1h";
/** Longer than the widest warmup in the catalogue. */
const CANDLE_COUNT = 300;

function seedKlines(symbol: string, count = CANDLE_COUNT, base = 100): void {
    const klines: Kline[] = [];
    for (let i = 0; i < count; i++) {
        // Non-monotonic and varied: a flat series divides by zero in the
        // bandwidth and stochastic families and would test the wrong thing.
        const open = base + Math.sin(i / 3) * 4 + (i % 7);
        const close = open + Math.cos(i / 5) * 1.5;
        klines.push({
            open: new Decimal(open.toFixed(8)),
            high: new Decimal((Math.max(open, close) + 1).toFixed(8)),
            low: new Decimal((Math.min(open, close) - 1).toFixed(8)),
            close: new Decimal(close.toFixed(8)),
            volume: new Decimal((1000 + (i % 13) * 5).toFixed(8)),
            time: 1_700_000_000_000 + i * 3_600_000,
        });
    }
    marketState.data[normalizeSymbol(symbol, "bitunix")] = {
        klines: { [TIMEFRAME]: klines },
    } as unknown as MarketData;
}

let host: HTMLElement;
let component: Record<string, unknown> | null = null;

/** Mounts the chart for `entryId`, replacing any previous mount. */
function render(entryId: string): HTMLElement {
    if (component) {
        unmount(component as never);
        component = null;
    }
    host.innerHTML = "";
    lw.lineSeries.length = 0;

    const entry = catalogueEntry(entryId);
    if (!entry) throw new Error(`no catalogue entry for ${entryId}`);

    component = mount(IndicatorLessonChart, {
        target: host,
        props: { entry },
    }) as never;
    flushSync();

    const root = host.firstElementChild as HTMLElement;
    expect(root, `chart rendered nothing:\n${host.innerHTML}`).not.toBeNull();
    return root;
}

beforeEach(() => {
    vi.clearAllMocks();
    marketState.data = {};
    tradeState.symbol = "BTCUSDT";
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component as never);
    component = null;
    host.remove();
});

describe("FEAT-0677 — the live lesson chart", () => {
    it("draws one line series per declared output, for every multi-output indicator", () => {
        seedKlines("BTCUSDT");
        tradeState.symbol = "BTCUSDT";

        const multi = REGISTRY_CATALOGUE.filter((entry) => entry.outputs.length > 1);
        // Non-vacuity: AC 9 is about multi-output indicators, so the catalogue
        // must actually declare some, or this would assert nothing.
        expect(multi.length).toBeGreaterThan(0);

        for (const entry of multi) {
            render(entry.id);

            const declared = entry.outputs.map((output) => output.name);
            const drawn = lw.lineSeries;
            expect(
                drawn.length,
                `${entry.id}: declared [${declared.join(",")}] but drew ${drawn.length}`,
            ).toBe(declared.length);

            for (const [index, series] of drawn.entries()) {
                const points = series.setData.mock.calls.at(-1)?.[0] as unknown[] | undefined;
                expect(
                    points?.length ?? 0,
                    `${entry.id}.${declared[index]} drew no points`,
                ).toBeGreaterThan(0);
            }
        }
    });

    it("draws the selected symbol's klines and follows a symbol change", () => {
        seedKlines("BTCUSDT");
        tradeState.symbol = "BTCUSDT";

        const view = render("rsi");

        // The chart registers the selected symbol's kline channel, like a chart
        // window does, so history is paged in rather than assumed present.
        expect(marketWatcher.register).toHaveBeenCalledWith("BTCUSDT", `kline_${TIMEFRAME}`, "chart");
        expect(view.textContent).toContain("BTCUSDT");
        expect(lw.candleSeries.setData.mock.calls.at(-1)?.[0]).toHaveLength(CANDLE_COUNT);

        // A symbol with no klines yet: the empty state, and the chart cleared.
        tradeState.symbol = "SOLUSDT";
        flushSync();

        expect(marketWatcher.register).toHaveBeenCalledWith("SOLUSDT", `kline_${TIMEFRAME}`, "chart");
        expect(view.textContent).toContain("SOLUSDT");
        expect(view.textContent).toContain(lookup("indicatorLessons.chart.empty"));
        expect(lw.candleSeries.setData.mock.calls.at(-1)?.[0]).toEqual([]);

        // And back again: the selected symbol's own klines drive the candles.
        seedKlines("BTCUSDT");
        tradeState.symbol = "BTCUSDT";
        flushSync();

        expect(lw.candleSeries.setData.mock.calls.at(-1)?.[0]).toHaveLength(CANDLE_COUNT);
    });

    it("routes each line to a pane by placement and by output dimension", () => {
        seedKlines("BTCUSDT");
        tradeState.symbol = "BTCUSDT";

        render("ema"); // placement price, price-dimension output
        expect(lw.lineSeries.map((series) => series.paneIndex)).toEqual([0]);

        render("macd"); // placement pane: every line below the candles, whatever its dimension
        expect(lw.lineSeries.length).toBeGreaterThan(0);
        expect(lw.lineSeries.every((series) => series.paneIndex === 1)).toBe(true);

        // placement price, but two of the five outputs are not price-dimension.
        // Declared order: upper, middle, lower, percent_b, bandwidth. Drawing
        // percent_b/bandwidth on the price axis would be meaningless and can
        // blow out its autoscale.
        render("bollinger");
        expect(lw.lineSeries.map((series) => series.paneIndex)).toEqual([0, 0, 0, 1, 1]);

        // value is price-dimension; direction (±1) is not.
        render("parabolic_sar");
        expect(lw.lineSeries.map((series) => series.paneIndex)).toEqual([0, 1]);
    });

    it("redraws when the last candle is replaced in place", () => {
        seedKlines("BTCUSDT");
        tradeState.symbol = "BTCUSDT";
        render("rsi");

        // This is what klineBuffers does on a tick for the forming candle: it
        // replaces the last element while the array and symbol object stay put.
        const market = marketState.data[normalizeSymbol("BTCUSDT", "bitunix")];
        const klines = market.klines[TIMEFRAME];
        klines[klines.length - 1] = {
            ...klines[klines.length - 1],
            close: new Decimal("123.456"),
        };
        flushSync();

        const rows = lw.candleSeries.setData.mock.calls.at(-1)?.[0] as Array<{ close: number }>;
        expect(rows[rows.length - 1].close).toBeCloseTo(123.456);
    });

    it("redraws on the per-timeframe kline freshness signal", () => {
        seedKlines("BTCUSDT");
        tradeState.symbol = "BTCUSDT";
        render("rsi");

        // The signal the app advances on every kline write is what the chart
        // follows. Bumping it alone — no candle field touched — must redraw.
        // Depending on the global `lastUpdated` (which price/ticker/depth also
        // bump) would not, and that is the regression this pins (BUG-0248).
        const callsBefore = lw.candleSeries.setData.mock.calls.length;
        const market = marketState.data[normalizeSymbol("BTCUSDT", "bitunix")];
        market.klinesLastUpdated = { [TIMEFRAME]: Date.now() };
        flushSync();

        expect(lw.candleSeries.setData.mock.calls.length).toBeGreaterThan(callsBefore);
    });

    it("releases the market subscription on symbol change and on unmount", () => {
        seedKlines("BTCUSDT");
        tradeState.symbol = "BTCUSDT";
        render("rsi");

        tradeState.symbol = "ETHUSDT";
        flushSync();
        expect(marketWatcher.unregister).toHaveBeenCalledWith(
            "BTCUSDT",
            `kline_${TIMEFRAME}`,
            "chart",
        );

        unmount(component as never);
        component = null;
        expect(marketWatcher.unregister).toHaveBeenCalledWith(
            "ETHUSDT",
            `kline_${TIMEFRAME}`,
            "chart",
        );
    });

    it("drops a malformed candle instead of passing it to the series", () => {
        seedKlines("BTCUSDT");
        const key = normalizeSymbol("BTCUSDT", "bitunix");
        const klines = marketState.data[key].klines[TIMEFRAME];
        klines[CANDLE_COUNT - 5] = { ...klines[CANDLE_COUNT - 5], time: Number.NaN };
        tradeState.symbol = "BTCUSDT";

        render("rsi");

        const rows = lw.candleSeries.setData.mock.calls.at(-1)?.[0] as Array<{ time: number }>;
        expect(rows).toHaveLength(CANDLE_COUNT - 1);
        expect(rows.every((row) => Number.isFinite(row.time))).toBe(true);
    });
});
