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

    let pivotHeight = 0; // Declare early to avoid scope issues
    let klinesHistory: any[] = [];
    let showDebug = false;
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

    // --- Candle Logic ---
    // prevCandle: The COMPLETED candle used for calculation basis (usually history[last] or history[last-1] depending on state)
    // currCandle: The LIVE candle (`visualCandle` from WS)

    // Helper to get the last candle from history
    $: lastHistoryCandle = klinesHistory.length > 0 ? klinesHistory[klinesHistory.length - 1] : null;

    // Determine Current Candle (Live)
    // Use WebSocket data if available, otherwise fall back to the last known history candle
    $: currCandle = wsData?.kline
        ? { ...wsData.kline, time: wsData.kline.time || Date.now() }
        : lastHistoryCandle;

    // Determine Previous Candle (Context)
    // Logic: If Current Candle matches the Last History Candle (by time), then "Previous" is the one BEFORE Last History.
    //        If Current Candle is NEWER than Last History, then "Previous" IS the Last History Candle.
    $: prevCandle = (currCandle && lastHistoryCandle && currCandle.time === (lastHistoryCandle.time || lastHistoryCandle.ts))
        ? (klinesHistory.length > 1 ? klinesHistory[klinesHistory.length - 2] : null)
        : lastHistoryCandle;

    $: prevColor = prevCandle && Number(prevCandle.close) >= Number(prevCandle.open) ? 'var(--text-secondary)' : 'var(--danger-color)'; // Grey/Red for history context
    $: currColor = currCandle && Number(currCandle.close) >= Number(currCandle.open) ? 'var(--success-color)' : 'var(--danger-color)';

    // Derived display label for Pivots
    $: pivotLabel = indicatorSettings?.pivots?.type
        ? `Pivots (${indicatorSettings.pivots.type.charAt(0).toUpperCase() + indicatorSettings.pivots.type.slice(1)})`
        : 'Pivots (Classic)';

    // React to Market Store updates for real-time processing
    $: wsData = symbol ? ($marketStore[symbol] || $marketStore[symbol.replace('P', '')] || $marketStore[symbol + 'USDT']) : null;

    // Add a local timestamp to verify updates
    let lastUpdateTs = 0;

    $: if (showPanel && wsData?.kline && klinesHistory.length > 0) {
        handleRealTimeUpdate(wsData.kline);
        lastUpdateTs = Date.now();
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

        const lastIdx = klinesHistory.length - 1;
        const lastCandle = klinesHistory[lastIdx];

        // Ensure we have timestamps to compare
        // Note: fetchBitunixKlines should provide 'time' or 'ts'. marketStore provides 'time'.
        // If timestamps are missing, we default to updating the last candle (fallback).
        const lastTime = lastCandle.time || lastCandle.ts || 0;
        const newTime = newKline.time || 0;

        let newHistory = [...klinesHistory];

        if (newTime > lastTime && lastTime > 0) {
            // New candle started! Push it.
            const newCandleObj = {
                open: newKline.open,
                high: newKline.high,
                low: newKline.low,
                close: newKline.close,
                volume: newKline.volume,
                time: newTime
            };
            newHistory.push(newCandleObj);

            // Optionally remove oldest candle to keep history size constant (performance)
            if (newHistory.length > (indicatorSettings?.historyLimit || 1000) + 50) {
                newHistory.shift();
            }
        } else {
            // Update existing candle (same time or no time info)
            // If newTime < lastTime, we ignore it (stale data), unless lastTime is 0.
            if (newTime > 0 && newTime < lastTime) {
                return; // Ignore stale data
            }

            const updatedCandle = {
                ...lastCandle,
                open: newKline.open,
                high: newKline.high,
                low: newKline.low,
                close: newKline.close,
                volume: newKline.volume,
                // Preserve original time if newKline doesn't have it, or update it
                time: newTime || lastTime
            };
            newHistory[lastIdx] = updatedCandle;
        }

        klinesHistory = newHistory;

        // Re-calculate technicals with settings
        data = technicalsService.calculateTechnicals(klinesHistory, indicatorSettings);
    }

    async function fetchData(silent = false) {
        if (!symbol) return;
        if (!silent) loading = true;
        error = null;

        try {
            // Fetch history based on settings
            const limit = indicatorSettings?.historyLimit || 750;
            const klines = await apiService.fetchBitunixKlines(symbol, timeframe, limit);
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
        return new Decimal(val).toDecimalPlaces(4).toString();
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

    function copyDebugData() {
        if (!klinesHistory.length) return;

        const debugInfo = {
            symbol,
            timeframe,
            totalCandles: klinesHistory.length,
            firstCandle: {
                // Approximate time if we don't have explicit timestamp in all objects
                idx: 0,
                close: klinesHistory[0].close.toString()
            },
            lastCandle: {
                idx: klinesHistory.length - 1,
                close: klinesHistory[klinesHistory.length - 1].close.toString()
            },
            indicators: data
        };

        navigator.clipboard.writeText(JSON.stringify(debugInfo, null, 2))
            .then(() => alert('Debug data copied to clipboard!'))
            .catch(err => console.error('Failed to copy', err));
    }
</script>

<svelte:window on:click={handleClickOutside} />

{#if showPanel}
    <div class="technicals-panel p-3 flex flex-col gap-2 w-full md:w-64 transition-all relative">

        <!-- Header -->
        <div class="flex justify-between items-center pb-2 timeframe-selector-container relative">
            <div class="flex items-center gap-2">
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

                <!-- Debug / Info Icon -->
                 <div class="relative group">
                    <button class="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors p-1" on:click={copyDebugData}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="16" x2="12" y2="12"></line>
                            <line x1="12" y1="8" x2="12.01" y2="8"></line>
                        </svg>
                    </button>
                    <!-- Simple tooltip on hover -->
                     <div class="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50 w-max bg-[var(--bg-tertiary)] text-[var(--text-secondary)] text-[10px] p-1.5 rounded border border-[var(--border-color)]">
                        Verify: n={klinesHistory.length} <br>
                        Click to copy debug JSON
                    </div>
                </div>
            </div>

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
                <div class="flex gap-3">
                    <!-- Left: Candles Visualization (Dual) -->
                    <div class="flex gap-1 bg-[var(--bg-tertiary)]/20 rounded p-1" bind:clientHeight={pivotHeight} style="min-width: 40px;">

                        {#if prevCandle && currCandle && pivotHeight > 0 && data?.pivots?.classic}
                            <!--
                                Scaling Logic:
                                The user wants the candles to be relative to the "Pivot Section".
                                The Pivot Section is defined by the range from S3 to R3 (or S1-R1 if that's all we have).
                                We must include the candles themselves in the range so they don't clip if they go beyond pivots.
                            -->
                            {@const r3 = data.pivots.classic.r3 || -Infinity}
                            {@const s3 = data.pivots.classic.s3 || Infinity}

                            {@const maxH = Math.max(Number(prevCandle.high), Number(currCandle.high), r3)}
                            {@const minL = Math.min(Number(prevCandle.low), Number(currCandle.low), s3)}
                            {@const totalRange = (maxH - minL) || 1}

                            <!-- Pre-calc Previous Candle Metrics -->
                            {@const pBodyH = Math.abs(Number(prevCandle.close) - Number(prevCandle.open))}
                            {@const pTopOffset = (maxH - Number(prevCandle.high)) / totalRange * pivotHeight}
                            {@const pHeight = (Number(prevCandle.high) - Number(prevCandle.low)) / totalRange * pivotHeight}
                            {@const pBodyTopRelative = (Number(prevCandle.high) - Math.max(Number(prevCandle.open), Number(prevCandle.close))) / totalRange * pivotHeight}

                            <!-- Pre-calc Current Candle Metrics -->
                            {@const cBodyH = Math.abs(Number(currCandle.close) - Number(currCandle.open))}
                            {@const cTopOffset = (maxH - Number(currCandle.high)) / totalRange * pivotHeight}
                            {@const cHeight = (Number(currCandle.high) - Number(currCandle.low)) / totalRange * pivotHeight}
                            {@const cBodyTopRelative = (Number(currCandle.high) - Math.max(Number(currCandle.open), Number(currCandle.close))) / totalRange * pivotHeight}

                            <!-- Previous Candle (Left, Context) -->
                            <div class="w-4 relative h-full flex justify-center" title="Previous Candle (Basis)">
                                <div class="absolute w-full" style="top: {pTopOffset}px; height: {pHeight}px;">
                                     <!-- Wick -->
                                     <div class="absolute w-[1px] bg-current left-1/2 -translate-x-1/2 opacity-40" style="color: {prevColor}; height: 100%;"></div>
                                     <!-- Body -->
                                     <div class="absolute w-2 left-1/2 -translate-x-1/2 rounded-[1px] opacity-60" style="background-color: {prevColor};
                                          height: {Math.max(2, (pBodyH / totalRange) * pivotHeight)}px;
                                          top: {pBodyTopRelative}px;">
                                     </div>
                                </div>
                            </div>

                            <!-- Current Candle (Right, Live) -->
                            <div class="w-4 relative h-full flex justify-center" title="Current Live Candle">
                                <div class="absolute w-full" style="top: {cTopOffset}px; height: {cHeight}px;">
                                     <!-- Wick -->
                                     <div class="absolute w-[1px] bg-current left-1/2 -translate-x-1/2" style="color: {currColor}; height: 100%;"></div>
                                     <!-- Body -->
                                     <div class="absolute w-2 left-1/2 -translate-x-1/2 rounded-[1px]" style="background-color: {currColor};
                                          height: {Math.max(2, (cBodyH / totalRange) * pivotHeight)}px;
                                          top: {cBodyTopRelative}px;">
                                     </div>
                                </div>
                            </div>
                        {/if}
                    </div>

                    <!-- Right: Title + List -->
                    <div class="flex flex-col flex-1">
                        <div class="flex items-center gap-1 group relative w-fit mb-1">
                            <h4 class="text-xs font-bold text-[var(--text-secondary)] uppercase cursor-help border-b border-dotted border-[var(--text-secondary)]">{pivotLabel}</h4>

                    <!-- Pulse indicator for live updates -->
                    {#key lastUpdateTs}
                        <div class="w-1.5 h-1.5 rounded-full bg-[var(--accent-color)] animate-ping ml-1" title="Live Update"></div>
                    {/key}

                            <!-- Tooltip -->
                            <div class="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50 w-max">
                                <Tooltip>
                                    <div class="flex flex-col gap-1 text-xs whitespace-nowrap bg-[var(--bg-tertiary)] text-[var(--text-primary)] p-2 rounded shadow-xl border border-[var(--border-color)]">
                                        <div class="font-bold border-b border-[var(--border-color)] pb-1 mb-1">Calculation Basis (Previous Candle)</div>
                                        <div class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                                            <span class="text-[var(--text-secondary)]">High:</span>
                                            <span class="font-mono text-right">{formatVal(data.pivotBasis?.high || 0)}</span>

                                            <span class="text-[var(--text-secondary)]">Low:</span>
                                            <span class="font-mono text-right">{formatVal(data.pivotBasis?.low || 0)}</span>

                                            <span class="text-[var(--text-secondary)]">Close:</span>
                                            <span class="font-mono text-right">{formatVal(data.pivotBasis?.close || 0)}</span>

                                            {#if indicatorSettings?.pivots?.type === 'woodie'}
                                                <span class="text-[var(--text-secondary)]">Open:</span>
                                                <span class="font-mono text-right">{formatVal(data.pivotBasis?.open || 0)}</span>
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

                        <div class="text-xs grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                            {#each Object.entries(data.pivots.classic).sort((a, b) => b[1] - a[1]) as [key, val]}
                                <span class="text-[var(--text-secondary)] w-6 uppercase">{key}</span>
                                <span class="text-right text-[var(--text-primary)] font-mono">{formatVal(val)}</span>
                            {/each}
                        </div>
                    </div>
                </div>
            </div>

        {/if}
    </div>
{/if}

<style>
    /* Ensure it doesn't get too wide on mobile */
    .technicals-panel {
        max-width: 100%;
    }
</style>
