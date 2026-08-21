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

<script lang="ts">
    import { onMount, untrack } from "svelte";
    import {
        createChart,
        ColorType,
        CandlestickSeries,
        LineSeries,
        type IChartApi,
        type ISeriesApi,
        type CandlestickData,
        type Time,
        type LogicalRange,
    } from "lightweight-charts";
    import { JSIndicators } from "../../../utils/indicators";
    import { marketState } from "../../../stores/market.svelte";
    import { indicatorState } from "../../../stores/indicator.svelte";
    import { settingsState } from "../../../stores/settings.svelte";
    import { normalizeSymbol } from "../../../utils/symbolUtils";
    import { marketWatcher } from "../../../services/marketWatcher";
    import type { WindowBase } from "../WindowBase.svelte";

    interface Props {
        symbol: string;
        window: WindowBase;
        timeframe: string;
        showTimeframeDropdown?: boolean;
        toggleTimeframeDropdown?: () => void;
        closeTimeframeDropdown?: () => void;
        setTimeframe?: (tf: string) => void;
        updateHeaderControls?: () => void;
    }

    let {
        symbol,
        window: win,
        timeframe,
        showTimeframeDropdown = false,
        toggleTimeframeDropdown,
        closeTimeframeDropdown,
        setTimeframe,
        updateHeaderControls,
    }: Props = $props();

    const ALL_TIMEFRAMES = [
        "1m", "2m", "3m", "5m", "6m", "9m", "10m", "12m", "15m", "24m", "27m", "30m", "45m",
        "1h", "2h", "4h", "6h", "8h", "12h",
        "1d", "3d", "1w", "1M"
    ];

    function toggleFavorite(tf: string, e: Event) {
        e.stopPropagation();
        const current = [...(settingsState.favoriteTimeframes || [])];
        const index = current.indexOf(tf);
        if (index >= 0) {
            current.splice(index, 1);
        } else {
            current.push(tf);
        }
        settingsState.favoriteTimeframes = current;
        updateHeaderControls?.();
    }

    let chartContainer: HTMLElement | null = $state(null);
    let chart: IChartApi | null = $state(null);
    let candleSeries: ISeriesApi<"Candlestick"> | null = $state(null);

    // Indicator Series
    let ema1Series: ISeriesApi<"Line"> | null = $state(null);
    let ema2Series: ISeriesApi<"Line"> | null = $state(null);
    let ema3Series: ISeriesApi<"Line"> | null = $state(null);

    let isInitialLoad = $state(true);
    let isLoadingHistory = $state(false);
    let allHistoryLoaded = $state(false);
    let lastRenderedTime: Time | null = $state(null);
    let lastRenderedCount = $state(0);
    let lastRenderTimestamp = 0;
    let renderThrottleTimer: ReturnType<typeof setTimeout> | null = null;

    // Dynamic Theme Update using MutationObserver
    onMount(() => {
        if (typeof window === "undefined") return;

        let frameId: number;
        const observer = new MutationObserver(() => {
            cancelAnimationFrame(frameId);
            frameId = requestAnimationFrame(() => {
                updateColors();
            });
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

    onMount(() => {
        if (!chartContainer) return;

        // Initial Colors (Fallback)
        const textColor = getVar("--text-secondary") || "#d1d4dc";
        chart = createChart(chartContainer, {
            layout: {
                background: { type: ColorType.Solid, color: "transparent" },
                textColor: textColor,
                fontFamily: "Inter, sans-serif",
            },
            grid: {
                vertLines: {
                    color:
                        getVar("--border-color") || "rgba(255, 255, 255, 0.05)",
                },
                horzLines: {
                    color:
                        getVar("--border-color") || "rgba(255, 255, 255, 0.05)",
                },
            },
            rightPriceScale: {
                visible: win.showRightScale ?? true,
                borderColor:
                    getVar("--border-color") || "rgba(255, 255, 255, 0.1)",
                scaleMargins: {
                    top: 0.1,
                    bottom: 0.2,
                },
                mode: 1, // Default Logarithmic
                autoScale: true, // Always enable Y-axis auto-scaling for trading view consistency
            },
            timeScale: {
                borderColor:
                    getVar("--border-color") || "rgba(255, 255, 255, 0.1)",
                timeVisible: true,
                secondsVisible: false,
            },
            crosshair: {
                mode: 0,
                vertLine: {
                    color:
                        getVar("--text-tertiary") || "rgba(255, 255, 255, 0.2)",
                    labelBackgroundColor: getVar("--accent-color"),
                },
                horzLine: {
                    color:
                        getVar("--text-tertiary") || "rgba(255, 255, 255, 0.2)",
                    labelBackgroundColor: getVar("--accent-color"),
                },
            },
            handleScroll: true,
            handleScale: true,
        });

        candleSeries = chart.addSeries(CandlestickSeries, {
            upColor: getVar("--success-color") || "#26a69a",
            downColor: getVar("--danger-color") || "#ef5350",
            borderVisible: false,
            wickUpColor: getVar("--success-color") || "#26a69a",
            wickDownColor: getVar("--danger-color") || "#ef5350",
        });

        // Initialize EMA Series
        // Harmonized colors using semantic theme variables
        ema1Series = chart.addSeries(LineSeries, {
            color: getVar("--success-color") || "#26a69a",
            lineWidth: 2,
            crosshairMarkerVisible: false,
        });
        ema2Series = chart.addSeries(LineSeries, {
            color: getVar("--danger-color") || "#ef5350",
            lineWidth: 2,
            crosshairMarkerVisible: false,
        });
        ema3Series = chart.addSeries(LineSeries, {
            color: getVar("--warning-color") || "#ffb300",
            lineWidth: 2,
            crosshairMarkerVisible: false,
        });
        untrack(() => updateColors());

        const handleResize = () => {
            if (chart && chartContainer) {
                chart.applyOptions({
                    width: chartContainer.clientWidth,
                    height: chartContainer.clientHeight,
                });
            }
        };

        const resizeObserver = new ResizeObserver(handleResize);
        resizeObserver.observe(chartContainer);

        // Scroll listener for dynamic history loading
        let debounceTimer: ReturnType<typeof setTimeout>;
        const timeScale = chart.timeScale();

        const handleVisibleLogicalRangeChange = (
            newVisibleLogicalRange: LogicalRange | null,
        ) => {
            if (!newVisibleLogicalRange) return;

            // Detect if we are close to the start (left side)
            // Logical range: 0 is the last bar, negative values go back in history if not fully loaded,
            // but here Lightweight Charts usually indexes 0 as the first point in the dataset.
            // If we scroll to 'from' < 10, we are at the start of known history.
            if (
                newVisibleLogicalRange.from < 10 &&
                !isLoadingHistory &&
                !allHistoryLoaded
            ) {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    // Double check inside debounce
                    const currentRange = timeScale.getVisibleLogicalRange();
                    if (
                        currentRange &&
                        currentRange.from < 10 &&
                        !isLoadingHistory &&
                        !allHistoryLoaded
                    ) {
                        loadMore();
                    }
                }, 200);
            }
        };

        timeScale.subscribeVisibleLogicalRangeChange(
            handleVisibleLogicalRangeChange,
        );

        return () => {
            if (renderThrottleTimer) {
                clearTimeout(renderThrottleTimer);
                renderThrottleTimer = null;
            }
            timeScale.unsubscribeVisibleLogicalRangeChange(
                handleVisibleLogicalRangeChange,
            );
            if (chartContainer) resizeObserver.unobserve(chartContainer);
            if (chart) chart.remove();
        };
    });

    async function loadMore() {
        if (isLoadingHistory || allHistoryLoaded) return;
        isLoadingHistory = true;

        try {
            const hasMore = await marketWatcher.loadMoreHistory(
                normalizeSymbol(symbol, "bitunix"),
                timeframe,
            );
            if (!hasMore) {
                allHistoryLoaded = true;
            }
        } finally {
            // Small delay to prevent rapid refiring
            setTimeout(() => {
                isLoadingHistory = false;
            }, 500);
        }
    }

    // Helper to resolve CSS variables
    function getVar(name: string): string {
        if (typeof window === "undefined") return "";
        return getComputedStyle(document.documentElement)
            .getPropertyValue(name)
            .trim();
    }

    function updateColors() {
        if (!chart || !candleSeries) return;

        const success = getVar("--success-color") || "#26a69a";
        const danger = getVar("--danger-color") || "#ef5350";
        const warning = getVar("--warning-color") || "#ffb300";
        const text = getVar("--text-secondary") || "#d1d4dc";
        const accent = getVar("--accent-color") || "#2962ff";
        const border = getVar("--border-color") || "rgba(255, 255, 255, 0.1)";

        chart.applyOptions({
            layout: {
                textColor: text,
            },
            grid: {
                vertLines: { color: border },
                horzLines: { color: border },
            },
            rightPriceScale: { borderColor: border },
            timeScale: { borderColor: border },
            crosshair: {
                vertLine: {
                    color:
                        getVar("--text-tertiary") || "rgba(255, 255, 255, 0.2)",
                    labelBackgroundColor: accent,
                },
                horzLine: {
                    color:
                        getVar("--text-tertiary") || "rgba(255, 255, 255, 0.2)",
                    labelBackgroundColor: accent,
                },
            },
        });

        candleSeries.applyOptions({
            upColor: success,
            downColor: danger,
            wickUpColor: success,
            wickDownColor: danger,
        });

        // EMA Colors
        if (ema1Series) ema1Series.applyOptions({ color: success });
        if (ema2Series) ema2Series.applyOptions({ color: danger });
        if (ema3Series) ema3Series.applyOptions({ color: warning });
    }

    // Registration for real-time data
    $effect(() => {
        if (!symbol || !timeframe) return;
        const channel = `kline_${timeframe}`;
        untrack(() => marketWatcher.register(symbol, channel, "chart"));
        return () => {
            marketWatcher.unregister(symbol, channel, "chart");
        };
    });

    // Reactive data update
    $effect(() => {
        if (!candleSeries || !symbol || !chart) return;

        // Dependencies for reactivity
        const normalized = normalizeSymbol(symbol, "bitunix");
        // Explicitly track the kline array reference and lastUpdated to ensure live tick reactivity
        const marketData = marketState.data[normalized];
        const _lastUpdated = marketData?.lastUpdated;
        const klines = marketData?.klines?.[timeframe];

        const settings = indicatorState.ema;
        const indicatorsEnabled = settings.enabled !== false;

        if (klines) {
            if (klines.length > 0) {
                // Optimization: Check if this is just a live update to the last candle
                const lastKline = klines[klines.length - 1];
                const lastTime = (lastKline.time / 1000) as Time;
                const isLiveUpdate = lastRenderedTime === lastTime && klines.length === lastRenderedCount;

                if (isLiveUpdate && !isInitialLoad) {
                    const renderTick = () => {
                        if (!candleSeries) return;
                        try {
                            const currentLastKline = klines[klines.length - 1];
                            const currentLastTime = (currentLastKline.time / 1000) as Time;
                            const update = {
                                time: currentLastTime,
                                open: Number(currentLastKline.open),
                                high: Number(currentLastKline.high),
                                low: Number(currentLastKline.low),
                                close: Number(currentLastKline.close),
                            };
                            candleSeries.update(update);

                            if (win.currentPrice !== undefined) {
                                win.currentPrice = update.close.toFixed(2);
                            }
                            lastRenderTimestamp = Date.now();
                        } catch (e) {
                            console.error("[CandleChartView] Live update failed, will full-render next cycle:", e);
                            lastRenderedTime = null;
                            lastRenderedCount = 0;
                        }
                    };

                    const now = Date.now();
                    const throttleMs = settingsState.chartRenderIntervalMs ?? 0;

                    if (throttleMs <= 0 || lastRenderTimestamp === 0 || now - lastRenderTimestamp >= throttleMs) {
                        if (renderThrottleTimer) {
                            clearTimeout(renderThrottleTimer);
                            renderThrottleTimer = null;
                        }
                        renderTick();
                    } else if (!renderThrottleTimer) {
                        const remaining = throttleMs - (now - lastRenderTimestamp);
                        renderThrottleTimer = setTimeout(() => {
                            renderThrottleTimer = null;
                            renderTick();
                        }, Math.max(0, remaining));
                    }
                } else {
                    // Slow Path: Full Render (History load or New Candle)
                    const formatted: CandlestickData[] = klines
                        .map((k) => ({
                            time: (k.time / 1000) as Time,
                            open: Number(k.open),
                            high: Number(k.high),
                            low: Number(k.low),
                            close: Number(k.close),
                        }))
                        .filter(
                            (k) =>
                                !isNaN(Number(k.time)) &&
                                Number(k.time) > 0 &&
                                !isNaN(k.open) &&
                                !isNaN(k.high) &&
                                !isNaN(k.low) &&
                                !isNaN(k.close),
                        );

                    // Sorting check (Lightweight charts requires strictly ascending time)
                    formatted.sort((a, b) => Number(a.time) - Number(b.time));

                    // Deduping check
                    const unique: CandlestickData[] = [];
                    const seen = new Set();
                    for (const k of formatted) {
                        if (!seen.has(Number(k.time))) {
                            seen.add(Number(k.time));
                            unique.push(k);
                        }
                    }

                    try {
                        candleSeries.setData(unique);

                        // Arm the fast path immediately after the series is
                        // rendered. If any later slow-path step (indicator
                        // computation, visibility) throws, live ticks must
                        // keep flowing via candleSeries.update() instead of
                        // permanently disarming the fast path and freezing the
                        // chart after its initial render.
                        lastRenderedTime =
                            unique.length > 0
                                ? unique[unique.length - 1].time
                                : null;
                        lastRenderedCount = klines.length;
                        lastRenderTimestamp = 0;
                        isInitialLoad = false;

                        // Update Indicators if enabled
                        if (
                            indicatorsEnabled &&
                            ema1Series &&
                            ema2Series &&
                            ema3Series
                        ) {
                            const closes = unique.map((c) => c.close);
                            // Ensure we have enough data
                            if (closes.length > 5) {
                                const ema1 = JSIndicators.ema(
                                    closes,
                                    settings.ema1.length,
                                );
                                const ema2 = JSIndicators.ema(
                                    closes,
                                    settings.ema2.length,
                                );
                                const ema3 = JSIndicators.ema(
                                    closes,
                                    settings.ema3.length,
                                );

                                const mapToSeries = (arr: number[] | Float64Array) => {
                                    const result = [];
                                    // Use standard loop to handle both Array and Float64Array
                                    for (let i = 0; i < arr.length; i++) {
                                        const val = arr[i];
                                        if (unique[i]) {
                                            if (
                                                val !== null &&
                                                val !== undefined &&
                                                typeof val === "number" &&
                                                !isNaN(val)
                                            ) {
                                                result.push({
                                                    time: unique[i].time,
                                                    value: val,
                                                });
                                            }
                                        }
                                    }
                                    return result;
                                };

                                ema1Series.setData(mapToSeries(ema1));
                                ema2Series.setData(mapToSeries(ema2));
                                ema3Series.setData(mapToSeries(ema3));

                                // Visible
                                ema1Series.applyOptions({ visible: true });
                                ema2Series.applyOptions({ visible: true });
                                ema3Series.applyOptions({ visible: true });
                            }
                        } else if (ema1Series && ema2Series && ema3Series) {
                            // Hide if disabled
                            ema1Series.applyOptions({ visible: false });
                            ema2Series.applyOptions({ visible: false });
                            ema3Series.applyOptions({ visible: false });
                        }
                    } catch (e) {
                        console.error("[CandleChartView] Render error:", e);
                        // Disarm so the next cycle retries the slow path
                        // instead of silently skipping renders forever.
                        lastRenderedTime = null;
                        lastRenderedCount = 0;
                    }
                }
            }
        } else {
            // console.warn(`[CandleChart] No data found for ${normalized} in marketState`);
        }
    });

    // Reactive Options update (Scale, Visibility, etc.)
</script>

<div
    class="chart-view h-full w-full flex flex-col overflow-hidden rounded-b-xl border border-[rgba(255,255,255,0.05)] relative"
>
    {#if showTimeframeDropdown}
        <div
            class="absolute top-2 left-2 z-30 bg-[#1e222d] border border-[#2a2e39] rounded-xl p-3.5 shadow-2xl w-[320px] text-white flex flex-col gap-3 font-sans animate-fade-in"
        >
            <div class="flex justify-between items-center border-b border-[#2a2e39] pb-2">
                <span class="text-xs font-semibold uppercase tracking-wider text-gray-300">Select period</span>
                <div class="flex items-center gap-2">
                    <span class="text-[10px] text-amber-400 font-mono">
                        {settingsState.favoriteTimeframes?.length || 0}/10 ★
                    </span>
                    <button
                        class="text-gray-400 hover:text-white text-xs px-1"
                        onclick={() => closeTimeframeDropdown?.()}
                    >✕</button>
                </div>
            </div>

            <div class="grid grid-cols-4 gap-1.5 max-h-[260px] overflow-y-auto pr-1 custom-scrollbar">
                {#each ALL_TIMEFRAMES as tf}
                    {@const isFav = settingsState.favoriteTimeframes?.includes(tf)}
                    {@const isActive = tf === timeframe}
                    <div
                        class="flex items-center justify-between px-2 py-1.5 rounded-lg text-xs font-medium border transition-all {isActive
                            ? 'bg-[var(--accent-color)] text-[var(--btn-accent-text)] border-[var(--accent-color)] shadow-md'
                            : 'bg-[#2a2e39] border-transparent text-gray-200 hover:bg-[#363a45]'}"
                    >
                        <button
                            type="button"
                            class="flex-1 text-left font-medium outline-none cursor-pointer"
                            onclick={() => setTimeframe?.(tf)}
                        >
                            {tf}
                        </button>
                        <button
                            type="button"
                            class="text-xs px-0.5 hover:scale-125 transition-transform outline-none cursor-pointer {isFav ? 'text-amber-400 font-bold' : 'text-gray-500 opacity-40 hover:opacity-100'}"
                            onclick={(e) => toggleFavorite(tf, e)}
                            title={isFav ? 'Remove from favorites' : 'Add to favorites'}
                        >
                            ★
                        </button>
                    </div>
                {/each}
            </div>
        </div>
    {/if}

    <div
        bind:this={chartContainer}
        class="chart-container flex-1 min-h-0 w-full relative"
    >
        {#if isLoadingHistory}
            <div
                class="absolute top-4 left-1/2 transform -translate-x-1/2 z-20 pointer-events-none"
            >
                <div
                    class="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-full px-3 py-1 flex items-center gap-2 shadow-lg"
                >
                    <div
                        class="w-3 h-3 border-2 border-[var(--accent-color)] border-t-transparent rounded-full animate-spin"
                    ></div>
                    <span
                        class="text-[10px] text-[var(--text-secondary)] font-mono"
                        >LOADING HISTORY</span
                    >
                </div>
            </div>
        {/if}

        {#if !marketState.data[normalizeSymbol(symbol, "bitunix")]?.klines[timeframe]}
            <div
                class="absolute inset-0 flex items-center justify-center bg-[var(--bg-primary)] opacity-80 backdrop-blur-sm z-10"
            >
                <div class="flex flex-col items-center gap-3">
                    <div
                        class="loading-spinner w-8 h-8 border-2 border-[var(--accent-color)] border-t-transparent rounded-full animate-spin"
                    ></div>
                    <span
                        class="text-xs font-mono tracking-widest text-[var(--text-secondary)]"
                        >FETCHING MARKET DATA...</span
                    >
                </div>
            </div>
        {/if}
    </div>
</div>

<style>
    .chart-view {
        background: radial-gradient(
            circle at 50% 0%,
            var(--bg-secondary),
            var(--bg-primary)
        );
    }

    .chart-container :global(.tv-lightweight-charts) {
        border-radius: 0 0 12px 12px;
    }

    .loading-spinner {
        filter: drop-shadow(0 0 8px var(--accent-color));
    }
</style>
