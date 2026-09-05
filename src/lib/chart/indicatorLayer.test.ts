import { describe, it, expect, vi, beforeEach } from "vitest";
import type { IChartApi, ISeriesApi, IPaneApi, Time } from "lightweight-charts";
import { IndicatorLayer } from "./indicatorLayer";
import type { ChartRow } from "./seriesMap";

function makeSeries() {
    return {
        setData: vi.fn(),
        update: vi.fn(),
        applyOptions: vi.fn(),
        priceToCoordinate: vi.fn(() => 100),
        priceScale: () => ({ width: () => 60 }),
        createPriceLine: vi.fn(),
        removePriceLine: vi.fn(),
    } as unknown as ISeriesApi<"Line"> & ISeriesApi<"Histogram"> & ISeriesApi<"Candlestick">;
}

type MockPane = IPaneApi<Time> & {
    series: unknown[];
    preserveEmptyPane: boolean;
    stretchFactor: number;
};

function makePane(index: number): MockPane {
    return {
        paneIndex: () => index,
        setHeight: vi.fn(),
        setStretchFactor: vi.fn(function (this: { stretchFactor: number }, f: number) {
            this.stretchFactor = f;
        }),
        getStretchFactor: vi.fn(function (this: { stretchFactor: number }) {
            return this.stretchFactor;
        }),
        // The layer reads pane heights to compute the stretch-factor pass.
        getHeight: vi.fn(() => 80),
        getSeries: () => [],
        attachPrimitive: vi.fn(),
        detachPrimitive: vi.fn(),
        priceScale: () => ({ width: () => 60 }),
        series: [],
        preserveEmptyPane: false,
        stretchFactor: 1,
    } as unknown as MockPane;
}

function makeChart() {
    const panes = [makePane(0)];
    const chart = {
        // Mirror lightweight-charts: addSeries clamps paneIndex to
        // Math.min(panes.length, index) and only then creates a pane one
        // past the current count — an index that was never materialized
        // drifts onto the last existing pane, exactly like in production.
        addSeries: vi.fn((_type: unknown, _opts: unknown, paneIndex?: number) => {
            const series = makeSeries();
            if (typeof paneIndex === "number") {
                const idx = Math.min(panes.length, paneIndex);
                while (panes.length <= idx) panes.push(makePane(panes.length));
                (panes[idx] as MockPane).series.push(series);
            }
            return series;
        }),
        addPane: vi.fn((preserveEmptyPane?: boolean) => {
            const pane = makePane(panes.length);
            pane.preserveEmptyPane = preserveEmptyPane === true;
            panes.push(pane);
            return pane;
        }),
        removeSeries: vi.fn((series: unknown) => {
            // Mirror lightweight-charts: removing a series cleans up panes
            // that became empty, unless they were created with
            // preserveEmptyPane. Without this the strip-survival test
            // cannot fail.
            for (let i = panes.length - 1; i >= 1; i--) {
                const p = panes[i] as MockPane;
                const idx = p.series.indexOf(series);
                if (idx === -1) continue;
                p.series.splice(idx, 1);
            }
            for (let i = panes.length - 1; i >= 1; i--) {
                const p = panes[i] as MockPane;
                if (!p.preserveEmptyPane && p.series.length === 0) panes.splice(i, 1);
            }
        }),
        removePane: vi.fn((idx: number) => {
            if (idx >= 0 && idx < panes.length) panes.splice(idx, 1);
        }),
        panes: () => panes,
        applyOptions: vi.fn(),
        timeScale: () => ({ applyOptions: vi.fn(), fitContent: vi.fn(), height: () => 30 }),
        priceScale: () => ({ width: () => 60 }),
    } as unknown as IChartApi<Time>;
    return { chart, panes };
}

/** Stretch factor currently assigned to pane `idx` (factor == target px). */
function factorOf(panes: IPaneApi<Time>[], idx: number): number | undefined {
    const pane = panes[idx];
    if (!pane) return undefined;
    return (pane as unknown as { stretchFactor: number }).stretchFactor;
}

function on(extra: Record<string, unknown> = {}) {
    return { enabled: true, ...extra };
}

function makeRows(n: number): ChartRow[] {
    const rows: ChartRow[] = [];
    for (let i = 0; i < n; i++) {
        const close = 100 + (i % 5);
        rows.push({
            time: (1700000000 + i * 60) as unknown as Time,
            open: close - 1,
            high: close + 2,
            low: close - 3,
            close,
            volume: 1000 + i,
        });
    }
    return rows;
}

function off() {
    return { enabled: false };
}

function makeState(overrides: Record<string, unknown> = {}) {
    return {
        ema: { ...off(), source: "close", ema1: { length: 9 }, ema2: { length: 21 }, ema3: { length: 50 } },
        sma: { ...off(), sma1: { length: 20 }, sma2: { length: 50 }, sma3: { length: 100 } },
        wma: { ...off(), length: 20 },
        hma: { ...off(), length: 20 },
        vwma: { ...off(), length: 20 },
        bollingerBands: { ...off(), length: 20, stdDev: 2, source: "close" },
        vwap: { ...off(), anchor: "session" },
        ichimoku: { ...off(), conversionPeriod: 9, basePeriod: 26, spanBPeriod: 52 },
        superTrend: { ...off(), period: 10, factor: 3 },
        parabolicSar: { ...off(), start: 0.02, increment: 0.02, max: 0.2 },
        atrTrailingStop: { ...off(), period: 14, multiplier: 3 },
        rsi: { ...off(), length: 14, source: "close" },
        macd: { ...off(), fastLength: 12, slowLength: 26, signalLength: 9, source: "close" },
        stochRsi: { ...off(), length: 14, rsiLength: 14, kPeriod: 3, dPeriod: 3, source: "close" },
        cci: { ...off(), length: 20, source: "close" },
        momentum: { ...off(), length: 10, source: "close" },
        williamsR: { ...off(), length: 14 },
        obv: { ...off(), smoothingLength: 0 },
        adx: { ...off(), adxSmoothing: 14, diLength: 14 },
        ao: { ...off(), fastLength: 5, slowLength: 34 },
        choppiness: { ...off(), length: 14 },
        stochastic: { ...off(), kPeriod: 14, dPeriod: 3 },
        mfi: { ...off(), length: 14 },
        volume: { enabled: true },
        ...overrides,
    };
}

const getColor = vi.fn(() => null);

vi.mock("../../stores/indicator.svelte", () => ({
    indicatorState: makeState(),
}));

import { indicatorState } from "../../stores/indicator.svelte";

function subPaneIndices(chart: IChartApi<Time>): number[] {
    const calls = (chart.addSeries as ReturnType<typeof vi.fn>).mock.calls;
    return calls.map((c) => c[2] as number).filter((i) => i > 0);
}

describe("IndicatorLayer", () => {
    let env: ReturnType<typeof makeChart>;

    beforeEach(() => {
        env = makeChart();
        vi.clearAllMocks();
        Object.assign(indicatorState, makeState());
        (getColor as ReturnType<typeof vi.fn>).mockClear();
    });

    it("does not open sub-panes when the chart is too short (height gating)", () => {
        const layer = new IndicatorLayer(env.chart, getColor);
        layer.setAvailableHeight(200); // below MIN_CHART_HEIGHT (360)
        Object.assign(indicatorState, makeState({ rsi: { enabled: true, length: 14, source: "close" } }));
        layer.render(makeRows(60));

        expect(subPaneIndices(env.chart).length).toBe(0);
    });

    it("opens exactly the enabled sub-panes when tall enough (enabled gating)", () => {
        const layer = new IndicatorLayer(env.chart, getColor);
        layer.setAvailableHeight(1000);
        Object.assign(indicatorState, makeState({ rsi: { enabled: true, length: 14, source: "close" } }));
        layer.render(makeRows(60));

        const indices = subPaneIndices(env.chart);
        // Volume (always on) + RSI = 2 sub-panes.
        expect(indices.length).toBe(2);
        expect(indices).toContain(1);
        expect(indices).toContain(2);
    });

    it("tears down previously managed series before re-rendering", () => {
        const layer = new IndicatorLayer(env.chart, getColor);
        layer.setAvailableHeight(1000);
        Object.assign(indicatorState, makeState({ rsi: { enabled: true, length: 14, source: "close" } }));
        layer.render(makeRows(60));
        const beforeSecond = (env.chart.removeSeries as ReturnType<typeof vi.fn>).mock.calls.length;

        layer.render(makeRows(60));

        expect((env.chart.removeSeries as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(beforeSecond);
    });

    it("skips disabled indicators so they do not consume a slot", () => {
        const layer = new IndicatorLayer(env.chart, getColor);
        layer.setAvailableHeight(1000);
        Object.assign(indicatorState, makeState()); // everything off
        layer.render(makeRows(60));

        // Volume is enabled by default, and no oscillator sub-panes should be
        // allocated.
        expect(subPaneIndices(env.chart).length).toBe(1);
    });

    it("reports the visible sub-panes, with their settings, via onPanesChanged", () => {
        const onPanesChanged = vi.fn();
        const layer = new IndicatorLayer(env.chart, getColor, null, onPanesChanged);
        layer.setAvailableHeight(1000);
        Object.assign(indicatorState, makeState({ rsi: { enabled: true, length: 14, source: "close" } }));
        layer.render(makeRows(60));

        const lastCall = onPanesChanged.mock.calls[onPanesChanged.mock.calls.length - 1][0];
        expect(lastCall).toEqual([
            { paneIndex: 1, key: "volume", titleKey: "settings.technicals.volume", params: "", collapsed: false },
            { paneIndex: 2, key: "rsi", titleKey: "settings.technicals.rsi.title", params: "14", collapsed: false },
        ]);
    });

    it("reports multi-value settings so the label can read like 'MACD 12 26 9'", () => {
        const onPanesChanged = vi.fn();
        const layer = new IndicatorLayer(env.chart, getColor, null, onPanesChanged);
        layer.setAvailableHeight(1000);
        Object.assign(indicatorState, makeState({
            volume: { enabled: false },
            macd: on({ fastLength: 12, slowLength: 26, signalLength: 9, source: "close" }),
        }));
        layer.render(makeRows(60));

        const lastCall = onPanesChanged.mock.calls[onPanesChanged.mock.calls.length - 1][0];
        expect(lastCall).toEqual([
            { paneIndex: 1, key: "macd", titleKey: "settings.technicals.macd.title", params: "12 26 9", collapsed: false },
        ]);
    });

    it("omits the volume pane from onPanesChanged when volume is disabled", () => {
        const onPanesChanged = vi.fn();
        const layer = new IndicatorLayer(env.chart, getColor, null, onPanesChanged);
        layer.setAvailableHeight(1000);
        Object.assign(indicatorState, makeState({ volume: { enabled: false } }));
        layer.render(makeRows(60));

        const lastCall = onPanesChanged.mock.calls[onPanesChanged.mock.calls.length - 1][0];
        expect(lastCall).toEqual([]);
    });

    it("shrinks the panes so every enabled indicator still gets one", () => {
        // The reported regression: at this height the old fixed-80px budget
        // fitted 3 panes and silently dropped StochRSI and CCI even though
        // they were switched on in Settings.
        const onPanesChanged = vi.fn();
        const layer = new IndicatorLayer(env.chart, getColor, null, onPanesChanged);
        layer.setAvailableHeight(451);
        Object.assign(indicatorState, makeState({
            rsi: on({ length: 14, source: "close" }),
            macd: on({ fastLength: 12, slowLength: 26, signalLength: 9, source: "close" }),
            stochRsi: on({ length: 14, rsiLength: 14, kPeriod: 3, dPeriod: 3, source: "close" }),
            cci: on({ length: 20, source: "close" }),
        }));
        layer.render(makeRows(60));

        const panes = onPanesChanged.mock.calls[onPanesChanged.mock.calls.length - 1][0];
        expect(panes.map((p: { key: string }) => p.key)).toEqual([
            "volume", "rsi", "macd", "stochRsi", "cci",
        ]);
        // (451 - 140 price floor) / 5 panes = 62px each, above the 56px floor.
        // Height is expressed as stretch factor (factor == target px height).
        expect(factorOf(env.panes, 1)).toBe(62);
    });

    it("caps at what fits once the panes would fall below the readable floor", () => {
        const onPanesChanged = vi.fn();
        const layer = new IndicatorLayer(env.chart, getColor, null, onPanesChanged);
        layer.setAvailableHeight(400); // budget 260 -> floor(260/56) = 4 panes
        Object.assign(indicatorState, makeState({
            rsi: on({ length: 14, source: "close" }),
            macd: on({ fastLength: 12, slowLength: 26, signalLength: 9, source: "close" }),
            stochRsi: on({ length: 14, rsiLength: 14, kPeriod: 3, dPeriod: 3, source: "close" }),
            cci: on({ length: 20, source: "close" }),
            mfi: on({ length: 14 }),
        }));
        layer.render(makeRows(60));

        const panes = onPanesChanged.mock.calls[onPanesChanged.mock.calls.length - 1][0];
        expect(panes).toHaveLength(4);
        expect(factorOf(env.panes, 1)).toBe(65);
    });

    it("re-renders with more panes when the chart window grows", () => {
        // Regression: setAvailableHeight only re-rendered when the 360px
        // threshold was crossed, so enlarging a already-tall chart never
        // gained panes until the next full data render.
        const onPanesChanged = vi.fn();
        const layer = new IndicatorLayer(env.chart, getColor, null, onPanesChanged);
        layer.setAvailableHeight(400);
        Object.assign(indicatorState, makeState({
            rsi: on({ length: 14, source: "close" }),
            macd: on({ fastLength: 12, slowLength: 26, signalLength: 9, source: "close" }),
            stochRsi: on({ length: 14, rsiLength: 14, kPeriod: 3, dPeriod: 3, source: "close" }),
            cci: on({ length: 20, source: "close" }),
            mfi: on({ length: 14 }),
        }));
        layer.render(makeRows(60));
        const before = onPanesChanged.mock.calls[onPanesChanged.mock.calls.length - 1][0];
        expect(before).toHaveLength(4);

        layer.setAvailableHeight(900);

        const after = onPanesChanged.mock.calls[onPanesChanged.mock.calls.length - 1][0];
        expect(after).toHaveLength(6); // volume + all five, no new candle needed
    });

    it("resizes existing panes without rebuilding them when only the height changes", () => {
        const layer = new IndicatorLayer(env.chart, getColor);
        layer.setAvailableHeight(451);
        Object.assign(indicatorState, makeState({
            rsi: on({ length: 14, source: "close" }),
            macd: on({ fastLength: 12, slowLength: 26, signalLength: 9, source: "close" }),
            stochRsi: on({ length: 14, rsiLength: 14, kPeriod: 3, dPeriod: 3, source: "close" }),
            cci: on({ length: 20, source: "close" }),
        }));
        layer.render(makeRows(60));
        const seriesCallsAfterRender = (env.chart.addSeries as ReturnType<typeof vi.fn>).mock.calls.length;

        layer.setAvailableHeight(471); // same 5 panes, 66px each

        expect(factorOf(env.panes, 1)).toBe(66);
        // No teardown/rebuild: ResizeObserver fires on every drag frame.
        expect((env.chart.addSeries as ReturnType<typeof vi.fn>).mock.calls.length).toBe(seriesCallsAfterRender);
    });

    it("renders collapsed indicator as materialized strip without series", () => {
        const onPanesChanged = vi.fn();
        const layer = new IndicatorLayer(env.chart, getColor, null, onPanesChanged);
        layer.setAvailableHeight(1000);
        Object.assign(indicatorState, makeState({
            rsi: { ...on({ length: 14, source: "close" }), visible: false },
        }));
        layer.render(makeRows(60));

        // Pane 2 must exist even though no series is created on it —
        // otherwise a collapsed pane between open ones shifts indices.
        expect(env.panes[2]).toBeTruthy();
        // Strip height = 16px, expressed as stretch factor.
        expect(factorOf(env.panes, 2)).toBe(16);
        // Only volume got a series; rsi stays series-free while collapsed.
        expect(subPaneIndices(env.chart)).toEqual([1]);
        const lastCall = onPanesChanged.mock.calls[onPanesChanged.mock.calls.length - 1][0];
        expect(lastCall[1]).toMatchObject({ paneIndex: 2, key: "rsi", collapsed: true });
    });

    it("keeps the strip pane alive when its neighbors' series are removed", () => {
        const layer = new IndicatorLayer(env.chart, getColor);
        layer.setAvailableHeight(1000);
        Object.assign(indicatorState, makeState({
            rsi: { ...on({ length: 14, source: "close" }), visible: false },
        }));
        layer.render(makeRows(60));
        expect(env.panes[2]).toBeTruthy();

        // Teardown removes every managed series; the empty strip pane must
        // survive that cleanup (preserveEmptyPane), not be spliced out.
        for (const m of layer["managed"] as { series: unknown }[]) {
            env.chart.removeSeries(m.series as never);
        }
        expect(env.panes[2]).toBeTruthy();
    });

    it("keeps indices stable when a collapsed pane sits between open ones", () => {
        const onPanesChanged = vi.fn();
        const layer = new IndicatorLayer(env.chart, getColor, null, onPanesChanged);
        layer.setAvailableHeight(1000);
        Object.assign(indicatorState, makeState({
            rsi: { ...on({ length: 14, source: "close" }), visible: false },
            macd: on({ fastLength: 12, slowLength: 26, signalLength: 9, source: "close" }),
        }));
        layer.render(makeRows(60));

        // volume=1, rsi strip=2, macd=3 — the strip must not shift macd.
        // (macd reports twice: histogram + line share the same pane index.)
        expect(subPaneIndices(env.chart)).toEqual([1, 3, 3]);
        expect(factorOf(env.panes, 2)).toBe(16); // strip factor == 16px
        expect(factorOf(env.panes, 3)).not.toBeUndefined();
        const lastCall = onPanesChanged.mock.calls[onPanesChanged.mock.calls.length - 1][0];
        expect(lastCall.map((p: { paneIndex: number }) => p.paneIndex)).toEqual([1, 2, 3]);
        expect(lastCall[2]).toMatchObject({ paneIndex: 3, key: "macd", collapsed: false });
    });

    it("assigns heights in one stretch-factor pass after all panes materialize", () => {
        const layer = new IndicatorLayer(env.chart, getColor);
        layer.setAvailableHeight(1000);
        Object.assign(indicatorState, makeState({
            rsi: { ...on({ length: 14, source: "close" }), visible: false },
            macd: on({ fastLength: 12, slowLength: 26, signalLength: 9, source: "close" }),
        }));
        layer.render(makeRows(60));

        // Height must be set via setStretchFactor (setHeight rewrites the
        // factors of ALL panes from their current pixel heights, so
        // sequential calls perturb each other). Strips = 16, open panes =
        // layout height, and the candle pane absorbs the remainder.
        const stripFactor = (env.panes[2] as unknown as { stretchFactor: number }).stretchFactor;
        expect(stripFactor).toBe(16);
        const openFactor = factorOf(env.panes, 3);
        expect(openFactor).not.toBeUndefined();
        expect(factorOf(env.panes, 1)).toBe(openFactor);
        // 1 height call across the whole render: the single factor pass.
        expect((env.panes[1] as MockPane).setHeight).not.toHaveBeenCalled();
        expect((env.panes[3] as MockPane).setHeight).not.toHaveBeenCalled();
    });

    it("clears reported panes when the indicator layer is destroyed", () => {
        const onPanesChanged = vi.fn();
        const layer = new IndicatorLayer(env.chart, getColor, null, onPanesChanged);
        layer.setAvailableHeight(1000);
        layer.render(makeRows(60));
        onPanesChanged.mockClear();

        layer.destroy();

        expect(onPanesChanged).toHaveBeenCalledWith([]);
    });
});
