<script lang="ts">
    import { onDestroy } from "svelte";
    import { tradeStore, updateTradeStore } from "../../stores/tradeStore";
    import { settingsStore } from "../../stores/settingsStore";
    import { indicatorStore } from "../../stores/indicatorStore";
    import { marketStore } from "../../stores/marketStore";
    import { bitunixWs } from "../../services/bitunixWs";
    import { apiService } from "../../services/apiService";
    import { technicalsService } from "../../services/technicalsService";
    import type { TechnicalsData } from "../../services/technicalsTypes"; // Import strict types
    import { normalizeTimeframeInput, parseTimestamp } from "../../utils/utils";
    import { Decimal } from "decimal.js";
    import Tooltip from "../shared/Tooltip.svelte";

    export let isVisible: boolean = false;

    let klinesHistory: any[] = [];
    let data: TechnicalsData | null = null;
    let loading = false;
    let error: string | null = null;
    let showTimeframePopup = false;
    let customTimeframeInput = "";
    let currentSubscription: string | null = null;

    // Use analysisTimeframe for Technicals
    $: symbol = $tradeStore.symbol;
    $: timeframe = $tradeStore.analysisTimeframe || '1h';
    $: showPanel = $settingsStore.showTechnicals && isVisible;
    $: indicatorSettings = $indicatorStore;

    // React to Market Store updates for real-time processing
    $: wsData = symbol ? ($marketStore[symbol] || $marketStore[symbol.replace('P', '')] || $marketStore[symbol + 'USDT']) : null;

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
        // When settings change, we just recalculate based on existing history + live
        updateTechnicals();
    }

    // Handle Real-Time Updates
    $: if (showPanel && wsData?.kline && klinesHistory.length > 0) {
        handleRealTimeUpdate(wsData.kline);
    }

    const bitunixIntervalMap: Record<string, string> = {
        '1m': '1min',
        '5m': '5min',
        '15m': '15min',
        '30m': '30min',
        '1h': '60min',
        '4h': '4h',
        '1d': '1day',
        '1w': '1week',
        '1M': '1month'
    };

    function getBitunixChannel(tf: string): string {
        const mapped = bitunixIntervalMap[tf] || tf;
        return `market_kline_${mapped}`;
    }

    function subscribeWs() {
        if (symbol && timeframe && $settingsStore.apiProvider === 'bitunix') {
            const channel = getBitunixChannel(timeframe);
            bitunixWs.subscribe(symbol, channel);
        }
    }

    function unsubscribeWs() {
        if (currentSubscription) {
            const [oldSymbol, oldTimeframe] = currentSubscription.split(':');
            if (oldSymbol && oldTimeframe && $settingsStore.apiProvider === 'bitunix') {
                 const channel = getBitunixChannel(oldTimeframe);
                 bitunixWs.unsubscribe(oldSymbol, channel);
            }
        }
    }

    // Core Logic for Updating Data and Pivots
    function handleRealTimeUpdate(newKline: any) {
        if (!klinesHistory || klinesHistory.length === 0) return;
        if (!newKline) return;

        // Strict Validation: Ensure incoming data is valid
        // Use parseTimestamp to ensure seconds/ms consistency with REST history
        const time = parseTimestamp(newKline.time);
        const close = newKline.close ? new Decimal(newKline.close) : new Decimal(0);

        if (time <= 0 || close.lte(0)) {
            // Invalid data packet, ignore
            return;
        }

        const lastIdx = klinesHistory.length - 1;
        const lastHistoryCandle = klinesHistory[lastIdx];
        const lastTime = lastHistoryCandle.time || lastHistoryCandle.ts || 0; // Already parsed by apiService

        // Ensure we handle Decimal objects or strings/numbers correctly for history
        const newCandleObj = {
            open: newKline.open ? new Decimal(newKline.open) : new Decimal(0),
            high: newKline.high ? new Decimal(newKline.high) : new Decimal(0),
            low: newKline.low ? new Decimal(newKline.low) : new Decimal(0),
            close: close,
            volume: newKline.volume ? new Decimal(newKline.volume) : new Decimal(0),
            time: time
        };

        // Determine if newKline is the SAME candle as the last one in history, or a NEW one
        // Using strict time comparison after normalization
        if (time > lastTime && lastTime > 0) {
            // New candle started!
            klinesHistory = [...klinesHistory, newCandleObj];
            if (klinesHistory.length > (indicatorSettings?.historyLimit || 1000) + 50) {
                klinesHistory.shift();
            }
        } else if (time === lastTime) {
            // It's an update to the last candle.
            const newHistory = [...klinesHistory];
            newHistory[lastIdx] = newCandleObj;
            klinesHistory = newHistory;
        }
        // If time < lastTime, it's an old update (out of order), ignore it to protect history.

        updateTechnicals();
    }

    function updateTechnicals() {
        if (!klinesHistory.length) return;
        // Calculate technicals using the FULL history including live candle.
        // The Service now handles Data normalization and Decimal conversion internally.
        data = technicalsService.calculateTechnicals(klinesHistory, indicatorSettings);
    }

    async function fetchData(silent = false) {
        if (!symbol) return;
        if (!silent) loading = true;
        error = null;

        try {
            const limit = indicatorSettings?.historyLimit || 750;
            const klines = await apiService.fetchBitunixKlines(symbol, timeframe, limit);
            klinesHistory = klines;
            updateTechnicals();
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

    function formatVal(val: Decimal) {
        // val is now strictly a Decimal object
        return val.toDecimalPlaces(4).toString();
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
            indicators: data
        };
        navigator.clipboard.writeText(JSON.stringify(debugInfo, null, 2))
            .then(() => alert('Debug data copied!'))
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

                 <div class="relative group">
                    <button class="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors p-1" on:click={copyDebugData}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="16" x2="12" y2="12"></line>
                            <line x1="12" y1="8" x2="12.01" y2="8"></line>
                        </svg>
                    </button>
                </div>
            </div>

            {#if showTimeframePopup}
                <div class="absolute top-full left-0 mt-1 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded shadow-xl z-50 p-2 w-48 flex flex-col gap-2">
                    <div class="grid grid-cols-3 gap-2">
                        <button class="py-2 border border-[var(--border-color)] hover:bg-[var(--accent-color)] hover:text-white rounded text-sm font-medium" on:click={() => setTimeframe('1m')}>1m</button>
                        <button class="py-2 border border-[var(--border-color)] hover:bg-[var(--accent-color)] hover:text-white rounded text-sm font-medium" on:click={() => setTimeframe('5m')}>5m</button>
                        <button class="py-2 border border-[var(--border-color)] hover:bg-[var(--accent-color)] hover:text-white rounded text-sm font-medium" on:click={() => setTimeframe('15m')}>15m</button>
                    </div>
                    <div class="grid grid-cols-3 gap-2">
                        <button class="py-2 border border-[var(--border-color)] hover:bg-[var(--accent-color)] hover:text-white rounded text-sm font-medium" on:click={() => setTimeframe('1h')}>1h</button>
                        <button class="py-2 border border-[var(--border-color)] hover:bg-[var(--accent-color)] hover:text-white rounded text-sm font-medium" on:click={() => setTimeframe('4h')}>4h</button>
                        <button class="py-2 border border-[var(--border-color)] hover:bg-[var(--accent-color)] hover:text-white rounded text-sm font-medium" on:click={() => setTimeframe('1d')}>1d</button>
                    </div>
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
            <!-- Oscillators & MAs (Standard) -->
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

            <!-- Pivots Section -->
            <div class="flex flex-col gap-2 pt-2 border-t border-[var(--border-color)]">
                <h4 class="text-xs font-bold text-[var(--text-secondary)] uppercase">
                    {indicatorSettings?.pivots?.type ? `Pivots (${indicatorSettings.pivots.type})` : 'Pivots'}
                </h4>
                <div class="text-xs grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                    {#each Object.entries(data.pivots.classic).sort((a, b) => b[1].minus(a[1]).toNumber()) as [key, val]}
                        <span class="text-[var(--text-secondary)] w-6 uppercase">{key}</span>
                        <span class="text-right text-[var(--text-primary)] font-mono">{formatVal(val)}</span>
                    {/each}
                </div>
            </div>
        {/if}
    </div>
{/if}

<style>
    .technicals-panel {
        max-width: 100%;
    }
</style>
