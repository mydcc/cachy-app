import { describe, it, expect, vi, beforeEach } from "vitest";
import type { IChartApi, ISeriesApi, IPaneApi, SeriesType, Time } from "lightweight-charts";
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

function makePane(index: number) {
    return {
        paneIndex: () => index,
        setHeight: vi.fn(),
        getSeries: () => [],
        attachPrimitive: vi.fn(),
        detachPrimitive: vi.fn(),
        priceScale: () => ({ width: () => 60 }),
    } as unknown as IPaneApi<Time>;
}

function makeChart() {
    const panes = [makePane(0)];
    const chart = {
        addSeries: vi.fn(() => makeSeries()),
        removeSeries: vi.fn(),
        removePane: vi.fn(),
        panes: () => panes,
        applyOptions: vi.fn(),
        timeScale: () => ({ applyOptions: vi.fn(), fitContent: vi.fn() }),
        priceScale: () => ({ width: () => 60 }),
    } as unknown as IChartApi<Time>;
    return { chart, panes };
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
        bb: { ...off(), length: 20, stdDev: 2 },
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

        // Volume is the only sub-pane (it is not behind an enabled toggle here),
        // and no oscillator sub-panes should be allocated.
        expect(subPaneIndices(env.chart).length).toBe(1);
    });
});
