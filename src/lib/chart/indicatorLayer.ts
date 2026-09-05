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
const STRIP_HEIGHT = 20;

/** One currently-visible sub-pane, reported to the caller after each render. */
export interface IndicatorPaneInfo {
    paneIndex: number;
    key: string;
    titleKey: string;
    /** Settings shown next to the name, e.g. "14" or "12 26 9"; "" if none. */
    params: string;
    /** Last indicator value, e.g. "70.12" — readable even when collapsed. */
    value: string;
    /** True when this pane renders as a collapsed strip (header only). */
    collapsed: boolean;
}

/**
 * Every indicator that can claim a sub-pane, in the order they claim them,
 * with the i18n key for its on-chart label.
 *
 * Single source of truth: both the pane budget (computeLayout) and the
 * renderer (renderSubPanes) decide "is this on?" through `isPaneActive`
 * over this list, so the count and what actually gets drawn cannot drift
 * apart.
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

/**
 * Reads the per-indicator `showInChart` flag, toggled in the Technicals
 * settings "Chart" tab. This decides whether the chart draws the sub-pane
 * at all — independent of `enabled` (which keeps driving computation,
 * Technicals panel and alarms) and `visible` (open pane vs collapsed
 * strip). Missing on old stored entries means shown.
 */
function isShownInChart(key: string): boolean {
    const s = indicatorState as unknown as Record<string, { showInChart?: boolean } | undefined>;
    return s[key]?.showInChart !== false;
}

/**
 * Master gate for chart sub-panes: enabled for calculation AND opted into
 * chart display. A hidden pane claims no pane index, draws no series and
 * reports nothing — while the indicator itself keeps calculating.
 */
function isPaneActive(key: string): boolean {
    return isEnabled(key) && isShownInChart(key);
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
     *
     * Stretch factors encode absolute px sizes for the pixel area they were
     * computed for, so even an unchanged layout needs a re-apply when the
     * area itself changed (e.g. growing the window while open panes already
     * sit at the capped height): without it the stale factors scale every
     * pane up proportionally and collapsed strips grow past 20px.
     */
    setAvailableHeight(h: number): void {
        if (h === this.availableHeight) return;
        this.availableHeight = h;

        const next = this.computeLayout();
        const countChanged = next.count !== this.layout.count;
        const heightChanged = next.height !== this.layout.height;
        if (!countChanged && !heightChanged) {
            // Same layout, new pixel area: re-apply so absolute sizes
            // (especially the 20px strips) survive the resize. Cheap —
            // only setStretchFactor calls, no teardown or rebuild.
            this.applyPaneHeights();
            return;
        }

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
        // All panes now exist — set final heights AFTER materialization,
        // otherwise strip heights set during claiming are diluted away by
        // lightweight-charts' stretch-factor redistribution.
        this.applyPaneHeights();
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
        this.panesInfo = [];
    }

    // ---- helpers --------------------------------------------------------

    private recordPane(paneIndex: number, key: string, params: string, value = ""): void {
        const titleKey = SUB_PANES.find((p) => p.key === key)?.titleKey;
        if (titleKey) this.panesInfo.push({ paneIndex, key, titleKey, params, value, collapsed: isCollapsed(key) });
    }

    /** Last finite value of an indicator series, formatted for the pane header. */
    private lastValue(values: ArrayLike<number>): string {
        for (let i = values.length - 1; i >= 0; i--) {
            const v = values[i];
            if (Number.isFinite(v)) return v.toFixed(2);
        }
        return "";
    }

    private color(key: string, fallback: string): string {
        return this.getColor(key) || fallback;
    }

    /**
     * Recompute the pane-header values for a live tick without rebuilding
     * panes. render()'s values are a snapshot of the last full render, so on
     * a fast live update they would go stale — dangerous for a trading
     * readout. The caller passes the current tick's OHLCV, which is merged
     * into the last stored row before every visible sub-pane indicator is
     * recomputed and re-reported so headers remount with fresh values.
     * Series data itself is NOT touched here; the caller updates the candle
     * series separately.
     */
    updateHeaderValues(tick: { open: number; high: number; low: number; close: number; volume: number }): void {
        const rows = this.lastRows;
        if (!rows || rows.length === 0 || this.panesInfo.length === 0) return;
        // Merge the live tick into the stored last row: lastRows is frozen
        // at the last full render, so recomputing from it verbatim would
        // produce the same value every tick.
        const last = rows[rows.length - 1];
        last.open = tick.open;
        last.high = tick.high;
        last.low = tick.low;
        last.close = tick.close;
        last.volume = tick.volume;
        const a = {
            closes: getSourceData(rows, "close"),
            opens: getSourceData(rows, "open"),
            highs: getSourceData(rows, "high"),
            lows: getSourceData(rows, "low"),
            volume: new Float64Array(rows.length),
        };
        for (let i = 0; i < rows.length; i++) a.volume[i] = rows[i].volume;
        const s = indicatorState;
        for (const info of this.panesInfo) {
            switch (info.key) {
                case "rsi":
                    info.value = this.lastValue(JSIndicators.rsi(a.closes, s.rsi.length ?? 14));
                    break;
                case "macd": {
                    const m = JSIndicators.macd(
                        a.closes,
                        s.macd.fastLength,
                        s.macd.slowLength,
                        s.macd.signalLength,
                    );
                    info.value = this.lastValue(m.macd);
                    break;
                }
                case "stochRsi": {
                    const p = s.stochRsi;
                    const sr = JSIndicators.stochRsi(a.closes, p.rsiLength || p.length || 14, p.kPeriod, p.dPeriod, 3);
                    info.value = this.lastValue(sr.k);
                    break;
                }
                case "cci":
                    info.value = this.lastValue(JSIndicators.cci(a.closes, s.cci.length ?? 20));
                    break;
                case "momentum":
                    info.value = this.lastValue(JSIndicators.mom(a.closes, s.momentum.length ?? 10));
                    break;
                case "williamsR":
                    info.value = this.lastValue(JSIndicators.williamsR(a.highs, a.lows, a.closes, s.williamsR.length ?? 14));
                    break;
                case "obv":
                    info.value = this.lastValue(JSIndicators.obv(a.closes, a.volume));
                    break;
                case "mfi":
                    info.value = this.lastValue(JSIndicators.mfi(a.highs, a.lows, a.closes, a.volume, s.mfi.length ?? 14));
                    break;
                case "adx":
                    info.value = this.lastValue(JSIndicators.adx(a.highs, a.lows, a.closes, s.adx.diLength ?? s.adx.adxSmoothing ?? 14));
                    break;
                case "ao":
                    info.value = this.lastValue(JSIndicators.ao(a.highs, a.lows, s.ao.fastLength ?? 5, s.ao.slowLength ?? 34));
                    break;
                case "choppiness":
                    info.value = this.lastValue(JSIndicators.choppiness(a.highs, a.lows, a.closes, s.choppiness.length ?? 14));
                    break;
                case "stochastic": {
                    const k = JSIndicators.stoch(a.highs, a.lows, a.closes, s.stochastic.kPeriod ?? 14);
                    info.value = this.lastValue(k);
                    break;
                }
            }
        }
        this.onPanesChanged?.(this.panesInfo);
    }

    /**
     * How many sub-panes fit and how tall each one gets, for the indicators
     * currently switched on in Settings. Collapsed panes reserve a strip of
     * STRIP_HEIGHT first; open panes share whatever budget is left over.
     */
    private computeLayout(): PaneLayout {
        const none: PaneLayout = { count: 0, height: PREFERRED_PANE_HEIGHT, strips: 0 };
        if (this.availableHeight < MIN_CHART_HEIGHT) return none;

        const enabled = SUB_PANES.filter((p) => isPaneActive(p.key));
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
        // setHeight() routes through changePanesHeight, which rewrites the
        // stretch factors of ALL panes from their current pixel heights —
        // sequential setHeight calls perturb each other, so a strip can
        // never end up at 30px that way. The layout pass itself is purely
        // stretch-factor based (paneHeight = factor * paneArea /
        // totalStretch, with the sum of heights conserved), so every
        // pane's target height is expressed as a factor and applied in ONE
        // pass: strips 30px, open panes layout.height, the candle pane
        // absorbs the remainder. setStretchFactor touches no neighbor, so
        // order does not matter.
        const panes = this.chart.panes();
        if (panes.length < 2) return;

        const stripCount = this.stripPaneIndices.size;
        const openCount = this.createdPaneIndices.length - stripCount;
        const subTotal = stripCount * STRIP_HEIGHT + openCount * this.layout.height;
        if (subTotal === 0) return;

        // The pane area in px is conserved by lightweight-charts, but pane
        // heights read via getHeight() are stale right after panes were
        // materialized (the widget layout recalc runs asynchronously), so
        // the area is derived deterministically instead: the chart's
        // container height minus the time axis and the pane separators.
        let paneArea = this.availableHeight - this.chart.timeScale().height();
        if (panes.length > 1) paneArea -= panes.length - 1; // separators
        panes[0].setStretchFactor(Math.max(PRICE_PANE_MIN, paneArea - subTotal));
        for (const idx of this.createdPaneIndices) {
            const pane = panes[idx];
            if (!pane) continue;
            pane.setStretchFactor(this.stripPaneIndices.has(idx) ? STRIP_HEIGHT : this.layout.height);
        }
        this.lockStripSeparators(panes);
    }

    /**
     * A collapsed strip is fixed-height — the drag handles of the
     * separators directly above and below a strip must not let the user
     * resize it. lightweight-charts has no per-separator switch (only the
     * global layout.panes.enableResize), so pointer events on those
     * separator cells are disabled instead. Separator k sits between pane
     * k and pane k+1; its cell is the td[colspan] LWC renders.
     */
    private lockStripSeparators(panes: readonly unknown[]): void {
        const firstPane = panes[0] as { getHTMLElement?: () => HTMLElement } | undefined;
        const table = firstPane?.getHTMLElement?.().closest("table");
        if (!table) return;
        const cells = table.querySelectorAll<HTMLTableCellElement>("td[colspan]");
        const isStrip = (idx: number) => this.stripPaneIndices.has(idx);
        cells.forEach((cell, k) => {
            if (isStrip(k) || isStrip(k + 1)) {
                cell.style.pointerEvents = "none";
            } else if (cell.style.pointerEvents === "none") {
                cell.style.pointerEvents = "";
            }
        });
    }

    /**
     * Claims the next pane slot, honouring the two separate budgets from
     * computeLayout: collapsed indicators may only take strip slots, open
     * ones only open slots. Returns null once the matching budget is
     * exhausted — the indicator is then overflowed (dropped for now; a
     * taller window brings it back because the layout is a pure function).
     */
    private openSubPane(collapsed: boolean, _key: string): number | null {
        const opensFit = this.layout.count - this.layout.strips;
        const opensClaimed = this.subPaneCursor - 1 - this.stripsClaimed;
        const outOfRoom = collapsed
            ? this.stripsClaimed >= this.layout.strips
            : opensClaimed >= opensFit;
        if (outOfRoom) {
            return null;
        }
        const idx = this.subPaneCursor++;
        // lightweight-charts clamps addSeries' paneIndex down to the existing
        // pane count, so claimed indices must be materialized in ascending
        // order. preserveEmptyPane keeps collapsed strips (which get no
        // series) alive instead of being silently dropped.
        while (this.chart.panes().length <= idx) this.chart.addPane(true);
        this.createdPaneIndices.push(idx);
        if (collapsed) {
            this.stripsClaimed++;
            this.stripPaneIndices.add(idx);
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
        if (s.pivots && s.pivots.enabled !== false && s.pivots.showInChart !== false && this.candleSeries && rows.length >= 2) {
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
        if (s.bollingerBands.enabled !== false && s.bollingerBands.showInChart !== false && s.bollingerBands.length) {
            const bb = JSIndicators.bb(a.closes, s.bollingerBands.length, s.bollingerBands.stdDev ?? 2);
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
        if (isPaneActive("volume")) {
            const idxVol = this.openSubPane(isCollapsed("volume"), "volume");
            if (idxVol !== null) {
                if (!isCollapsed("volume")) this.addVolume(rows, idxVol);
                this.recordPane(idxVol, "volume", "");
            }
        }

        // RSI
        if (isPaneActive("rsi")) {
            const idx = this.openSubPane(isCollapsed("rsi"), "rsi");
            if (idx !== null) {
                const len = s.rsi.length ?? 14;
                const d = getSourceData(rows, this.src(s.rsi.source));
                const series = JSIndicators.rsi(d, len);
                if (!isCollapsed("rsi")) this.addLine(rows, series, idx, "--accent-color", "#2962ff");
                this.recordPane(idx, "rsi", `${len}`, this.lastValue(series));
            }
        }

        // MACD
        if (isPaneActive("macd")) {
            const idx = this.openSubPane(isCollapsed("macd"), "macd");
            if (idx !== null) {
                const d = getSourceData(rows, this.src(s.macd.source));
                const m = JSIndicators.macd(d, s.macd.fastLength, s.macd.slowLength, s.macd.signalLength);
                if (!isCollapsed("macd")) {
                    this.addLine(rows, m.macd, idx, "--accent-color", "#2962ff");
                    this.addLine(rows, m.signal, idx, "--warning-color", "#ffb300");
                }
                this.recordPane(idx, "macd", `${s.macd.fastLength} ${s.macd.slowLength} ${s.macd.signalLength}`, this.lastValue(m.macd));
            }
        }

        // StochRSI
        if (isPaneActive("stochRsi")) {
            const idx = this.openSubPane(isCollapsed("stochRsi"), "stochRsi");
            if (idx !== null) {
                const rsiPeriod = s.stochRsi.rsiLength || s.stochRsi.length || 14;
                const d = getSourceData(rows, this.src(s.stochRsi.source));
                const sr = JSIndicators.stochRsi(d, rsiPeriod, s.stochRsi.kPeriod, s.stochRsi.dPeriod, 3);
                if (!isCollapsed("stochRsi")) {
                    this.addLine(rows, sr.k, idx, "--accent-color", "#2962ff");
                    this.addLine(rows, sr.d, idx, "--warning-color", "#ffb300");
                }
                this.recordPane(idx, "stochRsi", `${rsiPeriod} ${s.stochRsi.kPeriod} ${s.stochRsi.dPeriod}`, this.lastValue(sr.k));
            }
        }

        // CCI
        if (isPaneActive("cci")) {
            const idx = this.openSubPane(isCollapsed("cci"), "cci");
            if (idx !== null) {
                const len = s.cci.length ?? 20;
                const d = getSourceData(rows, this.src(s.cci.source));
                const series = JSIndicators.cci(d, len);
                if (!isCollapsed("cci")) this.addLine(rows, series, idx, "--accent-color", "#2962ff");
                this.recordPane(idx, "cci", `${len}`, this.lastValue(series));
            }
        }

        // Momentum
        if (isPaneActive("momentum")) {
            const idx = this.openSubPane(isCollapsed("momentum"), "momentum");
            if (idx !== null) {
                const len = s.momentum.length ?? 10;
                const d = getSourceData(rows, this.src(s.momentum.source));
                const series = JSIndicators.mom(d, len);
                if (!isCollapsed("momentum")) this.addLine(rows, series, idx, "--success-color", "#26a69a");
                this.recordPane(idx, "momentum", `${len}`, this.lastValue(series));
            }
        }

        // Williams %R
        if (isPaneActive("williamsR")) {
            const idx = this.openSubPane(isCollapsed("williamsR"), "williamsR");
            if (idx !== null) {
                const len = s.williamsR.length ?? 14;
                const series = JSIndicators.williamsR(a.highs, a.lows, a.closes, len);
                if (!isCollapsed("williamsR")) {
                    this.addLine(rows, series, idx, "--danger-color", "#ef5350");
                }
                this.recordPane(idx, "williamsR", `${len}`, this.lastValue(series));
            }
        }

        // OBV
        if (isPaneActive("obv")) {
            const idx = this.openSubPane(isCollapsed("obv"), "obv");
            if (idx !== null) {
                if (!isCollapsed("obv"))
                    this.addLine(rows, JSIndicators.obv(a.closes, a.volume), idx, "--text-tertiary", "#9aa0a6");
                this.recordPane(idx, "obv", "");
            }
        }

        // MFI
        if (isPaneActive("mfi")) {
            const idx = this.openSubPane(isCollapsed("mfi"), "mfi");
            if (idx !== null) {
                const len = s.mfi.length ?? 14;
                const series = JSIndicators.mfi(a.highs, a.lows, a.closes, a.volume, len);
                if (!isCollapsed("mfi")) {
                    this.addLine(rows, series, idx, "--accent-color", "#2962ff");
                }
                this.recordPane(idx, "mfi", `${len}`, this.lastValue(series));
            }
        }

        // ADX
        if (isPaneActive("adx")) {
            const idx = this.openSubPane(isCollapsed("adx"), "adx");
            if (idx !== null) {
                const len = s.adx.diLength ?? s.adx.adxSmoothing ?? 14;
                const series = JSIndicators.adx(a.highs, a.lows, a.closes, len);
                if (!isCollapsed("adx")) {
                    this.addLine(rows, series, idx, "--accent-color", "#2962ff");
                }
                this.recordPane(idx, "adx", `${len}`, this.lastValue(series));
            }
        }

        // Awesome Oscillator
        if (isPaneActive("ao")) {
            const idx = this.openSubPane(isCollapsed("ao"), "ao");
            if (idx !== null) {
                const fast = s.ao.fastLength ?? 5;
                const slow = s.ao.slowLength ?? 34;
                const ao = JSIndicators.ao(a.highs, a.lows, fast, slow);
                if (!isCollapsed("ao")) {
                    this.addLine(rows, ao, idx, "--warning-color", "#ffb300");
                }
                this.recordPane(idx, "ao", `${fast} ${slow}`, this.lastValue(ao));
            }
        }

        // Choppiness
        if (isPaneActive("choppiness")) {
            const idx = this.openSubPane(isCollapsed("choppiness"), "choppiness");
            if (idx !== null) {
                const len = s.choppiness.length ?? 14;
                const series = JSIndicators.choppiness(a.highs, a.lows, a.closes, len);
                if (!isCollapsed("choppiness")) {
                    this.addLine(rows, series, idx, "--text-tertiary", "#9aa0a6");
                }
                this.recordPane(idx, "choppiness", `${len}`, this.lastValue(series));
            }
        }

        // Stochastic
        if (isPaneActive("stochastic")) {
            const idx = this.openSubPane(isCollapsed("stochastic"), "stochastic");
            if (idx !== null) {
                const kPeriod = s.stochastic.kPeriod ?? 14;
                const dPeriod = s.stochastic.dPeriod ?? 3;
                const k = JSIndicators.stoch(a.highs, a.lows, a.closes, kPeriod);
                const d = JSIndicators.sma(k, dPeriod);
                if (!isCollapsed("stochastic")) {
                    this.addLine(rows, k, idx, "--accent-color", "#2962ff");
                    this.addLine(rows, d, idx, "--warning-color", "#ffb300");
                }
                this.recordPane(idx, "stochastic", `${kPeriod} ${dPeriod}`, this.lastValue(k));
            }
        }
    }
}
