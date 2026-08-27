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
    import { onMount, untrack, mount, unmount } from "svelte";
    import { _ } from "../../../locales/i18n";
    import type { TranslationKey } from "../../../locales/schema";
    import {
        createChart,
        ColorType,
        CandlestickSeries,
        type IChartApi,
        type ISeriesApi,
        type CandlestickData,
        type Time,
        type LogicalRange,
    } from "lightweight-charts";
    import { Decimal } from "decimal.js";
    import { get } from "svelte/store";
    import { IndicatorLayer, type IndicatorPaneInfo } from "../../../lib/chart/indicatorLayer";
    import type { ChartRow } from "../../../lib/chart/seriesMap";
    import IndicatorPaneHeader from "../../../components/shared/IndicatorPaneHeader.svelte";
    import { marketState } from "../../../stores/market.svelte";
    import { indicatorState } from "../../../stores/indicator.svelte";
    import { settingsState } from "../../../stores/settings.svelte";
    import { accountState } from "../../../stores/account.svelte";
    import { tpSlState } from "../../../stores/tpsl.svelte";
    import { normalizeSymbol } from "../../../utils/symbolUtils";
    import { marketWatcher } from "../../../services/marketWatcher";
    import { activeExchange } from "../../../services/exchange";
    import { toastService } from "../../../services/toastService.svelte";
    import { appFetch } from "../../appAuth";
    import { unwrapApiEnvelope, formatDynamicDecimal, deriveTickSizeFromPrice } from "../../../utils/utils";
    import {
        buildAxisFormatters,
        formatCountdown,
        mapPriceScaleMode,
        nextCandleCloseTime,
        resolveChartPriceDecimals,
    } from "../../../utils/chartDisplay";
    import type { NormalizedPosition, NormalizedOrder } from "../../../types/exchange";
    import {
        PriceLineManager,
        type TpSlKind,
    } from "../../../services/chart/priceLineManager";
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
        toggleTimeframeDropdown: _toggleTimeframeDropdown,
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
            if (current.length >= 10) return;
            current.push(tf);
        }
        settingsState.favoriteTimeframes = current;
        updateHeaderControls?.();
    }

    let chartContainer: HTMLElement | null = $state(null);
    let chart: IChartApi | null = $state(null);
    let candleSeries: ISeriesApi<"Candlestick"> | null = $state(null);

    // Indicator Layer (overlays + sub-panes; replaces the old EMA series trio)
    let indicatorLayer: IndicatorLayer | null = null;
    // Svelte components mounted directly into each visible sub-pane's own
    // DOM element (see syncPaneHeaders) to show its name + enable/disable
    // toggle without lightweight-charts having any pane-header concept.
    let paneHeaderInstances: object[] = [];

    let isInitialLoad = $state(true);
    let isLoadingHistory = $state(false);
    let allHistoryLoaded = $state(false);
    let lastRenderedTime: Time | null = $state(null);
    let lastRenderedCount = $state(0);
    let lastRenderedSettingsJson = $state("");
    let lastRenderTimestamp = 0;
    let renderThrottleTimer: ReturnType<typeof setTimeout> | null = null;

    // FEAT-0247: position and TP/SL price lines
    let priceLineManager: PriceLineManager | null = null;

    // FEAT-0247: accountState.positions is otherwise only REST-hydrated from
    // PositionsSidebar.svelte's onMount (see BUG-0249's root cause #2) — a
    // chart window opened on its own, without the sidebar mounted, would
    // never see an already-open position and the lines would silently never
    // appear. Mirrors PositionsSidebar's fetchPositions(); harmless if the
    // sidebar already hydrated the same data (accountState.hydratePositions
    // just replaces the array).
    async function hydratePositionsIfEmpty() {
        if (accountState.positions.length > 0) return;
        const provider = settingsState.apiProvider || "bitunix";
        const keys = settingsState.apiKeys[provider];
        if (!keys?.key || !keys?.secret) return;
        try {
            const response = await appFetch("/api/positions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Api-Key": keys.key,
                    "X-Api-Secret": keys.secret,
                    ...(keys.passphrase ? { "X-Api-Passphrase": keys.passphrase } : {}),
                },
                body: JSON.stringify({ exchange: provider }),
            });
            const json = await response.json();
            const { data } = unwrapApiEnvelope<{ positions: NormalizedPosition[] }>(json);
            if (data?.positions) accountState.hydratePositions(data.positions);
        } catch (e) {
            console.error("[CandleChartView] FEAT-0247: position hydration failed:", e);
        }
    }

    // FEAT-0247: same standalone-window gap as hydratePositionsIfEmpty, but
    // for resting (unfilled) limit orders — needed so a pending entry order
    // shows a line on the chart even before it fills into a position, which
    // is the case a trader most wants to visually confirm before risking
    // real size on it.
    async function hydrateOpenOrdersIfEmpty() {
        if (accountState.openOrders.length > 0) return;
        const provider = settingsState.apiProvider || "bitunix";
        const keys = settingsState.apiKeys[provider];
        if (!keys?.key || !keys?.secret) return;
        try {
            const response = await appFetch("/api/orders", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Api-Key": keys.key,
                    "X-Api-Secret": keys.secret,
                    ...(keys.passphrase ? { "X-Api-Passphrase": keys.passphrase } : {}),
                },
                body: JSON.stringify({ exchange: provider, type: "pending" }),
            });
            const json = await response.json();
            if (json?.orders) accountState.hydrateOpenOrders(json.orders as NormalizedOrder[]);
        } catch (e) {
            console.error("[CandleChartView] FEAT-0247: open order hydration failed:", e);
        }
    }

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
            // FEAT-0247's priceLineManager draws its own explicit Entry/Liq/
            // B/E/TP/SL lines — the series' own default last-value line would
            // just duplicate/clutter those.
            priceLineVisible: false,
        });

        // Indicator overlay/sub-pane layer (EMA, SMA, oscillators, volume…).
        // Replaces the old EMA-only trio. Height-gated sub-panes keep a small
        // chart window from being cluttered with unusable mini-panes.
        indicatorLayer = new IndicatorLayer(chart, getVar, syncPaneHeaders);
        // Seed the real height straight away: the layer defaults to the
        // minimum, and waiting for the ResizeObserver's first callback means
        // the initial render can lay out sub-panes for a chart far shorter
        // than the one actually on screen.
        indicatorLayer.setAvailableHeight(chartContainer.clientHeight);
        untrack(() => updateColors());

        priceLineManager = new PriceLineManager(candleSeries, {
            onDragStart: () => {
                chart?.applyOptions({ handleScroll: false, handleScale: false });
            },
            onDragCancel: () => {
                chart?.applyOptions({ handleScroll: true, handleScale: true });
            },
            onDrop: (kind, orderId, price) => {
                chart?.applyOptions({ handleScroll: true, handleScale: true });
                untrack(() => handleTpSlDrop(kind, orderId, price));
            },
        });
        if (chartContainer) priceLineManager.attach(chartContainer);
        void hydratePositionsIfEmpty();
        void hydrateOpenOrdersIfEmpty();

        const handleResize = () => {
            if (chart && chartContainer) {
                chart.applyOptions({
                    width: chartContainer.clientWidth,
                    height: chartContainer.clientHeight,
                });
                indicatorLayer?.setAvailableHeight(chartContainer.clientHeight);
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
            priceLineManager?.destroy();
            priceLineManager = null;
            indicatorLayer?.destroy();
            indicatorLayer = null;
            if (chart) chart.remove();
        };
    });

    /**
     * FEAT-0247: a TP/SL line was dragged and dropped at `price`. Goes
     * through `activeExchange().trading.modifyTpSlOrder` — the same gated
     * (FEAT-0011) path the TP/SL edit modal uses (core code talks to
     * exchanges only through the adapter, see FEAT-0016) — so a drag on the
     * chart carries the same audit trail and risk checks as any other order
     * mutation.
     */
    async function handleTpSlDrop(kind: TpSlKind, orderId: string, price: Decimal) {
        const planType = kind === "takeProfit" ? "PROFIT" : "LOSS";
        try {
            await activeExchange().trading.modifyTpSlOrder({
                orderId,
                symbol: normalizeSymbol(symbol, "bitunix"),
                planType,
                triggerPrice: price.toString(),
            });
            toastService.success(
                get(_)("trade.tpSlUpdated") ||
                    "TP/SL updated",
            );
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            toastService.error(
                get(_)("trade.tpSlUpdateFailed", {
                    values: { msg },
                }) || `TP/SL update failed: ${msg}`,
            );
        } finally {
            // Whether it succeeded or was refused, the on-chart line must
            // reflect the resting order's real price, not the dropped one —
            // refetch rather than trust the optimistic drag position.
            tpSlState.invalidate();
            void tpSlState.ensureFresh(Date.now());
        }
    }

    async function loadMore() {
        if (isLoadingHistory || allHistoryLoaded) return;
        isLoadingHistory = true;

        try {
            const result = await marketWatcher.loadMoreHistory(
                normalizeSymbol(symbol, "bitunix"),
                timeframe,
            );
            // BUG-0296: only a *successful* fetch with nothing older on the
            // exchange ends history loading here. An "error" (or "busy")
            // must keep the flag open so the next scroll-left retries — one
            // transient network blip used to permanently disable history
            // loading for every timeframe of this window.
            if (result === "exhausted") {
                allHistoryLoaded = true;
            }
        } finally {
            // Small delay to prevent rapid refiring
            setTimeout(() => {
                isLoadingHistory = false;
            }, 500);
        }
    }

    // BUG-0296: history-loading state belongs to one symbol+timeframe
    // combination. Switching either in the same chart window must re-arm
    // loading, otherwise an `allHistoryLoaded` from a previous timeframe
    // (e.g. set by exhaustion or a past failure) silently blocks back-fill
    // for the newly selected one.
    $effect(() => {
        // Track both props; reset without depending on other reactive reads.
        void symbol;
        void timeframe;
        untrack(() => {
            allHistoryLoaded = false;
            isLoadingHistory = false;
        });
    });

    // Helper to resolve CSS variables
    function getVar(name: string): string {
        if (typeof window === "undefined") return "";
        return getComputedStyle(document.documentElement)
            .getPropertyValue(name)
            .trim();
    }

    // IndicatorLayer reports the currently-visible sub-panes after every
    // render (it tears down and rebuilds all panes each time, so pane
    // indices are not stable across renders — headers must be fully
    // unmounted and remounted in lock-step rather than diffed/reused).
    function syncPaneHeaders(panes: IndicatorPaneInfo[]): void {
        for (const instance of paneHeaderInstances) {
            unmount(instance);
        }
        paneHeaderInstances = [];
        if (!chart) return;

        for (const p of panes) {
            const pane = chart.panes()[p.paneIndex];
            const el = pane?.getHTMLElement();
            if (!el) continue;
            // The header is absolutely positioned to sit inside just this
            // pane; without an explicit positioning context here it would
            // escape to the nearest ancestor that has one (chart-container),
            // landing at the top of the whole chart instead of this pane.
            if (getComputedStyle(el).position === "static") {
                el.style.position = "relative";
            }
            const instance = mount(IndicatorPaneHeader, {
                target: el,
                props: {
                    title: get(_)(p.titleKey as TranslationKey) || p.key,
                    params: p.params,
                },
            });
            paneHeaderInstances.push(instance);
        }
    }

    function updateColors() {
        if (!chart || !candleSeries) return;

        const success = getVar("--success-color") || "#26a69a";
        const danger = getVar("--danger-color") || "#ef5350";
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

        // Indicator series are re-colored by re-rendering from the last data.
        indicatorLayer?.applyTheme();
    }

    // Reactive chart options driven by the Chart settings tab. Mirrors the
    // initial createChart options; updateColors() above only owns colors,
    // this effect owns structure (scale mode, grid, crosshair, time scale,
    // price format). The defaults equal the previously hard-coded values, so
    // a fresh install renders exactly as before.
    $effect(() => {
        if (!chart || !candleSeries) return;

        const crosshairModeMap = { normal: 0, magnet: 1, hidden: 2 } as const;
        // lightweight-charts LineStyle: Solid=0, Dotted=1, Dashed=2
        const crosshairStyleMap = { solid: 0, dotted: 1, dashed: 2 } as const;

        const normalized = normalizeSymbol(symbol, "bitunix");
        const quotePrecision =
            marketState?.symbolMeta?.[normalized]?.quotePrecision;
        const decimals = resolveChartPriceDecimals(
            settingsState.chartDecimalsMode,
            settingsState.chartFixedDecimals,
            quotePrecision,
        );
        const minMove = new Decimal(10).pow(-decimals).toNumber();
        // The stock secondsVisible only affects Second-weight ticks, which
        // never occur at >=1m timeframes - the formatters make the toggle
        // real (UTC labels with :SS appended when enabled).
        const axisFormatters = buildAxisFormatters(
            settingsState.chartSecondsVisible,
        );

        chart.applyOptions({
            grid: {
                vertLines: { visible: settingsState.chartShowGrid },
                horzLines: { visible: settingsState.chartShowGrid },
            },
            rightPriceScale: {
                visible: win.showRightScale ?? true,
                mode: mapPriceScaleMode(settingsState.chartPriceScaleMode),
                autoScale: settingsState.chartAutoScale,
                invertScale: settingsState.chartInvertScale,
            },
            crosshair: {
                mode: crosshairModeMap[settingsState.chartCrosshairMode],
                vertLine: { style: crosshairStyleMap[settingsState.chartCrosshairStyle] },
                horzLine: { style: crosshairStyleMap[settingsState.chartCrosshairStyle] },
            },
            timeScale: {
                secondsVisible: settingsState.chartSecondsVisible,
                fixLeftEdge: settingsState.chartFixEdges,
                fixRightEdge: settingsState.chartFixEdges,
                tickMarkFormatter: axisFormatters.tickMarkFormatter,
            },
            localization: {
                timeFormatter: axisFormatters.timeFormatter,
            },
        });

        candleSeries.applyOptions({
            borderVisible: settingsState.chartCandleBorders,
            lastValueVisible: settingsState.chartLastValueVisible,
            priceFormat: { type: "price", precision: decimals, minMove },
        });
    });

    // Candle-close countdown: a cheap interval only runs while the feature
    // is enabled; the derived text recomputes from the latest kline open
    // time so it survives timeframe/symbol switches without extra state.
    let countdownNow = $state(Date.now());

    $effect(() => {
        if (!settingsState.chartCountdownEnabled) return;
        const id = setInterval(() => {
            countdownNow = Date.now();
        }, 500);
        return () => clearInterval(id);
    });

    const countdownText = $derived.by(() => {
        if (!settingsState.chartCountdownEnabled) return null;
        void countdownNow; // interval tick driver
        const klines =
            marketState.data[normalizeSymbol(symbol, "bitunix")]?.klines?.[
                timeframe
            ];
        const last = klines?.[klines.length - 1];
        if (!last?.time) return null;
        const closeTime = nextCandleCloseTime(last.time, timeframe);
        if (closeTime === null) return null;
        return formatCountdown(closeTime - countdownNow);
    });

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

        // Track the full indicator toggle/param state so toggling any
        // indicator (from the Settings tab or an on-chart pane header) forces
        // the slow path below instead of being swallowed by the live-tick
        // fast path, which only updates the candle series, not IndicatorLayer.
        const currentIndicatorSettingsJson = indicatorState._cachedJson;

        if (klines) {
            if (klines.length > 0) {
                // Optimization: Check if this is just a live update to the last candle
                const lastKline = klines[klines.length - 1];
                const lastTime = (lastKline.time / 1000) as Time;
                const isLiveUpdate =
                    lastRenderedSettingsJson === currentIndicatorSettingsJson &&
                    lastRenderedTime === lastTime &&
                    klines.length === lastRenderedCount;

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
                                // Format from the raw kline string via
                                // Decimal: a hard-coded toFixed(2) truncated
                                // low-priced symbols (PEPE etc.) to 0.00.
                                // Same precision source as the price axis.
                                const decimals = resolveChartPriceDecimals(
                                    settingsState.chartDecimalsMode,
                                    settingsState.chartFixedDecimals,
                                    marketState?.symbolMeta?.[
                                        normalizeSymbol(symbol, "bitunix")
                                    ]?.quotePrecision,
                                );
                                win.currentPrice = formatDynamicDecimal(
                                    currentLastKline.close,
                                    decimals,
                                );
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

                    // Align volume to each candle by time so the indicator
                    // layer (volume pane, VWAP, OBV, MFI…) gets correct input.
                    const volByTime = new Map<number, number>();
                    for (const k of klines) {
                        const t = Number(k.time / 1000);
                        if (!volByTime.has(t)) {
                            volByTime.set(t, Number(k.volume));
                        }
                    }
                    const rows: ChartRow[] = unique.map((c) => {
                        const t = Number(c.time);
                        return {
                            time: c.time,
                            open: c.open,
                            high: c.high,
                            low: c.low,
                            close: c.close,
                            volume: volByTime.get(t) ?? 0,
                        };
                    });

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
                        lastRenderedSettingsJson = currentIndicatorSettingsJson;
                        lastRenderTimestamp = 0;
                        isInitialLoad = false;

                        // Render the full indicator layer (overlays + sub-panes).
                        // The layer reads indicatorState itself, so no extra
                        // wiring beyond passing the aligned candle rows.
                        indicatorLayer?.render(rows);
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

    // FEAT-0247: keep the Entry/Liquidation/TP/SL price lines in sync with
    // the live position, the resting TP/SL plans, and the active exchange's
    // tick size — and with whether it supports editing them at all.
    $effect(() => {
        // `candleSeries` (reactive $state) is read purely so this effect
        // re-runs once the chart mounts and `priceLineManager` stops being
        // null — the manager itself is a plain field, not a rune.
        if (!candleSeries || !priceLineManager) return;

        const normalized = normalizeSymbol(symbol, "bitunix");
        const position = accountState.positions.find((p) => p.symbol === normalized);
        const plans = tpSlState.plansFor(normalized);
        // Bitunix lets a bracket TP/SL be attached at order placement, before
        // the entry order fills into a position — those live on the order
        // itself (tpPrice/slPrice), not in tpSlState, which only tracks
        // plans against an already-open position.
        const matchingOrders = accountState.openOrders.filter((o) => o.symbol === normalized && o.type === "limit");
        // FEAT-0247 diagnostic: bracket TP/SL on a resting order was
        // reported as invisible even though the exchange has it set. Log
        // the raw tpPrice/slPrice this component actually sees on each
        // matching order, to tell apart "the fields never arrived from the
        // exchange/hydration" from "they arrived but something here drops
        // them" (falsy 0/empty-string, wrong symbol match, etc).
        if (matchingOrders.length > 0) {
            console.debug(
                "[CandleChartView] FEAT-0247: pending orders for symbol",
                matchingOrders.map((o) => ({
                    orderId: o.orderId,
                    symbol: o.symbol,
                    type: o.type,
                    status: o.status,
                    tpPrice: o.tpPrice,
                    slPrice: o.slPrice,
                })),
            );
        }
        const pendingOrders = matchingOrders.flatMap((o) => {
            const lines: { orderId: string; price: Decimal; side: "buy" | "sell"; kind: "entry" | "takeProfit" | "stopLoss" }[] = [
                { orderId: o.orderId, price: o.price, side: o.side, kind: "entry" },
            ];
            if (o.tpPrice) {
                lines.push({ orderId: `${o.orderId}-tp`, price: new Decimal(o.tpPrice), side: o.side, kind: "takeProfit" as const });
            }
            if (o.slPrice) {
                lines.push({ orderId: `${o.orderId}-sl`, price: new Decimal(o.slPrice), side: o.side, kind: "stopLoss" as const });
            }
            return lines;
        });
        const meta = marketState?.symbolMeta?.[normalized];
        // Read outside the reactive graph: tracking the kline array would
        // re-run this whole price-lines effect on every live tick. The
        // fallback only needs a reasonably fresh close to estimate the tick.
        const lastClose = untrack(() => {
            const klines = marketState.data[normalized]?.klines?.[timeframe];
            return klines?.[klines.length - 1]?.close;
        });
        const tickSize =
            meta?.quotePrecision !== undefined
                ? new Decimal(10).pow(-meta.quotePrecision)
                : deriveTickSizeFromPrice(lastClose) ?? new Decimal("0.01");
        const readOnly = activeExchange().supports.tpSl === false;

        untrack(() => {
            void tpSlState.ensureFresh();
            priceLineManager?.update({
                position: position
                    ? {
                          side: position.side,
                          entryPrice: position.entryPrice,
                          liquidationPrice: position.liquidationPrice,
                          breakEvenPrice: position.breakEvenPrice,
                          size: position.size,
                      }
                    : null,
                takeProfit: plans.profit
                    ? { orderId: plans.profit.orderId, triggerPrice: new Decimal(plans.profit.triggerPrice) }
                    : null,
                stopLoss: plans.loss
                    ? { orderId: plans.loss.orderId, triggerPrice: new Decimal(plans.loss.triggerPrice) }
                    : null,
                pendingOrders,
                tickSize,
                readOnly,
                colors: {
                    // Entry line tracks unrealizedPnl (live via WS), not a
                    // fixed neutral color: red means the position is
                    // currently underwater, green means it's in profit —
                    // the same signal a trader reads off the PnL number.
                    entry: position?.unrealizedPnl.isNegative()
                        ? getVar("--danger-color") || "#ef5350"
                        : getVar("--success-color") || "#26a69a",
                    liquidation: getVar("--danger-color") || "#ef5350",
                    breakEven: getVar("--warning-color") || "#ffb300",
                    takeProfit: getVar("--success-color") || "#26a69a",
                    stopLoss: getVar("--danger-color") || "#ef5350",
                    pendingOrder: getVar("--text-secondary") || "#787b86",
                },
            });
        });
    });
</script>

<div
    class="chart-view h-full w-full flex flex-col overflow-hidden rounded-b-xl border border-[var(--border-color)] relative"
>
    {#if showTimeframeDropdown}
        <div
            class="absolute top-2 left-2 z-30 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-3.5 shadow-2xl w-[320px] text-[var(--text-primary)] flex flex-col gap-3 font-sans animate-fade-in"
        >
            <div class="flex justify-between items-center border-b border-[var(--border-color)] pb-2">
                <span class="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">{$_("settings.trading.selectPeriod")}</span>
                <div class="flex items-center gap-2">
                    <span class="text-[10px] text-[var(--warning-color)] font-mono">
                        {settingsState.favoriteTimeframes?.length || 0}/10 ★
                    </span>
                    <button
                        type="button"
                        class="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs px-1"
                        onclick={() => closeTimeframeDropdown?.()}
                        aria-label={$_("common.close")}
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
                            : 'bg-[var(--bg-tertiary)] border-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-primary)] hover:text-[var(--text-primary)]'}"
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
                            class="text-xs px-0.5 hover:scale-125 transition-transform outline-none cursor-pointer {isFav ? 'text-[var(--warning-color)] font-bold' : 'text-[var(--text-secondary)] opacity-40 hover:opacity-100'}"
                            onclick={(e) => toggleFavorite(tf, e)}
                            title={isFav ? $_("marketOverview.tooltips.removeFavorite") : $_("marketOverview.tooltips.addFavorite")}
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
        {#if settingsState.chartWatermark}
            <!-- Painted before the chart mounts, so the canvas stacks above it
                 naturally; pointer-events-none keeps scroll/zoom untouched. -->
            <div
                class="absolute inset-0 z-0 flex items-center justify-center pointer-events-none select-none overflow-hidden"
                aria-hidden="true"
            >
                <span
                    class="text-[6rem] md:text-[8rem] font-extrabold uppercase tracking-widest text-[var(--text-primary)] opacity-[0.05] whitespace-nowrap"
                >
                    {symbol}
                </span>
            </div>
        {/if}

        {#if countdownText}
            <div
                class="absolute top-2 right-16 z-20 pointer-events-none"
                role="timer"
                aria-label={$_("chartView.countdownLabel")}
            >
                <div
                    class="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-md px-2 py-0.5 shadow font-mono text-xs text-[var(--text-primary)]"
                >
                    {countdownText}
                </div>
            </div>
        {/if}

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
                        >{$_("chartView.loadingHistory")}</span
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
                        >{$_("chartView.fetchingMarketData")}</span
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
        /* Pin the chart above the optional watermark overlay: when the
           watermark {#if} block mounts later than the chart, Svelte inserts
           it before the template anchors - i.e. after the chart's appended
           canvas in DOM order - so without an explicit stacking context the
           watermark would tint the candles instead of sitting behind them. */
        position: relative;
        z-index: 1;
    }

    .loading-spinner {
        filter: drop-shadow(0 0 8px var(--accent-color));
    }
</style>
