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
    const candleSeries = {
        setData: vi.fn(),
        applyOptions: vi.fn(),
        paneIndex: 0,
        // Levels are drawn on the candle series. Markers are not: since v5
        // they go through the `createSeriesMarkers` plugin below, so the
        // series must NOT offer setMarkers — its absence is what proves the
        // component took the plugin path.
        createPriceLine: vi.fn((options: Record<string, unknown>) => ({ ...options })),
        removePriceLine: vi.fn(),
    };
    const markersPlugin = { setMarkers: vi.fn(), detach: vi.fn() };
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
                attachPrimitive: vi.fn(),
                detachPrimitive: vi.fn(),
            };
            lineSeries.push(series);
            return series;
        }),
        removeSeries: vi.fn(),
        applyOptions: vi.fn(),
        remove: vi.fn(),
        subscribeCrosshairMove: vi.fn(),
        unsubscribeCrosshairMove: vi.fn(),
        resetPanes: () => {
            paneCount = 0;
        },
    };
    return { CandlestickSeries, LineSeries, candleSeries, markersPlugin, lineSeries, chart };
});

vi.mock("lightweight-charts", () => ({
    createChart: vi.fn(() => {
        lw.chart.resetPanes();
        return lw.chart;
    }),
    createSeriesMarkers: vi.fn(() => lw.markersPlugin),
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
import { formatBadgeValue } from "../../lib/chart/crosshairValueBadge";
import { normalizeSymbol } from "../../utils/symbolUtils";
import type { MarketData } from "../../stores/market/types";
import type { Kline } from "../../services/technicalsTypes";
import type { PriceField } from "../../lib/rules/types";
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
function render(
    entryId: string,
    params?: Record<string, number>,
    field?: PriceField,
): HTMLElement {
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
        props: { entry, params, field },
    }) as never;
    flushSync();

    const root = host.firstElementChild as HTMLElement;
    expect(root, `chart rendered nothing:\n${host.innerHTML}`).not.toBeNull();
    return root;
}

/** The timeframe chip in the chart header (its name carries the current value). */
function timeframeChip(view: HTMLElement): HTMLButtonElement {
    const chip = view.querySelector<HTMLButtonElement>(
        `[aria-label^="${lookup("indicatorLessons.chart.timeframeLabel")}"]`,
    );
    if (!chip) throw new Error("no timeframe chip rendered");
    return chip;
}

/** Opens the chip's popup and returns its quick-pick grid. */
function openTimeframePopup(view: HTMLElement): HTMLElement {
    timeframeChip(view).click();
    flushSync();
    const grid = view.querySelector(".grid");
    if (!grid) throw new Error("the timeframe popup did not open");
    return grid as HTMLElement;
}

/** A button found by its visible label, wherever it sits in the chart. */
function buttonWithLabel(view: HTMLElement, text: string): HTMLButtonElement {
    const button = [...view.querySelectorAll("button")].find(
        (candidate) => candidate.textContent?.trim() === text,
    );
    if (!button) throw new Error(`no '${text}' button rendered`);
    return button as HTMLButtonElement;
}

beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
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

    it("attaches one crosshair value badge per line and repaints it on hover", () => {
        seedKlines("BTCUSDT");
        tradeState.symbol = "BTCUSDT";
        render("rsi");

        // One badge primitive per indicator line, attached to its series.
        expect(lw.lineSeries.length).toBeGreaterThan(0);
        const badges = lw.lineSeries.map(
            (series) =>
                series.attachPrimitive.mock.calls[0][0] as {
                    attached(params: unknown): void;
                    update(): void;
                },
        );
        for (const series of lw.lineSeries) {
            expect(series.attachPrimitive).toHaveBeenCalledTimes(1);
        }

        // The chart reports crosshair moves so badges repaint on hover.
        expect(lw.chart.subscribeCrosshairMove).toHaveBeenCalledTimes(1);
        const onMove = lw.chart.subscribeCrosshairMove.mock.calls[0][0] as (param: {
            time?: unknown;
        }) => void;

        // Wire the real badges to a repaint spy, then drive the handler:
        // a new hovered time repaints every badge, a repeated one repaints
        // nothing, and leaving the chart repaints to hide.
        const requestUpdate = vi.fn();
        for (const badge of badges) {
            badge.attached({ chart: {}, series: {}, requestUpdate, horzScaleBehavior: {} });
        }

        onMove({ time: 1_700_000_000 });
        expect(requestUpdate.mock.calls.length).toBeGreaterThanOrEqual(badges.length);

        requestUpdate.mockClear();
        onMove({ time: 1_700_000_000 });
        expect(requestUpdate).not.toHaveBeenCalled();

        onMove({});
        expect(requestUpdate.mock.calls.length).toBeGreaterThanOrEqual(badges.length);
    });

    it("skips a line colour that dissolves into the card", () => {
        seedKlines("BTCUSDT");
        tradeState.symbol = "BTCUSDT";
        // Clash the theme's accent with the card: without the guard the
        // first line would paint accent-on-accent (contrast 1.0).
        const getComputedStyle = vi.spyOn(window, "getComputedStyle").mockReturnValue({
            getPropertyValue: (name: string) =>
                (
                    {
                        "--bg-tertiary": "#44475a",
                        "--accent-color": "#44475a",
                    } as Record<string, string>
                )[name] ?? "",
        } as CSSStyleDeclaration);
        try {
            render("rsi");

            expect(lw.lineSeries.length).toBeGreaterThan(0);
            // Success (#22c55e) is the next palette entry with contrast.
            expect(lw.lineSeries[0].options.color).toBe("#22c55e");
            // Legend and series agree — both read the chosen token.
            const swatch = host.querySelector('li span[aria-hidden="true"]') as HTMLElement;
            expect(swatch.style.background).toContain("--success-color");
        } finally {
            getComputedStyle.mockRestore();
        }
    });

    it("paints each line's own value at the hovered bar", () => {
        seedKlines("BTCUSDT");
        tradeState.symbol = "BTCUSDT";
        const multi = REGISTRY_CATALOGUE.filter((entry) => entry.outputs.length > 1);
        expect(multi.length).toBeGreaterThan(0);
        render(multi[0].id);
        expect(lw.lineSeries.length).toBeGreaterThan(1);

        const onMove = lw.chart.subscribeCrosshairMove.mock.calls[0][0] as (param: {
            time?: unknown;
        }) => void;
        // The series' recorded data: the expected text per line comes from
        // the same arrays the component feeds the chart.
        const lineData = lw.lineSeries.map(
            (series) =>
                series.setData.mock.calls.at(-1)?.[0] as Array<{ time: number; value: number }>,
        );
        const hovered = lineData[0][0].time;
        onMove({ time: hovered });

        lw.lineSeries.forEach((series, index) => {
            const badge = series.attachPrimitive.mock.calls[0][0] as {
                attached(params: unknown): void;
                paneViews(): Array<{ renderer(): { draw(target: unknown): void } }>;
            };
            badge.attached({
                chart: { timeScale: () => ({ timeToCoordinate: () => 100 + index * 10 }) },
                series: { priceToCoordinate: () => 150 },
                requestUpdate: () => {},
                horzScaleBehavior: {},
            });
            const seen: string[] = [];
            const fakeCtx = {
                save() {},
                restore() {},
                beginPath() {},
                roundRect() {},
                fill() {},
                stroke() {},
                measureText: () => ({ width: 30 }),
                fillText: (text: string) => {
                    seen.push(text);
                },
            };
            let font = "";
            Object.defineProperty(fakeCtx, "font", {
                get: () => font,
                set: (v: string) => {
                    font = v;
                },
            });
            badge.paneViews()[0].renderer().draw({
                useMediaCoordinateSpace: (fn: (scope: unknown) => void) =>
                    fn({ context: fakeCtx, mediaSize: { width: 400, height: 300 } }),
            });
            expect(seen).toEqual([formatBadgeValue(lineData[index][0].value)]);
        });
    });

    it("repaints badges with fresh theme colours on a theme switch", async () => {
        seedKlines("BTCUSDT");
        tradeState.symbol = "BTCUSDT";
        render("rsi");

        const requestUpdate = vi.fn();
        const badge = lw.lineSeries[0].attachPrimitive.mock.calls[0][0] as {
            attached(params: unknown): void;
        };
        badge.attached({ chart: {}, series: {}, requestUpdate, horzScaleBehavior: {} });

        // The theme observer debounces through rAF like the sibling charts.
        document.documentElement.setAttribute("class", "theme-light");
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        flushSync();

        // applyColors() refreshed the cached theme and asked for repaint.
        expect(requestUpdate).toHaveBeenCalled();
        document.documentElement.removeAttribute("class");
    });

    it("unsubscribes from crosshair moves on unmount", () => {
        seedKlines("BTCUSDT");
        tradeState.symbol = "BTCUSDT";
        render("rsi");

        expect(lw.chart.subscribeCrosshairMove).toHaveBeenCalledTimes(1);
        unmount(component as never);
        component = null;
        expect(lw.chart.unsubscribeCrosshairMove).toHaveBeenCalledTimes(1);
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

    it("computes with the parameters it is handed, not the catalogue defaults", () => {
        seedKlines("BTCUSDT");
        tradeState.symbol = "BTCUSDT";

        const drawnPoints = (period: number): unknown[] => {
            render("rsi", { period });
            const series = lw.lineSeries[0];
            expect(series, "no line series drawn").toBeDefined();
            return (series.setData.mock.calls.at(-1)?.[0] as unknown[]) ?? [];
        };

        const shortWarmup = drawnPoints(3);
        const longWarmup = drawnPoints(14);

        // RSI is indeterminate for its first `period` candles, so the longer
        // period draws strictly fewer points. Equal counts would mean the
        // parameter never reached the engine and the defaults were used.
        expect(longWarmup.length).toBeGreaterThan(0);
        expect(shortWarmup.length).toBeGreaterThan(longWarmup.length);
    });

    it("computes over the price it is handed, not the indicator's own default", () => {
        seedKlines("BTCUSDT");
        tradeState.symbol = "BTCUSDT";

        const drawn = (field?: PriceField): string[] => {
            render("rsi", undefined, field);
            const series = lw.lineSeries[0];
            expect(series, "no line series drawn").toBeDefined();
            const points =
                (series.setData.mock.calls.at(-1)?.[0] as Array<{ value: number }>) ?? [];
            return points.map((point) => String(point.value));
        };

        const overClose = drawn();
        const overHl2 = drawn("hl2");

        // A different source is a different line: the chart window computes RSI
        // over the card's source, so a dropped field would quietly draw the wrong
        // price with every assertion still green.
        expect(overClose.length).toBeGreaterThan(0);
        expect(overHl2).not.toEqual(overClose);
    });

    it("draws the timeframe the learner picks from the dropdown, and remembers it", () => {
        seedKlines("BTCUSDT");
        tradeState.symbol = "BTCUSDT";

        const view = render("rsi");
        expect(timeframeChip(view).textContent?.trim()).toBe("1h");

        openTimeframePopup(view);
        buttonWithLabel(view, "4h").click();
        flushSync();

        // The pick drives the subscription, so the candles come in on the new
        // timeframe, and it survives the visit.
        expect(marketWatcher.register).toHaveBeenCalledWith("BTCUSDT", "kline_4h", "chart");
        expect(localStorage.getItem("cachy_lesson_timeframe")).toBe("4h");
        expect(timeframeChip(view).textContent?.trim()).toBe("4h");
    });

    it("opens on the remembered timeframe", () => {
        seedKlines("BTCUSDT");
        tradeState.symbol = "BTCUSDT";
        localStorage.setItem("cachy_lesson_timeframe", "4h");

        const view = render("rsi");

        expect(timeframeChip(view).textContent?.trim()).toBe("4h");
        expect(marketWatcher.register).toHaveBeenCalledWith("BTCUSDT", "kline_4h", "chart");
    });

    it("ignores a remembered timeframe the app cannot draw", () => {
        seedKlines("BTCUSDT");
        tradeState.symbol = "BTCUSDT";
        // A hand-edited or migrated store: the chip must show something drawable
        // and the subscription must follow what is shown.
        localStorage.setItem("cachy_lesson_timeframe", "nonsense");

        const view = render("rsi");

        expect(timeframeChip(view).textContent?.trim()).toBe("1h");
        expect(marketWatcher.register).toHaveBeenCalledWith("BTCUSDT", "kline_1h", "chart");
    });

    it("takes a timeframe the grid does not offer, through the custom field", () => {
        seedKlines("BTCUSDT");
        tradeState.symbol = "BTCUSDT";

        const view = render("rsi");
        openTimeframePopup(view);
        const field = view.querySelector("input");
        if (!field) throw new Error("no custom timeframe field");
        field.value = "3m";
        field.dispatchEvent(new Event("input", { bubbles: true }));
        flushSync();
        buttonWithLabel(view, lookup("common.ok")).click();
        flushSync();

        // The grid is a convenience, not the universe: the custom field is how a
        // trader reaches the timeframes the story pattern does not list.
        expect(marketWatcher.register).toHaveBeenCalledWith("BTCUSDT", "kline_3m", "chart");
        expect(localStorage.getItem("cachy_lesson_timeframe")).toBe("3m");
    });

    it("refuses a submission that is not a timeframe at all", () => {
        seedKlines("BTCUSDT");
        tradeState.symbol = "BTCUSDT";

        const view = render("rsi");
        const before = localStorage.getItem("cachy_lesson_timeframe");

        openTimeframePopup(view);
        const field = view.querySelector("input");
        if (!field) throw new Error("no custom timeframe field");
        field.value = "abc";
        field.dispatchEvent(new Event("input", { bubbles: true }));
        flushSync();
        buttonWithLabel(view, lookup("common.ok")).click();
        flushSync();

        // The dropdown hands over what was typed; the lesson is where "drawable"
        // is known, and it must not store a channel no candle will arrive on.
        expect(timeframeChip(view).textContent?.trim()).toBe("1h");
        expect(localStorage.getItem("cachy_lesson_timeframe")).toBe(before);
        // And the refusal is visible: the popup stays open with the text in it,
        // so the trader can see what was wrong and correct it.
        expect(view.querySelector(".grid"), "the refusal closed the popup").not.toBeNull();
        expect((field as HTMLInputElement).value).toBe("abc");
    });

    it("honours a remembered timeframe the grid does not list", () => {
        seedKlines("BTCUSDT");
        tradeState.symbol = "BTCUSDT";
        // The custom field's whole point: a timeframe outside the six is stored
        // and drawn, not narrowed back to the grid.
        localStorage.setItem("cachy_lesson_timeframe", "1w");

        const view = render("rsi");

        expect(timeframeChip(view).textContent?.trim()).toBe("1w");
        expect(marketWatcher.register).toHaveBeenCalledWith("BTCUSDT", "kline_1w", "chart");
    });

    it("canonicalises a stored spelling before it becomes a channel", () => {
        seedKlines("BTCUSDT");
        tradeState.symbol = "BTCUSDT";
        // `parseTimeframe` reads `0001d` as one day, but the *string* names the
        // channel and the exchange serves `kline_1d` — so a stored spelling is
        // run through the app's own normaliser first.
        localStorage.setItem("cachy_lesson_timeframe", "0001d");

        const view = render("rsi");

        expect(timeframeChip(view).textContent?.trim()).toBe("1d");
        expect(marketWatcher.register).toHaveBeenCalledWith("BTCUSDT", "kline_1d", "chart");
    });

    it("passes cockpit markers and price lines to the candle series", () => {
        seedKlines("BTCUSDT");
        tradeState.symbol = "BTCUSDT";

        const entry = catalogueEntry("ema");
        if (!entry) throw new Error("no catalogue entry for ema");
        if (component) {
            unmount(component as never);
            component = null;
        }
        host.innerHTML = "";
        component = mount(IndicatorLessonChart, {
            target: host,
            props: {
                entry,
                markers: [
                    { time: 1_700_000_000, position: "belowBar", color: "#fff", shape: "circle", text: "BOS" },
                ],
                priceLines: [{ price: 101.5, color: "#fff", title: "R" }],
            },
        }) as never;
        flushSync();

        expect(lw.markersPlugin.setMarkers).toHaveBeenCalledWith([
            { time: 1_700_000_000, position: "belowBar", color: "#fff", shape: "circle", text: "BOS" },
        ]);
        expect(lw.candleSeries.createPriceLine).toHaveBeenCalledWith(
            expect.objectContaining({ price: 101.5, title: "R" }),
        );
    });

    it("follows a parent timeframe and hides its own picker", () => {
        seedKlines("BTCUSDT");
        tradeState.symbol = "BTCUSDT";

        const entry = catalogueEntry("rsi");
        if (!entry) throw new Error("no catalogue entry for rsi");
        if (component) {
            unmount(component as never);
            component = null;
        }
        host.innerHTML = "";
        component = mount(IndicatorLessonChart, {
            target: host,
            props: { entry, timeframe: "4h", onTimeframeChange: vi.fn(), showTimeframePicker: false },
        }) as never;
        flushSync();
        const view = host.firstElementChild as HTMLElement;

        // Controlled: the subscription follows the parent value, and the
        // dropdown is replaced by a read-only label.
        expect(marketWatcher.register).toHaveBeenCalledWith("BTCUSDT", "kline_4h", "chart");
        expect(
            view.querySelector(`[aria-label^="${lookup("indicatorLessons.chart.timeframeLabel")}"]`),
        ).toBeNull();
    });

    it("forwards dropdown picks to the parent instead of storing them", () => {
        seedKlines("BTCUSDT");
        tradeState.symbol = "BTCUSDT";

        const entry = catalogueEntry("rsi");
        if (!entry) throw new Error("no catalogue entry for rsi");
        const onTimeframeChange = vi.fn();
        if (component) {
            unmount(component as never);
            component = null;
        }
        host.innerHTML = "";
        component = mount(IndicatorLessonChart, {
            target: host,
            props: { entry, timeframe: "1h", onTimeframeChange },
        }) as never;
        flushSync();
        const view = host.firstElementChild as HTMLElement;

        openTimeframePopup(view);
        buttonWithLabel(view, "4h").click();
        flushSync();

        expect(onTimeframeChange).toHaveBeenCalledWith("4h");
        expect(localStorage.getItem("cachy_lesson_timeframe")).toBe("4h");
    });
});
