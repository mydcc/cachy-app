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
    } from "lightweight-charts";
    import { JSIndicators } from "../../../utils/indicators";
    import { marketState } from "../../../stores/market.svelte";
    import { settingsState } from "../../../stores/settings.svelte";
    import { indicatorState } from "../../../stores/indicator.svelte";
    import { normalizeSymbol } from "../../../utils/symbolUtils";
    import { marketWatcher } from "../../../services/marketWatcher";
    import type { WindowBase } from "../WindowBase.svelte";

    interface Props {
        symbol: string;
        window: WindowBase;
    }

    let { symbol, window: win }: Props = $props();

    let chartContainer: HTMLElement | null = $state(null);
    let chart: IChartApi | null = $state(null);
    let candleSeries: ISeriesApi<"Candlestick"> | null = $state(null);

    // Indicator Series
    let ema1Series: ISeriesApi<"Line"> | null = $state(null);
    let ema2Series: ISeriesApi<"Line"> | null = $state(null);
    let ema3Series: ISeriesApi<"Line"> | null = $state(null);

    let timeframe = $state("1h");
    let isInitialLoad = $state(true);

    const timeframes = ["1m", "5m", "15m", "1h", "4h", "1d"];

    // Dynamic Theme Update using MutationObserver
    onMount(() => {
        if (typeof window === "undefined") return;

        const observer = new MutationObserver(() => {
            updateColors();
        });

        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["style", "class", "data-theme"],
        });

        return () => observer.disconnect();
    });

    onMount(() => {
        if (!chartContainer) return;

        // Initial Colors (Fallback)
        const textColor = getVar("--text-secondary") || "#d1d4dc";
        const gridColor = "rgba(255, 255, 255, 0.05)";

        chart = createChart(chartContainer, {
            layout: {
                background: { type: ColorType.Solid, color: "transparent" },
                textColor: textColor,
                fontFamily: "Inter, sans-serif",
            },
            grid: {
                vertLines: { color: gridColor },
                horzLines: { color: gridColor },
            },
            rightPriceScale: {
                borderColor: "rgba(255, 255, 255, 0.1)",
                scaleMargins: {
                    top: 0.1,
                    bottom: 0.2,
                },
            },
            timeScale: {
                borderColor: "rgba(255, 255, 255, 0.1)",
                timeVisible: true,
                secondsVisible: false,
            },
            crosshair: {
                mode: 0,
                vertLine: {
                    color: "rgba(255, 255, 255, 0.2)",
                    labelBackgroundColor: getVar("--accent-color"),
                },
                horzLine: {
                    color: "rgba(255, 255, 255, 0.2)",
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
        // Colors: EMA1=Yellow/Gold, EMA2=Blue/Cyan, EMA3=Purple
        ema1Series = chart.addSeries(LineSeries, {
            color: "#ffb300",
            lineWidth: 1,
            crosshairMarkerVisible: false,
        }); // 21
        ema2Series = chart.addSeries(LineSeries, {
            color: "#2979ff",
            lineWidth: 1,
            crosshairMarkerVisible: false,
        }); // 50
        ema3Series = chart.addSeries(LineSeries, {
            color: "#d500f9",
            lineWidth: 1,
            crosshairMarkerVisible: false,
        }); // 200

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

        return () => {
            if (chartContainer) resizeObserver.unobserve(chartContainer);
            if (chart) chart.remove();
        };
    });

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
        const text = getVar("--text-secondary") || "#d1d4dc";
        const accent = getVar("--accent-color") || "#2962ff";

        chart.applyOptions({
            layout: { textColor: text },
            crosshair: {
                vertLine: { labelBackgroundColor: accent },
                horzLine: { labelBackgroundColor: accent },
            },
        });

        candleSeries.applyOptions({
            upColor: success,
            downColor: danger,
            wickUpColor: success,
            wickDownColor: danger,
        });
    }

    // Registration for real-time data
    $effect(() => {
        if (!symbol || !timeframe) return;
        const channel = `kline_${timeframe}`;
        marketWatcher.register(symbol, channel);
        return () => {
            marketWatcher.unregister(symbol, channel);
        };
    });

    // Reactive data update
    $effect(() => {
        if (!candleSeries || !symbol || !chart) return;

        // Dependencies for reactivity
        const normalized = normalizeSymbol(symbol, "bitunix");
        const marketData = marketState.data[normalized];
        const currentTF = timeframe;
        const settings = indicatorState.ema; // Track EMA settings
        const indicatorsEnabled = settingsState.enabledIndicators.ema; // Track Toggle from settingsState

        // DEBUG: Trace why chart is empty
        // console.log(`[CandleChart] Check data for ${normalized} (${symbol}) TF: ${currentTF}`, marketData);

        if (marketData && marketData.klines && marketData.klines[currentTF]) {
            const klines = marketData.klines[currentTF];

            if (klines.length > 0) {
                // Determine if we need to reset the data (different symbol/tf) or update
                const formatted: CandlestickData[] = klines
                    .map((k: any) => ({
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

                            const mapToSeries = (arr: number[]) =>
                                arr
                                    .map((val: number, i: number) => ({
                                        time: unique[i].time,
                                        value: val,
                                    }))
                                    .filter((d) => !isNaN(d.value));

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

                    if (isInitialLoad) {
                        chart.timeScale().fitContent();
                        isInitialLoad = false;
                    }
                } catch (e) {
                    console.error("[CandleChartView] Render error:", e);
                }
            }
        } else {
            // console.warn(`[CandleChart] No data found for ${normalized} in marketState`);
        }
    });

    function setTimeframe(tf: string) {
        timeframe = tf;
        isInitialLoad = true;
    }
</script>

<div
    class="chart-view h-full w-full flex flex-col overflow-hidden rounded-b-xl border border-[rgba(255,255,255,0.05)]"
>
    <div
        class="chart-header flex justify-between items-center p-2 px-4 bg-[rgba(0,0,0,0.3)] border-b border-[rgba(255,255,255,0.05)]"
    >
        <div class="symbol-info flex items-center gap-2">
            <span class="symbol-name font-bold text-sm tracking-widest"
                >{symbol}</span
            >
            <div class="timeframe-selector flex gap-1 ml-4">
                {#each timeframes as tf}
                    <button
                        class="px-2 py-0.5 text-[10px] rounded transition-all {timeframe ===
                        tf
                            ? 'bg-[var(--accent-color)] text-black font-bold'
                            : 'bg-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.1)] text-[var(--text-secondary)]'}"
                        onclick={() => setTimeframe(tf)}
                    >
                        {tf.toUpperCase()}
                    </button>
                {/each}
            </div>
        </div>
        <div
            class="chart-status text-[10px] text-[var(--text-tertiary)] flex items-center gap-2"
        >
            <span
                class="pulse-dot w-1.5 h-1.5 rounded-full bg-[var(--success-color)] shadow-[0_0_5px_var(--success-color)]"
            ></span>
            LIVE
        </div>
    </div>

    <div
        bind:this={chartContainer}
        class="chart-container flex-1 min-h-0 w-full relative"
    >
        {#if !marketState.data[normalizeSymbol(symbol, "bitunix")]?.klines[timeframe]}
            <div
                class="absolute inset-0 flex items-center justify-center bg-[rgba(0,0,0,0.4)] backdrop-blur-sm z-10"
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
            rgba(30, 30, 40, 0.4),
            rgba(10, 10, 15, 0.9)
        );
    }

    .pulse-dot {
        animation: pulse 2s infinite;
    }

    @keyframes pulse {
        0% {
            opacity: 1;
            transform: scale(1);
        }
        50% {
            opacity: 0.5;
            transform: scale(0.8);
        }
        100% {
            opacity: 1;
            transform: scale(1);
        }
    }

    .chart-container :global(.tv-lightweight-charts) {
        border-radius: 0 0 12px 12px;
    }

    .loading-spinner {
        filter: drop-shadow(0 0 8px var(--accent-color));
    }
</style>
