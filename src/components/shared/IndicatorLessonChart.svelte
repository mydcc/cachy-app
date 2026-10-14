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
    import { onMount, untrack } from "svelte";
    import {
        createChart,
        ColorType,
        CandlestickSeries,
        LineSeries,
        type IChartApi,
        type ISeriesApi,
        type LineData,
        type MouseEventParams,
        type Time,
    } from "lightweight-charts";
    import { _ } from "../../locales/i18n";
    import type { TranslationKey } from "../../locales/schema";
    import {
        dimensionOf,
        nameKey,
        outputKey,
        type CatalogueEntry,
    } from "../../lib/alerts/indicatorCatalogue";
    import {
        computeLessonSeries,
        type LessonSeries,
    } from "../../lib/academy/indicatorLessonSeries";
    import {
        LESSON_TIMEFRAME_FALLBACK,
        isDrawableTimeframe,
    } from "../../lib/academy/lessonSettings";
    import type { EvaluationCandle, ParamValue, PriceField } from "../../lib/rules/types";
    import type { Kline } from "../../services/technicalsTypes";
    import { CONSTANTS, TIMEFRAME_QUICK_PICKS } from "../../lib/constants";
    import { tradeState } from "../../stores/trade.svelte";
    import { marketState } from "../../stores/market.svelte";
    import { marketWatcher } from "../../services/marketWatcher";
    import { logger } from "../../services/logger";
    import { normalizeSymbol } from "../../utils/symbolUtils";
    import { normalizeTimeframeInput } from "../../utils/utils";
    import { safeLocalStorage } from "../../utils/storageWrapper";
    import {
        CrosshairValueBadge,
        type BadgePoint,
    } from "../../lib/chart/crosshairValueBadge";
    import TimeframeDropdown from "./TimeframeDropdown.svelte";

    interface Props {
        /** The lesson currently open in the view. */
        entry: CatalogueEntry;
        /**
         * The parameters to compute with, from the user's own Technicals
         * settings (FEAT-0681). Omitted, the catalogue defaults apply — a caller
         * with no settings yet still gets a total series.
         */
        params?: Readonly<Record<string, ParamValue>>;
        /**
         * The price to compute over, from the same settings card (FEAT-0681).
         * Omitted, the indicator's own default source applies — the chart window
         * honours the card's `source`, so the lesson has to as well.
         */
        field?: PriceField;
    }

    let { entry, params, field }: Props = $props();

    /**
     * The timeframe a lesson is drawn on.
     *
     * FEAT-0681 gave the learner the choice and remembered it; before that it was
     * pinned to `1h` so a lesson would not read differently on two visits — the
     * default for a first visit is still that value.
     */
    const LESSON_TIMEFRAME_KEY = CONSTANTS.LOCAL_STORAGE_LESSON_TIMEFRAME_KEY;

    let timeframe = $state(readStoredTimeframe());

    /**
     * Both directions go through the app's normaliser first, then the parser.
     *
     * The order matters: `parseTimeframe` accepts `0001d` (it reads the number,
     * which is 1), but the *string* is what names the channel, and the exchange
     * serves `kline_1d`, not `kline_0001d`. Canonicalising first means the stored
     * value is always the spelling the app itself would produce, so a stored or
     * typed `0001d`, `1T` or `240m` all land on a channel that carries candles.
     * An unusable value degrades to the default rather than subscribing to a
     * channel no candle will arrive on.
     */
    function readStoredTimeframe(): string {
        const stored = safeLocalStorage.getItem(LESSON_TIMEFRAME_KEY);
        if (stored === null) return LESSON_TIMEFRAME_FALLBACK;
        const canonical = normalizeTimeframeInput(stored);
        return isDrawableTimeframe(canonical) ? canonical : LESSON_TIMEFRAME_FALLBACK;
    }

    /**
     * Returns `false` for a value the app cannot draw, which leaves the
     * dropdown open with the text in place rather than closing on a refusal the
     * trader could not see.
     */
    function selectTimeframe(value: string): boolean {
        const canonical = normalizeTimeframeInput(value);
        if (!isDrawableTimeframe(canonical)) return false;
        timeframe = canonical;
        safeLocalStorage.setItem(LESSON_TIMEFRAME_KEY, canonical);
        return true;
    }

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

    function toEvaluationCandle(kline: Kline, openTimeMs: number): EvaluationCandle {
        return {
            open_time_ms: openTimeMs,
            open: kline.open.toString(),
            high: kline.high.toString(),
            low: kline.low.toString(),
            close: kline.close.toString(),
            volume: kline.volume?.toString(),
        };
    }

    let candles = $derived.by<EvaluationCandle[]>(() => {
        const market = marketState.data[normalizeSymbol(symbol, "bitunix")];
        // Live-tick driver: the *per-timeframe* kline freshness, not the global
        // `lastUpdated`. The latter is bumped by price/ticker/depth too, so
        // depending on it would recompute on every quote tick; this signal is
        // written only when klines actually change (klineBuffers, BUG-0248).
        void market?.klinesLastUpdated?.[timeframe];
        const klines = market?.klines?.[timeframe];
        if (!klines || klines.length === 0) return [];

        // Defence in depth, the same guard CandleChartView keeps: the series API
        // requires finite, strictly ascending times and throws from inside an
        // `$effect` otherwise — and such a throw bubbles to `handleGlobalError`
        // (BUG-0213). A malformed or out-of-order candle is dropped here so it
        // can never freeze the chart (BUG-0248).
        const rows: EvaluationCandle[] = [];
        let lastTime = -Infinity;
        for (const kline of klines.slice(-LESSON_CANDLE_WINDOW)) {
            const time = Number(kline.time); // audit: safe — epoch-ms timestamp
            if (!Number.isFinite(time) || time <= 0 || time <= lastTime) continue;
            lastTime = time;
            rows.push(toEvaluationCandle(kline, time));
        }
        return rows;
    });

    let computed = $derived<LessonSeries>(
        computeLessonSeries(entry, candles, timeframe, params, field),
    );

    /**
     * Which pane a declared output is drawn in.
     *
     * `placement` decides the *indicator's* home: a `pane` indicator gets its
     * own axis whatever its outputs' dimension (`macd`'s lines carry price-scale
     * values yet belong below the candles), so this is deliberately not
     * `dimension` alone. But a `price` indicator can still declare a non-price
     * output — `bollinger.percent_b`/`bandwidth`, `parabolic_sar.direction` —
     * and drawing those on the price axis is both meaningless and, on a
     * low-priced symbol, enough to blow out that axis's autoscale. Those get
     * their own pane; price-dimension outputs of a price indicator stay on the
     * candles.
     */
    function paneFor(lineName: string): number {
        if (entry.placement === "pane") return 1;
        return dimensionOf(entry, lineName) === "price" ? 0 : 1;
    }

    let container = $state<HTMLElement | null>(null);
    let chart = $state<IChartApi | null>(null);
    let candleSeries = $state<ISeriesApi<"Candlestick"> | null>(null);

    /*
     * Line series are recreated only when the *set* of lines changes — a new
     * lesson, or a switch between price overlay and own pane. A live tick only
     * refreshes the data of the series already on the chart.
     */
    let drawnLines: { name: string; series: ISeriesApi<"Line">; badge: CrosshairValueBadge }[] = [];
    let drawnSignature = "";

    /*
     * Crosshair value badges: one pill per indicator line, floating above
     * the dot at the hovered time. The hovered time is plain component
     * state (no reactivity needed — the badges repaint through the chart,
     * not through Svelte), and each badge reads its line's entries and the
     * cached theme colours lazily at draw time.
     */
    let hoveredTime: Time | null = null;
    let badgeEntries: BadgePoint[][] = [];
    const badgeTheme: { bg: string; text: string; line: string[] } = {
        bg: "",
        text: "",
        line: [],
    };

    function refreshBadgeTheme(): void {
        badgeTheme.bg = cssColor("--bg-secondary", "#1e293b");
        badgeTheme.text = cssColor("--text-primary", "#e2e8f0");
        badgeTheme.line = LINE_COLOR_VARS.map((token) => cssColor(token, "#2962ff"));
    }

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

    /** `LessonLine.values` as badge lookup entries (time + finite value). */
    function toBadgeEntries(
        values: readonly (string | null)[],
        rows: readonly EvaluationCandle[],
    ): BadgePoint[] {
        const out: BadgePoint[] = [];
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

    /**
     * Re-reads the theme's colours and re-applies them. The chart resolves CSS
     * variables to concrete colours at creation (the canvas cannot read
     * `var(...)`), so without this a dark↔light switch would leave the old
     * palette on screen — the same reason CandleChartView watches the theme.
     */
    function applyColors(): void {
        if (!chart || !candleSeries) return;
        chart.applyOptions({
            layout: {
                textColor: cssColor("--text-secondary", "#d1d4dc"),
                // The pane separator defaults to the library's hardcoded #E0E3EB;
                // without this it stays white in every theme.
                panes: {
                    separatorColor: cssColor("--border-color", "rgba(255, 255, 255, 0.1)"),
                    separatorHoverColor: cssColor("--accent-color", "#2962ff"),
                },
            },
            grid: {
                vertLines: { color: cssColor("--border-color", "rgba(255, 255, 255, 0.05)") },
                horzLines: { color: cssColor("--border-color", "rgba(255, 255, 255, 0.05)") },
            },
            rightPriceScale: { borderColor: cssColor("--border-color", "rgba(255, 255, 255, 0.1)") },
            timeScale: { borderColor: cssColor("--border-color", "rgba(255, 255, 255, 0.1)") },
        });
        candleSeries.applyOptions({
            upColor: cssColor("--success-color", "#26a69a"),
            downColor: cssColor("--danger-color", "#ef5350"),
            wickUpColor: cssColor("--success-color", "#26a69a"),
            wickDownColor: cssColor("--danger-color", "#ef5350"),
        });
        drawnLines.forEach((line, index) => {
            line.series.applyOptions({
                color: cssColor(LINE_COLOR_VARS[index % LINE_COLOR_VARS.length], "#2962ff"),
            });
        });
        // Badge pills read the cached theme colours at draw time.
        refreshBadgeTheme();
        for (const line of drawnLines) line.badge.update();
    }

    onMount(() => {
        if (!container) return;

        const created = createChart(container, {
            layout: {
                background: { type: ColorType.Solid, color: "transparent" },
                textColor: cssColor("--text-secondary", "#d1d4dc"),
                fontFamily: "Inter, sans-serif",
                panes: {
                    separatorColor: cssColor("--border-color", "rgba(255, 255, 255, 0.1)"),
                    separatorHoverColor: cssColor("--accent-color", "#2962ff"),
                },
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
        refreshBadgeTheme();

        // Value badges follow the crosshair: repaint on every move, hide
        // when the pointer leaves the chart (time is undefined there).
        const onCrosshairMove = (param: MouseEventParams) => {
            const next = param.time ?? null;
            if (next !== hoveredTime) {
                hoveredTime = next;
                for (const line of drawnLines) line.badge.update();
            }
        };
        created.subscribeCrosshairMove(onCrosshairMove);

        const resize = () => {
            if (!container) return;
            created.applyOptions({ width: container.clientWidth, height: container.clientHeight });
        };
        const observer = new ResizeObserver(resize);
        observer.observe(container);
        resize();

        return () => {
            created.unsubscribeCrosshairMove(onCrosshairMove);
            observer.disconnect();
            created.remove();
            chart = null;
            candleSeries = null;
            drawnLines = [];
            badgeEntries = [];
            hoveredTime = null;
            drawnSignature = "";
        };
    });

    // The active theme lives on `document.documentElement`; re-apply the colours
    // when it changes, so the chart follows a dark↔light switch without a
    // remount (CandleChartView does the same).
    onMount(() => {
        if (typeof window === "undefined") return;
        let frameId: number;
        const observer = new MutationObserver(() => {
            cancelAnimationFrame(frameId);
            frameId = requestAnimationFrame(() => applyColors());
        });
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["style", "class", "data-theme"],
        });
        return () => {
            observer.disconnect();
            cancelAnimationFrame(frameId);
        };
    });

    // The selected symbol's klines are what the lesson draws. Registering with
    // the `chart` requirement is what pages history in — the same call a chart
    // window makes — and the cleanup unregisters on a symbol switch or unmount.
    $effect(() => {
        const current = symbol;
        if (!current) return;
        const channel = `kline_${timeframe}`;
        // `untrack`, like CandleChartView: `ensureHistory` reads provider and
        // storage settings synchronously, so without this the effect would
        // acquire dependencies it does not intend and re-register on an
        // unrelated settings change.
        untrack(() => marketWatcher.register(current, channel, "chart"));
        return () => {
            marketWatcher.unregister(current, channel, "chart");
        };
    });

    // Candle + line rendering. Tracked on `chart`/`candleSeries` so it re-runs
    // once `onMount` has created them, then on every data or lesson change.
    //
    // The whole body is guarded: a transient series-API rejection must not
    // escape an effect, because an uncaught throw bubbles to `handleGlobalError`
    // and disturbs unrelated state (BUG-0213).
    $effect(() => {
        const activeChart = chart;
        const activeCandles = candleSeries;
        if (!activeChart || !activeCandles) return;

        const rows = candles;
        const series = computed;

        try {
            activeCandles.setData(
                rows.map((candle) => ({
                    time: (candle.open_time_ms / 1000) as Time,
                    open: toChartNumber(candle.open),
                    high: toChartNumber(candle.high),
                    low: toChartNumber(candle.low),
                    close: toChartNumber(candle.close),
                })),
            );

            const signature = `${entry.placement}|${series.lines
                .map((line) => `${line.name}:${paneFor(line.name)}`)
                .join(",")}`;
            if (signature !== drawnSignature) {
                // A new dataset identity: drop the old hover with the old
                // lines, so the pill never snaps to a bar the user never
                // hovered in this dataset.
                hoveredTime = null;
                for (const line of drawnLines) {
                    line.series.detachPrimitive(line.badge);
                    activeChart.removeSeries(line.series);
                }
                drawnLines = series.lines.map((line, index) => {
                    const lineIndex = index;
                    const created = activeChart.addSeries(
                        LineSeries,
                        {
                            color: cssColor(
                                LINE_COLOR_VARS[index % LINE_COLOR_VARS.length],
                                "#2962ff",
                            ),
                            lineWidth: 2,
                            priceLineVisible: false,
                            lastValueVisible: false,
                        },
                        paneFor(line.name),
                    );
                    const badge = new CrosshairValueBadge({
                        hoveredTime: () => hoveredTime,
                        entries: () => badgeEntries[lineIndex] ?? [],
                        colors: () => ({
                            bg: badgeTheme.bg,
                            text: badgeTheme.text,
                            border:
                                badgeTheme.line[lineIndex % LINE_COLOR_VARS.length] ??
                                badgeTheme.text,
                        }),
                    });
                    created.attachPrimitive(badge);
                    return { name: line.name, series: created, badge };
                });
                drawnSignature = signature;
            }

            series.lines.forEach((line, index) => {
                drawnLines[index]?.series.setData(toLineData(line.values, rows));
            });
            badgeEntries = series.lines.map((line) => toBadgeEntries(line.values, rows));
            // setData already repaints; badges only need a nudge while
            // hovered (their draw early-returns otherwise).
            if (hoveredTime !== null) {
                for (const line of drawnLines) line.badge.update();
            }
        } catch (error) {
            // A half-torn render must not leave the previous dataset's pills
            // behind: hide them until the next successful run.
            badgeEntries = [];
            hoveredTime = null;
            logger.error("ui", "lesson chart render failed", error);
        }
    });
</script>

<div
    class="flex flex-col gap-3 bg-[var(--bg-tertiary)] rounded-xl border border-[var(--border-color)] p-4 min-w-0"
>
    <div class="flex flex-wrap items-center justify-between gap-2 min-w-0">
        <div class="flex items-center gap-2 text-xs font-mono text-[var(--text-secondary)] min-w-0">
            <span class="font-bold text-[var(--accent-color)] truncate">{symbol || "—"}</span>
            <span aria-hidden="true">·</span>
            <!-- The same chip and quick-pick dropdown the Technicals panel shows. -->
            <TimeframeDropdown
                value={timeframe}
                options={TIMEFRAME_QUICK_PICKS}
                onSelect={selectTimeframe}
                label={$_("indicatorLessons.chart.timeframeLabel")}
            />
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
        aria-label="{lessonName} · {symbol} · {timeframe}"
    ></div>

    {#if computed.refused.length > 0}
        <div class="border-t border-[var(--border-color)] pt-2">
            <p class="text-xs font-bold uppercase text-[var(--warning-color)]">
                {$_("indicatorLessons.chart.refusedHeading")}
            </p>
            <ul class="flex flex-col gap-1 mt-1">
                {#each computed.refused as refusal (refusal.name)}
                    <li class="text-xs text-[var(--text-secondary)]">
                        <span class="font-mono">{translatedOutput(refusal.name)}</span>:
                        <!-- The engine's reason is developer-facing English. It is
                             shown as the technical detail beside the localized
                             line name, and marked as English so assistive tech
                             and translators treat it as such. -->
                        <span lang="en">{refusal.reason}</span>
                    </li>
                {/each}
            </ul>
        </div>
    {/if}
</div>
