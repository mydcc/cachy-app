import type {
    IChartApi,
    IPriceLine,
    ISeriesApi,
    UTCTimestamp,
} from "lightweight-charts";
import { LineSeries, HistogramSeries } from "lightweight-charts";
import { JSIndicators, calculatePivotsFromValues } from "../../utils/indicators";
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
/** Height a sub-pane gets when there is room to spare. */
const PREFERRED_PANE_HEIGHT = 80;
/** Below this a sub-pane stops being readable, so panes are dropped instead. */
const MIN_PANE_HEIGHT = 56;
/** The candle pane never shrinks below this to make room for sub-panes. */
const PRICE_PANE_MIN = 140;

/** Height of a collapsed sub-pane strip: header row only, no chart content. */
const STRIP_HEIGHT = 26;

/** One currently-visible sub-pane, reported to the caller after each render. */
export interface IndicatorPaneInfo {
    paneIndex: number;
    key: string;
    titleKey: string;
    /** Settings shown next to the name, e.g. "14" or "12 26 9"; "" if none. */
    params: string;
    /** True when this pane renders as a collapsed strip (header only). */
    collapsed: boolean;
}

/**
 * Every indicator that can claim a sub-pane, in the order they claim them,
 * with the i18n key for its on-chart label.
 *
 * Single source of truth: both the pane budget (computeLayout) and the
 * renderer (renderSubPanes) decide "is this on?" through `isEnabled` over
 * this list, so the count and what actually gets drawn cannot drift apart.
 */
const SUB_PANES: { key: string; titleKey: string }[] = [
    { key: "volume", titleKey: "settings.technicals.volume" },
    { key: "rsi", titleKey: "settings.technicals.rsi.title" },
    { key: "macd", titleKey: "settings.technicals.macd.title" },
    { key: "stochRsi", titleKey: "settings.technicals.stochRsi.title" },
    { key: "cci", titleKey: "settings.technicals.cci" },
    { key: "momentum", titleKey: "settings.technicals.momentum" },
    { key: "williamsR", titleKey: "settings.technicals.williamsR" },
    { key: "obv", titleKey: "settings.technicals.obv" },
    { key: "mfi", titleKey: "settings.technicals.mfi" },
    { key: "adx", titleKey: "settings.technicals.adx" },
    { key: "ao", titleKey: "settings.technicals.awesomeOsc" },
    { key: "choppiness", titleKey: "settings.technicals.choppiness" },
    { key: "stochastic", titleKey: "settings.technicals.stochasticTitle" },
];

/**
 * Reads the same `enabled` field the Settings tab binds to. Settings is the
 * only place these are switched — the chart deliberately has no on/off
 * control, because a control living inside the pane it hides cannot be used
 * to bring that pane back.
 */
function isEnabled(key: string): boolean {
    const s = indicatorState as unknown as Record<string, { enabled?: boolean } | undefined>;
    const entry = s[key];
    return entry !== undefined && entry.enabled !== false;
}

/**
 * Reads the per-indicator `visible` flag, toggled by the pane header
 * chevron. Settings stays unaware of it: `enabled` decides whether an
 * indicator is computed at all (Technical Panel, alarms), `visible` only
 * whether the chart draws it as an open pane or as a collapsed strip.
 */
function isCollapsed(key: string): boolean {
    const s = indicatorState as unknown as Record<string, { visible?: boolean } | undefined>;
    const entry = s[key];
    return entry !== undefined && entry.visible === false;
}

interface PaneLayout {
    /** How many sub-panes are drawn (open panes + collapsed strips). */
    count: number;
    /** Height in px each OPEN pane gets (strips are always STRIP_HEIGHT). */
    height: number;
    /** How many of `count` are collapsed strips. */
    strips: number;
}

interface ManagedSeries {
    series: ISeriesApi<"Line"> | ISeriesApi<"Histogram">;
}

/**
 * Owns every indicator series drawn on top of the candlestick chart:
 * moving-average overlays on the price pane, and oscillator/volume sub-panes.
 *
 * Sub-panes auto-hide entirely when the chart window is too short to be
 * usable — the user endorsed this ("Sub-Panel automatisch ausblenden bei
 * geringer chartfenstergröße") so a tiny window never gets cluttered with
 * unusable mini-panes.
 *
 * Above that floor the panes share the space instead: what is switched on in
 * Settings gets drawn, shrinking together down to MIN_PANE_HEIGHT, and only
 * what cannot fit even at that height is dropped. Silently omitting an
 * indicator the user explicitly enabled is the last resort, not the default.
 */
export class IndicatorLayer {
    private chart: IChartApi;
    private getColor: ColorResolver;
    private candleSeries: ISeriesApi<"Candlestick"> | null;

    private managed: ManagedSeries[] = [];
    private createdPaneIndices: number[] = [];
    private priceLines: IPriceLine[] = [];
    private subPaneCursor = 1;
    private stripsClaimed = 0;
    private stripPaneIndices = new Set<number>();
    private overflowedKeys = new Set<string>();
    private availableHeight = MIN_CHART_HEIGHT;
    private lastRows: ChartRow[] | null = null;
    private onPanesChanged?: (panes: IndicatorPaneInfo[]) => void;
    private panesInfo: IndicatorPaneInfo[] = [];
    private layout: PaneLayout = { count: 0, height: PREFERRED_PANE_HEIGHT, strips: 0 };

    constructor(
        chart: IChartApi,
        getColor: ColorResolver,
        candleSeries?: ISeriesApi<"Candlestick"> | null,
        onPanesChanged?: (panes: IndicatorPaneInfo[]) => void,
    ) {
        this.chart = chart;
        this.getColor = getColor;
        this.candleSeries = candleSeries ?? null;
        this.onPanesChanged = onPanesChanged;
    }

    /**
     * Height of the chart container in CSS px.
     *
     * Resizing the window has to actually change the layout: the previous
     * version only re-rendered when the MIN_CHART_HEIGHT threshold was
     * crossed, so dragging a chart from 450px to 1200px added no panes at all
     * until the next full data render happened to come along.
     *
     * A changed pane *count* needs the full rebuild; a changed pane *height*
     * only needs setHeight on the panes that already exist. That split
     * matters because ResizeObserver fires continuously while dragging, and
     * tearing every series down on each of those frames visibly stutters.
     */
    setAvailableHeight(h: number): void {
        if (h === this.availableHeight) return;
        this.availableHeight = h;

        const next = this.computeLayout();
        const countChanged = next.count !== this.layout.count;
        const heightChanged = next.height !== this.layout.height;
        if (!countChanged && !heightChanged) return;

        if (countChanged && this.lastRows) {
            this.render(this.lastRows); // recomputes and stores the layout
            return;
        }
        this.layout = next;
        if (heightChanged) this.applyPaneHeights();
    }

    /** Re-apply theme by rebuilding from the last data set (fresh colors). */
    applyTheme(): void {
        if (this.lastRows) this.render(this.lastRows);
    }

    destroy(): void {
        this.teardown();
        this.lastRows = null;
        this.onPanesChanged?.(this.panesInfo);
    }

    // ---- public render -------------------------------------------------

    render(rows: ChartRow[]): void {
        this.lastRows = rows;
        this.teardown();
        if (rows.length === 0) {
            this.onPanesChanged?.(this.panesInfo);
            return;
        }
        this.layout = this.computeLayout();

        const closes = getSourceData(rows, "close");
        const opens = getSourceData(rows, "open");
        const highs = getSourceData(rows, "high");
        const lows = getSourceData(rows, "low");
        const volume = new Float64Array(rows.length);
        for (let i = 0; i < rows.length; i++) volume[i] = rows[i].volume;

        const ctx = { closes, opens, highs, lows, volume };
        this.renderOverlays(rows, ctx);
        this.renderSubPanes(rows, ctx);
        this.onPanesChanged?.(this.panesInfo);
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
        for (const pl of this.priceLines) {
            try {
                this.candleSeries?.removePriceLine(pl);
            } catch {
                /* price line may already be gone */
            }
        }
        this.priceLines = [];
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
        this.stripsClaimed = 0;
        this.stripPaneIndices.clear();
        this.overflowedKeys.clear();
        this.panesInfo = [];
    }

    // ---- helpers --------------------------------------------------------

    private recordPane(paneIndex: number, key: string, params: string): void {
        const titleKey = SUB_PANES.find((p) => p.key === key)?.titleKey;
        if (titleKey) this.panesInfo.push({ paneIndex, key, titleKey, params, collapsed: isCollapsed(key) });
    }

    private color(key: string, fallback: string): string {
        return this.getColor(key) || fallback;
    }

    /**
     * How many sub-panes fit and how tall each one gets, for the indicators
     * currently switched on in Settings. Collapsed panes reserve a strip of
     * STRIP_HEIGHT first; open panes share whatever budget is left over.
     */
    private computeLayout(): PaneLayout {
        const none: PaneLayout = { count: 0, height: PREFERRED_PANE_HEIGHT, strips: 0 };
        if (this.availableHeight < MIN_CHART_HEIGHT) return none;

        const enabled = SUB_PANES.filter((p) => isEnabled(p.key));
        if (enabled.length === 0) return none;

        const budget = this.availableHeight - PRICE_PANE_MIN;

        // Collapsed panes claim their strip first — a strip is the cheapest
        // thing we can show — then the open panes share what is left over.
        const collapsedCount = enabled.filter((p) => isCollapsed(p.key)).length;
        const stripCapacity = Math.floor(budget / STRIP_HEIGHT);
        const strips = Math.min(collapsedCount, stripCapacity);

        const remaining = budget - strips * STRIP_HEIGHT;
        const openWanted = enabled.length - collapsedCount;
        const capacity = Math.max(0, Math.floor(remaining / MIN_PANE_HEIGHT));
        const openCount = Math.min(openWanted, capacity);
        if (openCount === 0 && strips === 0) return none;

        const height = openCount
            ? Math.min(
                  PREFERRED_PANE_HEIGHT,
                  Math.max(MIN_PANE_HEIGHT, Math.floor(remaining / openCount)),
              )
            : PREFERRED_PANE_HEIGHT;
        return { count: openCount + strips, height, strips };
    }

    private applyPaneHeights(): void {
        for (const idx of this.createdPaneIndices) {
            if (this.stripPaneIndices.has(idx)) continue; // strips keep their STRIP_HEIGHT
            const pane = this.chart.panes()[idx];
            if (pane) pane.setHeight(this.layout.height);
        }
    }

    /**
     * Claims the next pane slot, honouring the two separate budgets from
     * computeLayout: collapsed indicators may only take strip slots, open
     * ones only open slots. Returns null once the matching budget is
     * exhausted — the indicator is then overflowed (dropped for now; a
     * taller window brings it back because the layout is a pure function).
     */
    private openSubPane(collapsed: boolean, key: string): number | null {
        const opensFit = this.layout.count - this.layout.strips;
        const opensClaimed = this.subPaneCursor - 1 - this.stripsClaimed;
        const outOfRoom = collapsed
            ? this.stripsClaimed >= this.layout.strips
            : opensClaimed >= opensFit;
        if (outOfRoom) {
            this.overflowedKeys.add(key);
            return null;
        }
        const idx = this.subPaneCursor++;
        this.createdPaneIndices.push(idx);
        if (collapsed) {
            this.stripsClaimed++;
            this.stripPaneIndices.add(idx);
            const pane = this.chart.panes()[idx];
            if (pane) pane.setHeight(STRIP_HEIGHT);
        }
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
        if (this.stripPaneIndices.has(idx)) return;
        const pane = this.chart.panes()[idx];
        if (pane) pane.setHeight(this.layout.height);
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

        // Pivot points (horizontal levels on the price pane, from prior bar)
        if (s.pivots && s.pivots.enabled !== false && this.candleSeries && rows.length >= 2) {
            const prev = rows[rows.length - 2];
            const res = calculatePivotsFromValues(
                prev.high,
                prev.low,
                prev.close,
                prev.open,
                s.pivots.type ?? "classic",
            );
            const lv = res.pivots.classic;
            const levels: Array<{ key: keyof typeof lv; title: string; primary: boolean }> = [
                { key: "r3", title: "R3", primary: false },
                { key: "r2", title: "R2", primary: false },
                { key: "r1", title: "R1", primary: false },
                { key: "p", title: "P", primary: true },
                { key: "s1", title: "S1", primary: false },
                { key: "s2", title: "S2", primary: false },
                { key: "s3", title: "S3", primary: false },
            ];
            for (const { key, title, primary } of levels) {
                const price = lv[key];
                if (typeof price !== "number" || Number.isNaN(price)) continue;
                const line = this.candleSeries.createPriceLine({
                    price,
                    title,
                    color: this.color(primary ? "--accent-color" : "--text-tertiary", primary ? "#2962ff" : "#9aa0a6"),
                    lineWidth: primary ? 2 : 1,
                    lineStyle: primary ? 0 : 2,
                    axisLabelVisible: true,
                });
                this.priceLines.push(line);
            }
        }

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
        if (s.bollingerBands.enabled !== false && s.bollingerBands.length && !isCollapsed("bollingerBands")) {
            const bb = JSIndicators.bb(a.closes, s.bollingerBands.length, s.bollingerBands.stdDev ?? 2);
            this.addLine(rows, bb.upper, P0, "--accent-color", "#2962ff", { lineWidth: 1 });
            this.addLine(rows, bb.middle, P0, "--text-tertiary", "#9aa0a6", { lineWidth: 1 });
            this.addLine(rows, bb.lower, P0, "--accent-color", "#2962ff", { lineWidth: 1 });
        }

        // VWAP (session/fixed anchored)
        if (s.vwap.enabled !== false && s.vwap.length && !isCollapsed("vwap")) {
            const times = rows.map((r) => Number(r.time) as UTCTimestamp);
            const vw = JSIndicators.vwap(a.highs, a.lows, a.closes, a.volume, times, {
                mode: s.vwap.anchor ?? "session",
            });
            this.addLine(rows, vw, P0, "--warning-color", "#ffb300");
        }

        // Ichimoku
        if (s.ichimoku.enabled !== false && !isCollapsed("ichimoku")) {
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
        if (s.superTrend.enabled !== false && s.superTrend.period && !isCollapsed("superTrend")) {
            const st = JSIndicators.superTrend(a.highs, a.lows, a.closes, s.superTrend.period, s.superTrend.factor ?? 3);
            this.addLine(rows, st.value, P0, "--accent-color", "#2962ff");
        }

        // Parabolic SAR
        if (s.parabolicSar.enabled !== false && !isCollapsed("parabolicSar")) {
            const ps = JSIndicators.psar(a.highs, a.lows, s.parabolicSar.start ?? 0.02, s.parabolicSar.increment ?? 0.02, s.parabolicSar.max ?? 0.2);
            this.addLine(rows, ps, P0, "--warning-color", "#ffb300", { lineWidth: 1 });
        }

        // ATR Trailing Stop (buy/sell)
        if (s.atrTrailingStop.enabled !== false && s.atrTrailingStop.period && !isCollapsed("atrTrailingStop")) {
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
        if (isEnabled("volume")) {
            const idxVol = this.openSubPane(isCollapsed("volume"), "volume");
            if (idxVol !== null) {
                if (!isCollapsed("volume")) this.addVolume(rows, idxVol);
                this.setPaneHeight(idxVol);
                this.recordPane(idxVol, "volume", "");
            }
        }

        // RSI
        if (isEnabled("rsi")) {
            const idx = this.openSubPane(isCollapsed("rsi"), "rsi");
            if (idx !== null) {
                const len = s.rsi.length ?? 14;
                if (!isCollapsed("rsi")) {
                    const d = getSourceData(rows, this.src(s.rsi.source));
                    this.addLine(rows, JSIndicators.rsi(d, len), idx, "--accent-color", "#2962ff");
                }
                this.setPaneHeight(idx);
                this.recordPane(idx, "rsi", `${len}`);
            }
        }

        // MACD
        if (isEnabled("macd")) {
            const idx = this.openSubPane(isCollapsed("macd"), "macd");
            if (idx !== null) {
                if (!isCollapsed("macd")) {
                    const d = getSourceData(rows, this.src(s.macd.source));
                    const m = JSIndicators.macd(d, s.macd.fastLength, s.macd.slowLength, s.macd.signalLength);
                    this.addLine(rows, m.macd, idx, "--accent-color", "#2962ff");
                    this.addLine(rows, m.signal, idx, "--warning-color", "#ffb300");
                }
                this.setPaneHeight(idx);
                this.recordPane(idx, "macd", `${s.macd.fastLength} ${s.macd.slowLength} ${s.macd.signalLength}`);
            }
        }

        // StochRSI
        if (isEnabled("stochRsi")) {
            const idx = this.openSubPane(isCollapsed("stochRsi"), "stochRsi");
            if (idx !== null) {
                const rsiPeriod = s.stochRsi.rsiLength || s.stochRsi.length || 14;
                if (!isCollapsed("stochRsi")) {
                    const d = getSourceData(rows, this.src(s.stochRsi.source));
                    const sr = JSIndicators.stochRsi(d, rsiPeriod, s.stochRsi.kPeriod, s.stochRsi.dPeriod, 3);
                    this.addLine(rows, sr.k, idx, "--accent-color", "#2962ff");
                    this.addLine(rows, sr.d, idx, "--warning-color", "#ffb300");
                }
                this.setPaneHeight(idx);
                this.recordPane(idx, "stochRsi", `${rsiPeriod} ${s.stochRsi.kPeriod} ${s.stochRsi.dPeriod}`);
            }
        }

        // CCI
        if (isEnabled("cci")) {
            const idx = this.openSubPane(isCollapsed("cci"), "cci");
            if (idx !== null) {
                const len = s.cci.length ?? 20;
                if (!isCollapsed("cci")) {
                    const d = getSourceData(rows, this.src(s.cci.source));
                    this.addLine(rows, JSIndicators.cci(d, len), idx, "--accent-color", "#2962ff");
                }
                this.setPaneHeight(idx);
                this.recordPane(idx, "cci", `${len}`);
            }
        }

        // Momentum
        if (isEnabled("momentum")) {
            const idx = this.openSubPane(isCollapsed("momentum"), "momentum");
            if (idx !== null) {
                const len = s.momentum.length ?? 10;
                if (!isCollapsed("momentum")) {
                    const d = getSourceData(rows, this.src(s.momentum.source));
                    this.addLine(rows, JSIndicators.mom(d, len), idx, "--success-color", "#26a69a");
                }
                this.setPaneHeight(idx);
                this.recordPane(idx, "momentum", `${len}`);
            }
        }

        // Williams %R
        if (isEnabled("williamsR")) {
            const idx = this.openSubPane(isCollapsed("williamsR"), "williamsR");
            if (idx !== null) {
                const len = s.williamsR.length ?? 14;
                if (!isCollapsed("williamsR")) {
                    this.addLine(
                        rows,
                        JSIndicators.williamsR(a.highs, a.lows, a.closes, len),
                        idx,
                        "--danger-color",
                        "#ef5350",
                    );
                }
                this.setPaneHeight(idx);
                this.recordPane(idx, "williamsR", `${len}`);
            }
        }

        // OBV
        if (isEnabled("obv")) {
            const idx = this.openSubPane(isCollapsed("obv"), "obv");
            if (idx !== null) {
                if (!isCollapsed("obv"))
                    this.addLine(rows, JSIndicators.obv(a.closes, a.volume), idx, "--text-tertiary", "#9aa0a6");
                this.setPaneHeight(idx);
                this.recordPane(idx, "obv", "");
            }
        }

        // MFI
        if (isEnabled("mfi")) {
            const idx = this.openSubPane(isCollapsed("mfi"), "mfi");
            if (idx !== null) {
                const len = s.mfi.length ?? 14;
                if (!isCollapsed("mfi")) {
                    this.addLine(
                        rows,
                        JSIndicators.mfi(a.highs, a.lows, a.closes, a.volume, len),
                        idx,
                        "--accent-color",
                        "#2962ff",
                    );
                }
                this.setPaneHeight(idx);
                this.recordPane(idx, "mfi", `${len}`);
            }
        }

        // ADX
        if (isEnabled("adx")) {
            const idx = this.openSubPane(isCollapsed("adx"), "adx");
            if (idx !== null) {
                const len = s.adx.diLength ?? s.adx.adxSmoothing ?? 14;
                if (!isCollapsed("adx")) {
                    this.addLine(
                        rows,
                        JSIndicators.adx(a.highs, a.lows, a.closes, len),
                        idx,
                        "--accent-color",
                        "#2962ff",
                    );
                }
                this.setPaneHeight(idx);
                this.recordPane(idx, "adx", `${len}`);
            }
        }

        // Awesome Oscillator
        if (isEnabled("ao")) {
            const idx = this.openSubPane(isCollapsed("ao"), "ao");
            if (idx !== null) {
                const fast = s.ao.fastLength ?? 5;
                const slow = s.ao.slowLength ?? 34;
                if (!isCollapsed("ao")) {
                    const ao = JSIndicators.ao(a.highs, a.lows, fast, slow);
                    this.addLine(rows, ao, idx, "--warning-color", "#ffb300");
                }
                this.setPaneHeight(idx);
                this.recordPane(idx, "ao", `${fast} ${slow}`);
            }
        }

        // Choppiness
        if (isEnabled("choppiness")) {
            const idx = this.openSubPane(isCollapsed("choppiness"), "choppiness");
            if (idx !== null) {
                const len = s.choppiness.length ?? 14;
                if (!isCollapsed("choppiness")) {
                    this.addLine(
                        rows,
                        JSIndicators.choppiness(a.highs, a.lows, a.closes, len),
                        idx,
                        "--text-tertiary",
                        "#9aa0a6",
                    );
                }
                this.setPaneHeight(idx);
                this.recordPane(idx, "choppiness", `${len}`);
            }
        }

        // Stochastic
        if (isEnabled("stochastic")) {
            const idx = this.openSubPane(isCollapsed("stochastic"), "stochastic");
            if (idx !== null) {
                const kPeriod = s.stochastic.kPeriod ?? 14;
                const dPeriod = s.stochastic.dPeriod ?? 3;
                if (!isCollapsed("stochastic")) {
                    const k = JSIndicators.stoch(a.highs, a.lows, a.closes, kPeriod);
                    const d = JSIndicators.sma(k, dPeriod);
                    this.addLine(rows, k, idx, "--accent-color", "#2962ff");
                    this.addLine(rows, d, idx, "--warning-color", "#ffb300");
                }
                this.setPaneHeight(idx);
                this.recordPane(idx, "stochastic", `${kPeriod} ${dPeriod}`);
            }
        }
    }

    /** Re-runs render with the last rows; used when `visible` flags change. */
    refresh(): void {
        if (this.lastRows) this.render(this.lastRows);
    }
}
