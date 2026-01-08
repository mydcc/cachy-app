<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { tradeStore, updateTradeStore } from "../../stores/tradeStore";
    import { settingsStore } from "../../stores/settingsStore";
    import { indicatorStore } from "../../stores/indicatorStore";
    import { marketStore } from "../../stores/marketStore";
    import { bitunixWs } from "../../services/bitunixWs";
    import { apiService } from "../../services/apiService";
    import { technicalsService, type TechnicalsData } from "../../services/technicalsService";
    import { icons } from "../../lib/constants";
    import { _ } from "../../locales/i18n";
    import { formatDynamicDecimal, normalizeTimeframeInput } from "../../utils/utils";
    import { Decimal } from "decimal.js";
    import Tooltip from "../shared/Tooltip.svelte";

    export let isVisible: boolean = false;

    let klinesHistory: any[] = [];
    let data: TechnicalsData | null = null;
    let loading = false;
    let error: string | null = null;
    let refreshInterval: any;
    let showTimeframePopup = false;
    let customTimeframeInput = "";
    let currentSubscription: string | null = null;

    // Use analysisTimeframe for Technicals, NOT atrTimeframe
    $: symbol = $tradeStore.symbol;
    $: timeframe = $tradeStore.analysisTimeframe || '1h';
    $: showPanel = $settingsStore.showTechnicals && isVisible;
    $: indicatorSettings = $indicatorStore;

    // Candle Settings
    $: showCandle = $settingsStore.showTechnicalsCandle;
    $: candleScaling = $settingsStore.technicalsCandleScaling || 'auto';
    $: candleStyle = $settingsStore.technicalsCandleStyle || 'solid';

    // Derived display label for Pivots
    $: pivotLabel = indicatorSettings?.pivots?.type
        ? `Pivots (${indicatorSettings.pivots.type.charAt(0).toUpperCase() + indicatorSettings.pivots.type.slice(1)})`
        : 'Pivots (Classic)';

    // React to Market Store updates for real-time processing
    $: wsData = symbol ? ($marketStore[symbol] || $marketStore[symbol.replace('P', '')] || $marketStore[symbol + 'USDT']) : null;
    $: if (showPanel && wsData?.kline && klinesHistory.length > 0) {
        handleRealTimeUpdate(wsData.kline);
    }

    // Trigger fetch/subscribe when relevant props change
    $: if (showPanel && symbol && timeframe) {
        // If symbol or timeframe changed, we need to reset and fetch fresh
        if (currentSubscription !== `${symbol}:${timeframe}`) {
            unsubscribeWs(); // Unsubscribe previous
            fetchData().then(() => {
                subscribeWs(); // Subscribe new
            });
            currentSubscription = `${symbol}:${timeframe}`;
        }
    } else if (!showPanel) {
        unsubscribeWs();
        currentSubscription = null;
    }

    // Re-calculate when settings change (without re-fetching)
    $: if (showPanel && klinesHistory.length > 0 && indicatorSettings) {
        data = technicalsService.calculateTechnicals(klinesHistory, indicatorSettings);
    }

    function subscribeWs() {
        if (symbol && timeframe && $settingsStore.apiProvider === 'bitunix') {
            const channel = `market_kline_${timeframe}`;
            bitunixWs.subscribe(symbol, channel);
        }
    }

    function unsubscribeWs() {
        if (currentSubscription) {
            const [oldSymbol, oldTimeframe] = currentSubscription.split(':');
            if (oldSymbol && oldTimeframe && $settingsStore.apiProvider === 'bitunix') {
                 const channel = `market_kline_${oldTimeframe}`;
                 bitunixWs.unsubscribe(oldSymbol, channel);
            }
        }
    }

    function handleRealTimeUpdate(newKline: any) {
        if (!klinesHistory || klinesHistory.length === 0) return;

        // Bitunix kline update contains o,h,l,c (Decimal objects from store)
        // We need to check if this is an update to the last candle or a new one.
        // Bitunix WS doesn't always send timestamp in kline payload (updateKline in marketStore doesn't store it?)
        // Wait, marketStore updateKline doesn't store timestamp!
        // We assume it's the LATEST candle.

        // In a robust implementation, we'd check timestamps.
        // However, for a simple update: we assume the WS stream corresponds to the "current" candle.
        // So we update the last element of our history.

        // Clone array to trigger reactivity? Or just modify.
        const lastIdx = klinesHistory.length - 1;
        // Make sure we have Decimal values (marketStore provides Decimals)

        // Warning: The history from REST might have slightly different format than WS?
        // REST: { open, high, low, close, volume, timestamp? }
        // WS (marketStore): { open, high, low, close, volume } (Decimals)

        // Let's perform a shallow merge/update of the last candle
        klinesHistory[lastIdx] = {
            ...klinesHistory[lastIdx], // Preserve timestamp if it exists
            open: newKline.open,
            high: newKline.high,
            low: newKline.low,
            close: newKline.close,
            volume: newKline.volume
        };

        // Re-calculate technicals with settings
        data = technicalsService.calculateTechnicals(klinesHistory, indicatorSettings);
    }

    async function fetchData(silent = false) {
        if (!symbol) return;
        if (!silent) loading = true;
        error = null;

        try {
            // Fetch history
            const klines = await apiService.fetchBitunixKlines(symbol, timeframe, 250);
            klinesHistory = klines;
            data = technicalsService.calculateTechnicals(klinesHistory, indicatorSettings);
        } catch (e) {
            console.error("Technicals fetch error:", e);
            error = "Failed to load";
        } finally {
            loading = false;
        }
    }

    onDestroy(() => {
        unsubscribeWs();
    });

    function getActionColor(action: string) {
        if (action === 'Buy') return 'text-[var(--success-color)]';
        if (action === 'Sell') return 'text-[var(--danger-color)]';
        return 'text-[var(--text-secondary)]';
    }

    function formatVal(val: number) {
        return new Decimal(val).toDecimalPlaces(2).toString();
    }

    function toggleTimeframePopup() {
        showTimeframePopup = !showTimeframePopup;
    }

    function setTimeframe(tf: string) {
        updateTradeStore(s => ({ ...s, analysisTimeframe: tf }));
        showTimeframePopup = false;
    }

    function handleCustomTimeframeSubmit() {
        if (!customTimeframeInput) return;
        const normalized = normalizeTimeframeInput(customTimeframeInput);
        if (normalized) {
            setTimeframe(normalized);
            customTimeframeInput = "";
        }
    }

    function handleClickOutside(event: MouseEvent) {
        if (showTimeframePopup && !(event.target as HTMLElement).closest('.timeframe-selector-container')) {
            showTimeframePopup = false;
        }
    }

    // --- Single Candle Calculation ---
    // Extract current kline from history or WS data
    $: currentKline = klinesHistory.length > 0 ? klinesHistory[klinesHistory.length - 1] : null;

    // Reactive Geometry for CSS
    $: candleGeometry = calculateCandleGeometry(currentKline, candleScaling);

    function calculateCandleGeometry(kline: any, scaling: string) {
        if (!kline) return null;

        const o = new Decimal(kline.open).toNumber();
        const h = new Decimal(kline.high).toNumber();
        const l = new Decimal(kline.low).toNumber();
        const c = new Decimal(kline.close).toNumber();

        const isBullish = c >= o;
        const color = isBullish ? 'var(--success-color)' : 'var(--danger-color)';

        let topPct = 0;
        let heightPct = 0;
        let wickTopPct = 0;
        let wickHeightPct = 0;

        if (scaling === 'auto') {
            // High = 0% (top of container), Low = 100% (bottom of container)
            // Range must be non-zero
            const range = h - l;
            if (range === 0) {
                // Flat line centered
                topPct = 50;
                heightPct = 1; // min height
                wickTopPct = 50;
                wickHeightPct = 0;
            } else {
                // Coordinate system: Top is 0%.
                // Open/Close Top = (High - max(o,c)) / range * 100
                const bodyTopVal = Math.max(o, c);
                const bodyBottomVal = Math.min(o, c);

                const bodyTopOffset = h - bodyTopVal;
                topPct = (bodyTopOffset / range) * 100;

                const bodyHeightVal = bodyTopVal - bodyBottomVal;
                // Ensure at least 1px visibility if range exists but o==c (doji)
                heightPct = Math.max((bodyHeightVal / range) * 100, 1);

                // Wicks always cover full High-Low in Auto mode
                wickTopPct = 0;
                wickHeightPct = 100;
            }
        } else if (scaling === 'atr') {
            // Scale relative to ATR.
            // Let's define: Container Height = 2 * ATR (arbitrary but reasonable).
            // Center of Candle = Center of Container.

            // Try to get ATR from tradeStore (if calculated) or fallback to recent range avg
            let referenceRange = 0;

            // Fallback: Use High-Low of the last completed candle if no ATR
            if ($tradeStore.atrValue) {
                referenceRange = $tradeStore.atrValue * 2; // e.g. 2x ATR for full height
            } else {
                // If no ATR available, fallback to 1.5x current range (makes it look slightly smaller than full)
                 referenceRange = (h - l) * 1.5;
            }

            if (referenceRange === 0) referenceRange = 1; // prevention

            const range = h - l;

            // Calculate pixel/percent per price unit
            // 100% height = referenceRange

            // Center point of the candle (Midpoint of H/L)
            const midPrice = (h + l) / 2;

            // We want midPrice to be at 50% of container.
            // Price at Top (0%) = midPrice + (referenceRange / 2)
            // Price at Bottom (100%) = midPrice - (referenceRange / 2)

            const maxVisiblePrice = midPrice + (referenceRange / 2);

            const bodyTopVal = Math.max(o, c);
            const bodyBottomVal = Math.min(o, c);

            // % from Top = (MaxVisible - Val) / ReferenceRange * 100

            topPct = ((maxVisiblePrice - bodyTopVal) / referenceRange) * 100;
            heightPct = Math.max(((bodyTopVal - bodyBottomVal) / referenceRange) * 100, 1);

            wickTopPct = ((maxVisiblePrice - h) / referenceRange) * 100;
            wickHeightPct = (range / referenceRange) * 100;
        }

        return {
            color,
            top: `${topPct}%`,
            height: `${heightPct}%`,
            wickTop: `${wickTopPct}%`,
            wickHeight: `${wickHeightPct}%`
        };
    }
</script>

<svelte:window on:click={handleClickOutside} />

{#if showPanel}
    <div class="technicals-panel p-3 flex w-full md:w-64 transition-all relative overflow-hidden">

        <!-- Real-time Candle Visualization -->
        {#if showCandle && candleGeometry}
            <div class="mr-3 relative h-auto w-1 flex-shrink-0 self-stretch my-1"
                 style="min-height: 100px;"> <!-- Ensure minimum height for container if content is short -->

                <!-- Wick Layer -->
                {#if candleStyle === 'classic'}
                    <!-- Classic: Thin 1px wick, centered -->
                    <div class="absolute bg-[var(--text-secondary)] opacity-50 w-[1px] left-1/2 -translate-x-1/2 transition-all duration-100 ease-out"
                         style="top: {candleGeometry.wickTop}; height: {candleGeometry.wickHeight};">
                    </div>
                {:else}
                    <!-- Solid: Full width (4px) wick (gray block) behind body -->
                    <div class="absolute bg-[var(--text-secondary)] opacity-30 w-full left-0 transition-all duration-100 ease-out rounded-sm"
                         style="top: {candleGeometry.wickTop}; height: {candleGeometry.wickHeight};">
                    </div>
                {/if}

                <!-- Body Layer -->
                <div class="absolute w-full left-0 transition-all duration-100 ease-out rounded-sm"
                     style="top: {candleGeometry.top}; height: {candleGeometry.height}; background-color: {candleGeometry.color}; z-index: 10;">
                </div>
            </div>
        {/if}

        <!-- Existing Content Wrapper -->
        <div class="flex flex-col gap-2 w-full min-w-0">
            <!-- Header -->
            <div class="flex justify-between items-center pb-2 timeframe-selector-container relative">
                <button
                    type="button"
                    class="font-bold text-[var(--text-primary)] cursor-pointer hover:text-[var(--accent-color)] flex items-center gap-2 bg-transparent border-none p-0"
                    on:click={toggleTimeframePopup}
                >
                    Technicals
                    <span class="text-xs bg-[var(--bg-tertiary)] px-1.5 py-0.5 rounded text-[var(--text-secondary)] ml-1 hover:bg-[var(--accent-color)] hover:text-white transition-colors">
                        {timeframe}
                    </span>
                </button>

                {#if showTimeframePopup}
                    <div class="absolute top-full left-0 mt-1 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded shadow-xl z-50 p-2 w-48 flex flex-col gap-2">
                        <!-- Row 1 -->
                        <div class="grid grid-cols-3 gap-2">
                            <button class="py-2 border border-[var(--border-color)] hover:bg-[var(--accent-color)] hover:text-white rounded text-sm font-medium" on:click={() => setTimeframe('1m')}>1m</button>
                            <button class="py-2 border border-[var(--border-color)] hover:bg-[var(--accent-color)] hover:text-white rounded text-sm font-medium" on:click={() => setTimeframe('5m')}>5m</button>
                            <button class="py-2 border border-[var(--border-color)] hover:bg-[var(--accent-color)] hover:text-white rounded text-sm font-medium" on:click={() => setTimeframe('15m')}>15m</button>
                        </div>
                        <!-- Row 2 -->
                        <div class="grid grid-cols-3 gap-2">
                            <button class="py-2 border border-[var(--border-color)] hover:bg-[var(--accent-color)] hover:text-white rounded text-sm font-medium" on:click={() => setTimeframe('1h')}>1h</button>
                            <button class="py-2 border border-[var(--border-color)] hover:bg-[var(--accent-color)] hover:text-white rounded text-sm font-medium" on:click={() => setTimeframe('4h')}>4h</button>
                            <button class="py-2 border border-[var(--border-color)] hover:bg-[var(--accent-color)] hover:text-white rounded text-sm font-medium" on:click={() => setTimeframe('1d')}>1d</button>
                        </div>
                        <!-- Row 3 Custom -->
                        <div class="flex gap-1 mt-1">
                            <input
                                type="text"
                                class="w-full text-sm p-1.5 rounded border border-[var(--border-color)] bg-[var(--bg-primary)]"
                                placeholder="e.g. 24m"
                                bind:value={customTimeframeInput}
                                on:keydown={(e) => e.key === 'Enter' && handleCustomTimeframeSubmit()}
                            />
                            <button class="px-3 bg-[var(--bg-tertiary)] hover:bg-[var(--accent-color)] hover:text-white rounded text-sm font-medium" on:click={handleCustomTimeframeSubmit}>OK</button>
                        </div>
                    </div>
                {/if}

                {#if data?.summary}
                    <div class="flex items-center gap-2 text-sm font-bold">
                        <span class={getActionColor(data.summary.action)}>{data.summary.action.toUpperCase()}</span>
                    </div>
                {/if}
            </div>

            {#if loading && !data}
                <div class="flex justify-center py-8">
                    <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--accent-color)]"></div>
                </div>
            {:else if error}
                <div class="text-[var(--danger-color)] text-center text-sm py-4">{error}</div>
            {:else if data}

                <!-- Oscillators -->
                <div class="flex flex-col gap-2">
                    <h4 class="text-xs font-bold text-[var(--text-secondary)] uppercase">Oscillators</h4>
                    <div class="text-xs grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-1">
                        {#each data.oscillators as osc}
                            <span class="text-[var(--text-primary)]">{osc.name}</span>
                            <span class="text-right text-[var(--text-secondary)] font-mono">{formatVal(osc.value)}</span>
                            <span class="text-right font-bold {getActionColor(osc.action)}">{osc.action}</span>
                        {/each}
                    </div>
                </div>

                <!-- Moving Averages -->
                <div class="flex flex-col gap-2 pt-2 border-t border-[var(--border-color)]">
                    <h4 class="text-xs font-bold text-[var(--text-secondary)] uppercase">Moving Averages</h4>
                    <div class="text-xs grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-1">
                        {#each data.movingAverages as ma}
                            <span class="text-[var(--text-primary)]">{ma.name}</span>
                            <span class="text-right text-[var(--text-secondary)] font-mono">{formatVal(ma.value)}</span>
                            <span class="text-right font-bold {getActionColor(ma.action)}">{ma.action}</span>
                        {/each}
                    </div>
                </div>

                <!-- Pivots -->
                <div class="flex flex-col gap-2 pt-2 border-t border-[var(--border-color)]">
                    <div class="flex items-center gap-1 group relative w-fit">
                        <h4 class="text-xs font-bold text-[var(--text-secondary)] uppercase cursor-help border-b border-dotted border-[var(--text-secondary)]">{pivotLabel}</h4>

                        <!-- Tooltip -->
                        <div class="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50 w-max">
                            <Tooltip>
                                <div class="flex flex-col gap-1 text-xs whitespace-nowrap bg-[var(--bg-tertiary)] text-[var(--text-primary)] p-2 rounded shadow-xl border border-[var(--border-color)]">
                                    <div class="font-bold border-b border-[var(--border-color)] pb-1 mb-1">Calculation Basis (Previous Candle)</div>
                                    <div class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                                        <span class="text-[var(--text-secondary)]">High:</span>
                                        <span class="font-mono text-right">{formatVal(data.pivotBasis.high)}</span>

                                        <span class="text-[var(--text-secondary)]">Low:</span>
                                        <span class="font-mono text-right">{formatVal(data.pivotBasis.low)}</span>

                                        <span class="text-[var(--text-secondary)]">Close:</span>
                                        <span class="font-mono text-right">{formatVal(data.pivotBasis.close)}</span>

                                        {#if indicatorSettings?.pivots?.type === 'woodie'}
                                            <span class="text-[var(--text-secondary)]">Open:</span>
                                            <span class="font-mono text-right">{formatVal(data.pivotBasis.open)}</span>
                                        {/if}
                                    </div>
                                    {#if indicatorSettings?.pivots?.type === 'fibonacci'}
                                        <div class="mt-1 pt-1 border-t border-[var(--border-color)] text-[var(--accent-color)]">
                                            Fibo Levels: 0.382, 0.618, 1.0
                                        </div>
                                    {/if}
                                </div>
                            </Tooltip>
                        </div>
                    </div>

                    <div class="text-xs grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 mt-1">
                        {#each Object.entries(data.pivots.classic).reverse() as [key, val]}
                            <span class="text-[var(--text-secondary)] w-6 uppercase">{key}</span>
                            <span class="text-right text-[var(--text-primary)] font-mono">{formatVal(val)}</span>
                        {/each}
                    </div>
                </div>

            {/if}
        </div>
    </div>
{/if}

<style>
    /* Ensure it doesn't get too wide on mobile */
    .technicals-panel {
        max-width: 100%;
    }
</style>
