import type {
    IChartApi,
    ISeriesApi,
    UTCTimestamp,
} from "lightweight-charts";
import { LineSeries, HistogramSeries } from "lightweight-charts";
import { JSIndicators } from "../../utils/indicators";
import { indicatorState } from "../../stores/indicator.svelte";
import {
    type ChartRow,
    type SourceKind,
    getSourceData,
    zipToLine,
    buildVolumeData,
} from "./seriesMap";

type ColorResolver = (name: string) => string | null;

const MIN_CHART_HEIGHT = 360;
const MIN_PANE_HEIGHT = 80;
const PRICE_PANE_RESERVED = 140;

interface ManagedSeries {
    series: ISeriesApi<"Line"> | ISeriesApi<"Histogram">;
}

/**
 * Owns every indicator series drawn on top of the candlestick chart:
 * moving-average overlays on the price pane, and oscillator/volume sub-panes.
 *
 * Sub-panes auto-hide when the chart window is too short to be usable — the
 * user endorsed this ("Sub-Panel automatisch ausblenden bei geringer
 * chartfenstergröße") so a tiny window never gets cluttered with unusable
 * mini-panes. Priority order decides which panes survive when height is scarce.
 */
export class IndicatorLayer {
    private chart: IChartApi;
    private getColor: ColorResolver;

    private managed: ManagedSeries[] = [];
    private createdPaneIndices: number[] = [];
    private subPaneCursor = 1;
    private availableHeight = MIN_CHART_HEIGHT;
    private lastRows: ChartRow[] | null = null;

    constructor(chart: IChartApi, getColor: ColorResolver) {
        this.chart = chart;
        this.getColor = getColor;
    }

    /** Height of the chart container in CSS px; triggers re-render on compact change. */
    setAvailableHeight(h: number): void {
        const wasCompact = this.availableHeight < MIN_CHART_HEIGHT;
        this.availableHeight = h;
        const isCompact = h < MIN_CHART_HEIGHT;
        if (wasCompact !== isCompact && this.lastRows) {
            this.render(this.lastRows);
        }
    }

    /** Re-apply theme by rebuilding from the last data set (fresh colors). */
    applyTheme(): void {
        if (this.lastRows) this.render(this.lastRows);
    }

    destroy(): void {
        this.teardown();
        this.lastRows = null;
    }

    // ---- public render -------------------------------------------------

    render(rows: ChartRow[]): void {
        this.lastRows = rows;
        this.teardown();
        if (rows.length === 0) return;

        const closes = getSourceData(rows, "close");
        const opens = getSourceData(rows, "open");
        const highs = getSourceData(rows, "high");
        const lows = getSourceData(rows, "low");
        const volume = new Float64Array(rows.length);
        for (let i = 0; i < rows.length; i++) volume[i] = rows[i].volume;

        const ctx = { closes, opens, highs, lows, volume };
        this.renderOverlays(rows, ctx);
        this.renderSubPanes(rows, ctx);
    }

    // ---- teardown -------------------------------------------------------

    private teardown(): void {
        for (const m of this.managed) {
            try {
                this.chart.removeSeries(m.series);
            } catch {
                /* series may already be gone */
            }
        }
        this.managed = [];
        const indices = [...this.createdPaneIndices].sort((a, b) => b - a);
        for (const idx of indices) {
            try {
                this.chart.removePane(idx);
            } catch {
                /* pane already removed */
            }
        }
        this.createdPaneIndices = [];
        this.subPaneCursor = 1;
    }

    // ---- helpers --------------------------------------------------------

    private color(key: string, fallback: string): string {
        return this.getColor(key) || fallback;
    }

    private canAddSubPane(): boolean {
        if (this.availableHeight < MIN_CHART_HEIGHT) return false;
        const used = (this.subPaneCursor - 1) * MIN_PANE_HEIGHT;
        const remaining = this.availableHeight - PRICE_PANE_RESERVED - used;
        return remaining >= MIN_PANE_HEIGHT;
    }

    private openSubPane(): number | null {
        if (!this.canAddSubPane()) return null;
        const idx = this.subPaneCursor++;
        this.createdPaneIndices.push(idx);
        return idx;
    }

    private addLine(
        rows: ChartRow[],
        values: ArrayLike<number>,
        paneIndex: number,
        colorKey: string,
        fallback: string,
        opts: Record<string, unknown> = {},
    ): void {
        const series = this.chart.addSeries(
            LineSeries,
            {
                color: this.color(colorKey, fallback),
                priceLineVisible: false,
                crosshairMarkerVisible: false,
                ...opts,
            } as never,
            paneIndex,
        );
        series.setData(zipToLine(values, rows) as never);
        this.managed.push({ series: series as ISeriesApi<"Line"> });
    }

    private addVolume(rows: ChartRow[], paneIndex: number): void {
        const up = this.color("--success-color", "#26a69a");
        const down = this.color("--danger-color", "#ef5350");
        const series = this.chart.addSeries(
            HistogramSeries,
            {
                priceFormat: { type: "volume" },
                priceLineVisible: false,
                crosshairMarkerVisible: false,
            } as never,
            paneIndex,
        );
        series.setData(buildVolumeData(rows, up, down) as never);
        this.managed.push({ series: series as ISeriesApi<"Histogram"> });
    }

    private setPaneHeight(idx: number): void {
        const pane = this.chart.panes()[idx];
        if (pane) pane.setHeight(MIN_PANE_HEIGHT);
    }

    private src(source?: string): SourceKind {
        return (source as SourceKind) || "close";
    }

    // ---- overlays (price pane, shared right scale) ----------------------

    private renderOverlays(
        rows: ChartRow[],
        a: {
            closes: Float64Array;
            opens: Float64Array;
            highs: Float64Array;
            lows: Float64Array;
            volume: Float64Array;
        },
    ): void {
        const s = indicatorState;
        const P0 = 0;

        // EMA (1-3)
        if (s.ema.enabled !== false) {
            const srcE = this.src(s.ema.source);
            const dE = getSourceData(rows, srcE);
            if (s.ema.ema1?.length)
                this.addLine(rows, JSIndicators.ema(dE, s.ema.ema1.length), P0, "--success-color", "#26a69a");
            if (s.ema.ema2?.length)
                this.addLine(rows, JSIndicators.ema(dE, s.ema.ema2.length), P0, "--danger-color", "#ef5350");
            if (s.ema.ema3?.length)
                this.addLine(rows, JSIndicators.ema(dE, s.ema.ema3.length), P0, "--warning-color", "#ffb300");
        }

        // SMA (1-3)
        if (s.sma.enabled !== false) {
            if (s.sma.sma1?.length)
                this.addLine(rows, JSIndicators.sma(a.closes, s.sma.sma1.length), P0, "--success-color", "#26a69a");
            if (s.sma.sma2?.length)
                this.addLine(rows, JSIndicators.sma(a.closes, s.sma.sma2.length), P0, "--danger-color", "#ef5350");
            if (s.sma.sma3?.length)
                this.addLine(rows, JSIndicators.sma(a.closes, s.sma.sma3.length), P0, "--warning-color", "#ffb300");
        }

        // WMA / HMA / VWMA
        if (s.wma.enabled !== false && s.wma.length)
            this.addLine(rows, JSIndicators.wma(a.closes, s.wma.length), P0, "--accent-color", "#2962ff");
        if (s.hma.enabled !== false && s.hma.length)
            this.addLine(rows, JSIndicators.hma(a.closes, s.hma.length), P0, "--text-tertiary", "#9aa0a6");
        if (s.vwma.enabled !== false && s.vwma.length)
            this.addLine(
                rows,
                JSIndicators.vwma(a.closes, a.volume, s.vwma.length),
                P0,
                "--text-secondary",
                "#d1d4dc",
            );

        // Bollinger Bands
        if (s.bb.enabled !== false && s.bb.length) {
            const bb = JSIndicators.bb(a.closes, s.bb.length, s.bb.stdDev ?? 2);
            this.addLine(rows, bb.upper, P0, "--accent-color", "#2962ff", { lineWidth: 1 });
            this.addLine(rows, bb.middle, P0, "--text-tertiary", "#9aa0a6", { lineWidth: 1 });
            this.addLine(rows, bb.lower, P0, "--accent-color", "#2962ff", { lineWidth: 1 });
        }

        // VWAP (session/fixed anchored)
        if (s.vwap.enabled !== false && s.vwap.length) {
            const times = rows.map((r) => Number(r.time) as UTCTimestamp);
            const vw = JSIndicators.vwap(a.highs, a.lows, a.closes, a.volume, times, {
                mode: s.vwap.anchor ?? "session",
            });
            this.addLine(rows, vw, P0, "--warning-color", "#ffb300");
        }

        // Ichimoku
        if (s.ichimoku.enabled !== false) {
            const ich = JSIndicators.ichimoku(
                a.highs,
                a.lows,
                s.ichimoku.conversionPeriod,
                s.ichimoku.basePeriod,
                s.ichimoku.spanBPeriod,
                0,
            );
            this.addLine(rows, ich.conversion, P0, "--accent-color", "#2962ff", { lineWidth: 1 });
            this.addLine(rows, ich.base, P0, "--danger-color", "#ef5350", { lineWidth: 1 });
            this.addLine(rows, ich.spanA, P0, "--success-color", "#26a69a", { lineWidth: 1 });
            this.addLine(rows, ich.spanB, P0, "--warning-color", "#ffb300", { lineWidth: 1 });
        }

        // SuperTrend
        if (s.superTrend.enabled !== false && s.superTrend.period) {
            const st = JSIndicators.superTrend(a.highs, a.lows, a.closes, s.superTrend.period, s.superTrend.factor ?? 3);
            this.addLine(rows, st.value, P0, "--accent-color", "#2962ff");
        }

        // Parabolic SAR
        if (s.parabolicSar.enabled !== false) {
            const ps = JSIndicators.psar(a.highs, a.lows, s.parabolicSar.start ?? 0.02, s.parabolicSar.increment ?? 0.02, s.parabolicSar.max ?? 0.2);
            this.addLine(rows, ps, P0, "--warning-color", "#ffb300", { lineWidth: 1 });
        }

        // ATR Trailing Stop (buy/sell)
        if (s.atrTrailingStop.enabled !== false && s.atrTrailingStop.period) {
            const ats = JSIndicators.atrTrailingStop(
                a.highs,
                a.lows,
                a.closes,
                s.atrTrailingStop.period,
                s.atrTrailingStop.multiplier ?? 3,
            );
            this.addLine(rows, ats.buyStop, P0, "--success-color", "#26a69a", { lineWidth: 1 });
            this.addLine(rows, ats.sellStop, P0, "--danger-color", "#ef5350", { lineWidth: 1 });
        }
    }

    // ---- sub-panes (oscillators / volume) -------------------------------

    private renderSubPanes(
        rows: ChartRow[],
        a: {
            closes: Float64Array;
            opens: Float64Array;
            highs: Float64Array;
            lows: Float64Array;
            volume: Float64Array;
        },
    ): void {
        const s = indicatorState;

        // Volume pane (highest priority; shown whenever there is room).
        const idxVol = this.openSubPane();
        if (idxVol !== null) {
            this.addVolume(rows, idxVol);
            this.setPaneHeight(idxVol);
        }

        // RSI
        if (s.rsi.enabled !== false) {
            const idx = this.openSubPane();
            if (idx !== null) {
                const d = getSourceData(rows, this.src(s.rsi.source));
                this.addLine(rows, JSIndicators.rsi(d, s.rsi.length ?? 14), idx, "--accent-color", "#2962ff");
                this.setPaneHeight(idx);
            }
        }

        // MACD
        if (s.macd.enabled !== false) {
            const idx = this.openSubPane();
            if (idx !== null) {
                const d = getSourceData(rows, this.src(s.macd.source));
                const m = JSIndicators.macd(d, s.macd.fastLength, s.macd.slowLength, s.macd.signalLength);
                this.addLine(rows, m.macd, idx, "--accent-color", "#2962ff");
                this.addLine(rows, m.signal, idx, "--warning-color", "#ffb300");
                this.setPaneHeight(idx);
            }
        }

        // StochRSI
        if (s.stochRsi.enabled !== false) {
            const idx = this.openSubPane();
            if (idx !== null) {
                const d = getSourceData(rows, this.src(s.stochRsi.source));
                const rsiPeriod = s.stochRsi.rsiLength || s.stochRsi.length || 14;
                const sr = JSIndicators.stochRsi(d, rsiPeriod, s.stochRsi.kPeriod, s.stochRsi.dPeriod, 3);
                this.addLine(rows, sr.k, idx, "--accent-color", "#2962ff");
                this.addLine(rows, sr.d, idx, "--warning-color", "#ffb300");
                this.setPaneHeight(idx);
            }
        }

        // CCI
        if (s.cci.enabled !== false) {
            const idx = this.openSubPane();
            if (idx !== null) {
                const d = getSourceData(rows, this.src(s.cci.source));
                this.addLine(rows, JSIndicators.cci(d, s.cci.length ?? 20), idx, "--accent-color", "#2962ff");
                this.setPaneHeight(idx);
            }
        }

        // Momentum
        if (s.momentum.enabled !== false) {
            const idx = this.openSubPane();
            if (idx !== null) {
                const d = getSourceData(rows, this.src(s.momentum.source));
                this.addLine(rows, JSIndicators.mom(d, s.momentum.length ?? 10), idx, "--success-color", "#26a69a");
                this.setPaneHeight(idx);
            }
        }

        // Williams %R
        if (s.williamsR.enabled !== false) {
            const idx = this.openSubPane();
            if (idx !== null) {
                this.addLine(
                    rows,
                    JSIndicators.williamsR(a.highs, a.lows, a.closes, s.williamsR.length ?? 14),
                    idx,
                    "--danger-color",
                    "#ef5350",
                );
                this.setPaneHeight(idx);
            }
        }

        // OBV
        if (s.obv.enabled !== false) {
            const idx = this.openSubPane();
            if (idx !== null) {
                this.addLine(rows, JSIndicators.obv(a.closes, a.volume), idx, "--text-tertiary", "#9aa0a6");
                this.setPaneHeight(idx);
            }
        }

        // MFI
        if (s.mfi.enabled !== false) {
            const idx = this.openSubPane();
            if (idx !== null) {
                this.addLine(
                    rows,
                    JSIndicators.mfi(a.highs, a.lows, a.closes, a.volume, s.mfi.length ?? 14),
                    idx,
                    "--accent-color",
                    "#2962ff",
                );
                this.setPaneHeight(idx);
            }
        }

        // ADX
        if (s.adx.enabled !== false) {
            const idx = this.openSubPane();
            if (idx !== null) {
                this.addLine(
                    rows,
                    JSIndicators.adx(a.highs, a.lows, a.closes, s.adx.diLength ?? s.adx.adxSmoothing ?? 14),
                    idx,
                    "--accent-color",
                    "#2962ff",
                );
                this.setPaneHeight(idx);
            }
        }

        // Awesome Oscillator
        if (s.ao.enabled !== false) {
            const idx = this.openSubPane();
            if (idx !== null) {
                const ao = JSIndicators.ao(a.highs, a.lows, s.ao.fastLength ?? 5, s.ao.slowLength ?? 34);
                this.addLine(rows, ao, idx, "--warning-color", "#ffb300");
                this.setPaneHeight(idx);
            }
        }

        // Choppiness
        if (s.choppiness.enabled !== false) {
            const idx = this.openSubPane();
            if (idx !== null) {
                this.addLine(
                    rows,
                    JSIndicators.choppiness(a.highs, a.lows, a.closes, s.choppiness.length ?? 14),
                    idx,
                    "--text-tertiary",
                    "#9aa0a6",
                );
                this.setPaneHeight(idx);
            }
        }

        // Stochastic
        if (s.stochastic.enabled !== false) {
            const idx = this.openSubPane();
            if (idx !== null) {
                const k = JSIndicators.stoch(a.highs, a.lows, a.closes, s.stochastic.kPeriod ?? 14);
                const d = JSIndicators.sma(k, s.stochastic.dPeriod ?? 3);
                this.addLine(rows, k, idx, "--accent-color", "#2962ff");
                this.addLine(rows, d, idx, "--warning-color", "#ffb300");
                this.setPaneHeight(idx);
            }
        }
    }
}
