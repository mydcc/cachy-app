<!--
  Copyright (C) 2026 MYDCT

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as
  published by the Free Software Foundation, either version 3 of the
  License, or (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License
  along with this program.  If not, see <https://www.gnu.org/licenses/>.
-->

<!--
  FEAT-0677, AC 8 and AC 9 — the live chart in a lesson.

  AC 8: the chart draws the selected indicator over the klines of the
  *currently selected symbol* (`tradeState.symbol`, the app-wide selection the
  calculator and the alert panel read) and redraws when that symbol changes.

  AC 9: it draws one line per declared catalogue output, never one per
  indicator. The fan-out is `computeLessonSeries`, which is already tested
  against every registry indicator — this component only draws the lines it is
  handed, so a multi-output indicator cannot be truncated here.

  Deliberately independent of `IndicatorLayer`: that layer decides *what* to
  draw from the chart's indicator settings through its own `SUB_PANES` list,
  not from an argument. A lesson names exactly one indicator and its declared
  outputs, so it computes its own series over the same engine path and draws
  them itself. `placement` decides price overlay versus own pane.

  The klines come from `marketState`, and this component holds the same
  `kline_<tf>` subscription a chart window would, so the history is paged in
  rather than assumed present. The chart itself is created in `onMount`, so an
  SSR render (the SEO route renders `AcademyContent` whole) produces the
  container and nothing that needs a canvas.
-->

<script lang="ts">
    import { onMount } from "svelte";
    import {
        createChart,
        ColorType,
        CandlestickSeries,
        LineSeries,
        type IChartApi,
        type ISeriesApi,
        type LineData,
        type Time,
    } from "lightweight-charts";
    import { _ } from "../../locales/i18n";
    import type { TranslationKey } from "../../locales/schema";
    import {
        nameKey,
        outputKey,
        type CatalogueEntry,
    } from "../../lib/alerts/indicatorCatalogue";
    import {
        computeLessonSeries,
        type LessonSeries,
    } from "../../lib/academy/indicatorLessonSeries";
    import type { EvaluationCandle } from "../../lib/rules/types";
    import type { Kline } from "../../services/technicalsTypes";
    import { tradeState } from "../../stores/trade.svelte";
    import { marketState } from "../../stores/market.svelte";
    import { marketWatcher } from "../../services/marketWatcher";
    import { normalizeSymbol } from "../../utils/symbolUtils";

    interface Props {
        /** The lesson currently open in the view. */
        entry: CatalogueEntry;
    }

    let { entry }: Props = $props();

    /**
     * The timeframe a lesson is drawn on. Fixed rather than the chart's own:
     * a lesson explains the indicator as it ships, and a moving timeframe would
     * make one lesson read differently on two visits.
     */
    const LESSON_TIMEFRAME = "1h";

    /**
     * How much history the indicator is computed over. Enough to clear the
     * widest warmup in the catalogue — Ichimoku's `span_b_period` (52) plus its
     * displacement — while keeping the per-tick recomputation bounded.
     */
    const LESSON_CANDLE_WINDOW = 300;

    /**
     * The palette the legend and the drawn lines share, as CSS variables so
     * themes keep working. The canvas needs a resolved colour (the chart
     * library cannot read `var(...)`), which `cssColor` reads at creation.
     */
    const LINE_COLOR_VARS = [
        "--accent-color",
        "--success-color",
        "--warning-color",
        "--danger-color",
        "--text-secondary",
    ] as const;

    function lineColor(index: number): string {
        return `var(${LINE_COLOR_VARS[index % LINE_COLOR_VARS.length]})`;
    }

    /**
     * A resolved colour for the canvas. A documented fallback is used only when
     * the document has no computed style (SSR, tests); in the browser the
     * variable always resolves, so no theme is broken by a literal.
     */
    function cssColor(name: string, fallback: string): string {
        if (typeof window === "undefined") return fallback;
        return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
    }

    /** The app-wide selected symbol. Never a chart-window's own symbol. */
    let symbol = $derived(tradeState.symbol || "");

    function toEvaluationCandle(kline: Kline): EvaluationCandle {
        return {
            open_time_ms: kline.time,
            open: kline.open.toString(),
            high: kline.high.toString(),
            low: kline.low.toString(),
            close: kline.close.toString(),
            volume: kline.volume?.toString(),
        };
    }

    let candles = $derived.by<EvaluationCandle[]>(() => {
        const market = marketState.data[normalizeSymbol(symbol, "bitunix")];
        // Live-tick driver: the kline array is mutated in place on a flush, so
        // the reference alone would not re-run this (BUG-0248).
        void market?.lastUpdated;
        const klines = market?.klines?.[LESSON_TIMEFRAME];
        if (!klines || klines.length === 0) return [];
        return klines.slice(-LESSON_CANDLE_WINDOW).map(toEvaluationCandle);
    });

    let computed = $derived<LessonSeries>(computeLessonSeries(entry, candles, LESSON_TIMEFRAME));

    let container = $state<HTMLElement | null>(null);
    let chart = $state<IChartApi | null>(null);
    let candleSeries = $state<ISeriesApi<"Candlestick"> | null>(null);

    /*
     * Line series are recreated only when the *set* of lines changes — a new
     * lesson, or a switch between price overlay and own pane. A live tick only
     * refreshes the data of the series already on the chart.
     */
    let drawnLines: { name: string; series: ISeriesApi<"Line"> }[] = [];
    let drawnSignature = "";

    function translatedOutput(name: string): string {
        const key = outputKey(name) as TranslationKey;
        const text = $_(key);
        return text === key || text === "" ? name : text;
    }

    let lessonName = $derived.by(() => {
        const key = nameKey(entry.id) as TranslationKey;
        const text = $_(key);
        return text === key || text === "" ? entry.id : text;
    });

    /**
     * One indicator or candle column as a plain number for the chart series.
     *
     * Chart series data is the chart library's own number-based API and stays
     * f64 by design (ADR-0021) — the Decimal-carried value is only rendered
     * here, never computed on. The conversion lives in one marked place rather
     * than at every column.
     */
    function toChartNumber(value: string): number {
        return Number(value); // audit: safe — chart series data is plain numbers (the chart library's own API)
    }

    /** `LessonLine.values` are decimal strings; the series wants numbers. */
    function toLineData(
        values: readonly (string | null)[],
        rows: readonly EvaluationCandle[],
    ): LineData<Time>[] {
        const out: LineData<Time>[] = [];
        const n = Math.min(values.length, rows.length);
        for (let i = 0; i < n; i++) {
            const raw = values[i];
            if (raw === null || raw === undefined) continue;
            const value = toChartNumber(raw);
            if (!Number.isFinite(value)) continue;
            out.push({ time: (rows[i].open_time_ms / 1000) as Time, value });
        }
        return out;
    }

    onMount(() => {
        if (!container) return;

        const created = createChart(container, {
            layout: {
                background: { type: ColorType.Solid, color: "transparent" },
                textColor: cssColor("--text-secondary", "#d1d4dc"),
                fontFamily: "Inter, sans-serif",
            },
            grid: {
                vertLines: { color: cssColor("--border-color", "rgba(255, 255, 255, 0.05)") },
                horzLines: { color: cssColor("--border-color", "rgba(255, 255, 255, 0.05)") },
            },
            rightPriceScale: {
                borderColor: cssColor("--border-color", "rgba(255, 255, 255, 0.1)"),
            },
            timeScale: {
                borderColor: cssColor("--border-color", "rgba(255, 255, 255, 0.1)"),
                timeVisible: true,
                secondsVisible: false,
            },
            crosshair: { mode: 0 },
            handleScroll: true,
            handleScale: true,
        });
        chart = created;
        candleSeries = created.addSeries(CandlestickSeries, {
            upColor: cssColor("--success-color", "#26a69a"),
            downColor: cssColor("--danger-color", "#ef5350"),
            borderVisible: false,
            wickUpColor: cssColor("--success-color", "#26a69a"),
            wickDownColor: cssColor("--danger-color", "#ef5350"),
            priceLineVisible: false,
        });

        const resize = () => {
            if (!container) return;
            created.applyOptions({ width: container.clientWidth, height: container.clientHeight });
        };
        const observer = new ResizeObserver(resize);
        observer.observe(container);
        resize();

        return () => {
            observer.disconnect();
            created.remove();
            chart = null;
            candleSeries = null;
            drawnLines = [];
            drawnSignature = "";
        };
    });

    // The selected symbol's klines are what the lesson draws. Registering with
    // the `chart` requirement is what pages history in — the same call a chart
    // window makes — and the cleanup unregisters on a symbol switch or unmount.
    $effect(() => {
        const current = symbol;
        if (!current) return;
        const channel = `kline_${LESSON_TIMEFRAME}`;
        marketWatcher.register(current, channel, "chart");
        return () => {
            marketWatcher.unregister(current, channel, "chart");
        };
    });

    // Candle + line rendering. Tracked on `chart`/`candleSeries` so it re-runs
    // once `onMount` has created them, then on every data or lesson change.
    $effect(() => {
        const activeChart = chart;
        const activeCandles = candleSeries;
        if (!activeChart || !activeCandles) return;

        const rows = candles;
        const series = computed;

        activeCandles.setData(
            rows.map((candle) => ({
                time: (candle.open_time_ms / 1000) as Time,
                open: toChartNumber(candle.open),
                high: toChartNumber(candle.high),
                low: toChartNumber(candle.low),
                close: toChartNumber(candle.close),
            })),
        );

        const signature = `${entry.placement}|${series.lines.map((line) => line.name).join(",")}`;
        if (signature !== drawnSignature) {
            for (const line of drawnLines) activeChart.removeSeries(line.series);
            drawnLines = series.lines.map((line, index) => ({
                name: line.name,
                series: activeChart.addSeries(
                    LineSeries,
                    {
                        color: cssColor(LINE_COLOR_VARS[index % LINE_COLOR_VARS.length], "#2962ff"),
                        lineWidth: 2,
                        priceLineVisible: false,
                        lastValueVisible: false,
                    },
                    // `price` lines share the candle pane; `pane` lines get their
                    // own axis below it.
                    entry.placement === "pane" ? 1 : 0,
                ),
            }));
            drawnSignature = signature;
        }

        series.lines.forEach((line, index) => {
            drawnLines[index]?.series.setData(toLineData(line.values, rows));
        });
    });
</script>

<div
    class="flex flex-col gap-3 bg-[var(--bg-tertiary)] rounded-xl border border-[var(--border-color)] p-4 min-w-0"
>
    <div class="flex flex-wrap items-center justify-between gap-2 min-w-0">
        <div class="flex items-center gap-2 text-xs font-mono text-[var(--text-secondary)] min-w-0">
            <span class="font-bold text-[var(--accent-color)] truncate">{symbol || "—"}</span>
            <span aria-hidden="true">·</span>
            <span>{LESSON_TIMEFRAME}</span>
        </div>

        <!-- One legend entry per drawn line, from the catalogue's own outputs. -->
        <ul class="flex flex-wrap items-center gap-3">
            {#each computed.lines as line, index (line.name)}
                <li
                    class="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-[var(--text-secondary)]"
                >
                    <span
                        class="inline-block w-3 h-0.5 rounded-full"
                        style:background={lineColor(index)}
                        aria-hidden="true"
                    ></span>
                    {translatedOutput(line.name)}
                </li>
            {/each}
        </ul>
    </div>

    {#if candles.length === 0}
        <p class="text-sm text-[var(--text-tertiary)] py-6 text-center">
            {$_("indicatorLessons.chart.empty")}
        </p>
    {/if}

    <!-- The container stays mounted whether or not data has arrived, so
         `onMount` always binds it; an empty chart simply draws nothing. -->
    <div
        class="w-full min-w-0 {candles.length === 0 ? 'h-0' : 'h-64'}"
        bind:this={container}
        role="img"
        aria-label="{lessonName} · {symbol} · {LESSON_TIMEFRAME}"
    ></div>

    {#if computed.refused.length > 0}
        <div class="border-t border-[var(--border-color)] pt-2">
            <p class="text-xs font-bold uppercase text-[var(--warning-color)]">
                {$_("indicatorLessons.chart.refusedHeading")}
            </p>
            <ul class="flex flex-col gap-1 mt-1">
                {#each computed.refused as refusal (refusal.name)}
                    <li class="text-xs text-[var(--text-secondary)]">
                        <span class="font-mono">{refusal.name}</span>: {refusal.reason}
                    </li>
                {/each}
            </ul>
        </div>
    {/if}
</div>
