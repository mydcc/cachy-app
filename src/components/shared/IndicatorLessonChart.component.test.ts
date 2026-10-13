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
    const candleSeries = { setData: vi.fn(), applyOptions: vi.fn() };
    const lineSeries: Array<{
        options: Record<string, unknown>;
        paneIndex: number;
        setData: ReturnType<typeof vi.fn>;
    }> = [];
    const chart = {
        addSeries: vi.fn((definition: unknown, options: Record<string, unknown>, paneIndex = 0) => {
            if (definition === CandlestickSeries) return candleSeries;
            const series = { options, paneIndex, setData: vi.fn() };
            lineSeries.push(series);
            return series;
        }),
        removeSeries: vi.fn(),
        applyOptions: vi.fn(),
        remove: vi.fn(),
    };
    return { CandlestickSeries, LineSeries, candleSeries, lineSeries, chart };
});

vi.mock("lightweight-charts", () => ({
    createChart: vi.fn(() => lw.chart),
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

    it("overlays a price indicator and gives a pane indicator its own pane", () => {
        seedKlines("BTCUSDT");
        tradeState.symbol = "BTCUSDT";

        render("ema"); // placement: "price"
        expect(lw.lineSeries).toHaveLength(1);
        expect(lw.lineSeries[0].paneIndex).toBe(0);

        render("macd"); // placement: "pane"
        expect(lw.lineSeries.length).toBeGreaterThan(0);
        expect(lw.lineSeries.every((series) => series.paneIndex === 1)).toBe(true);
    });
});
