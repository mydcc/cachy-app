<script lang="ts">
    import { onDestroy } from "svelte";
    import { tradeStore, updateTradeStore } from "../../stores/tradeStore";
    import { settingsStore } from "../../stores/settingsStore";
    import { indicatorStore } from "../../stores/indicatorStore";
    import { marketStore } from "../../stores/marketStore";
    import { bitunixWs } from "../../services/bitunixWs";
    import { apiService } from "../../services/apiService";
    import { technicalsService, type TechnicalsData } from "../../services/technicalsService";
    import { formatDynamicDecimal, normalizeTimeframeInput } from "../../utils/utils";
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
    let pivotHeight = 0;

    // Use analysisTimeframe for Technicals
    $: symbol = $tradeStore.symbol;
    $: timeframe = $tradeStore.analysisTimeframe || '1h';
    $: showPanel = $settingsStore.showTechnicals && isVisible;
    $: indicatorSettings = $indicatorStore;
    $: viewMode = $indicatorStore.pivots.viewMode || 'integrated';

    // React to Market Store updates for real-time processing
    $: wsData = symbol ? ($marketStore[symbol] || $marketStore[symbol.replace('P', '')] || $marketStore[symbol + 'USDT']) : null;

    // Typed Keys for Abstract View
    const abstractKeys = ['s2', 's1', 'p', 'r1', 'r2'] as const;

    // Local state for live candle
    let liveCandle: any = null;
    let pivotBasisCandle: any = null;

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
        // But we want to ensure we don't double-add live candles or shift basis incorrectly.
        updateTechnicals();
    }

    // Handle Real-Time Updates
    $: if (showPanel && wsData?.kline && klinesHistory.length > 0) {
        handleRealTimeUpdate(wsData.kline);
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

    // Core Logic for Updating Data and Pivots
    function handleRealTimeUpdate(newKline: any) {
        if (!klinesHistory || klinesHistory.length === 0) return;

        const lastIdx = klinesHistory.length - 1;
        const lastHistoryCandle = klinesHistory[lastIdx];

        const lastTime = lastHistoryCandle.time || lastHistoryCandle.ts || 0;
        const newTime = newKline.time || 0;

        // Determine if newKline is the SAME candle as the last one in history, or a NEW one
        if (newTime > lastTime && lastTime > 0) {
            // New candle started!
            // The previous 'live' candle is now completed history.
            // We should push it to history (or the confirmed version of it).
            // NOTE: In a robust system, we'd wait for a 'closed' flag. Here we just rely on time.
            const newCandleObj = {
                open: newKline.open,
                high: newKline.high,
                low: newKline.low,
                close: newKline.close,
                volume: newKline.volume,
                time: newTime
            };
            klinesHistory = [...klinesHistory, newCandleObj];
            if (klinesHistory.length > (indicatorSettings?.historyLimit || 1000) + 50) {
                klinesHistory.shift();
            }
        } else if (newTime === lastTime) {
            // It's an update to the last candle.
            // But wait! If we modify klinesHistory[last] directly with live data,
            // then 'technicalsService' will use klinesHistory[last-1] as the pivot basis.
            // This is actually CORRECT for the *current* live candle.
            // The pivots for the current live candle (T) are based on T-1.
            // So if klinesHistory contains [..., T-1, T(live)],
            // And technicalsService uses length-2 (T-1) for calculation,
            // Then Pivots will be based on T-1. Correct.
            //
            // HOWEVER: We must ensure T-1 is STABLE.
            // If T is live, T-1 must be completed.
            //
            // Problem: If we just fetched history via REST, the last candle might be the *incomplete* live candle.
            // If API returns [..., T(incomplete)], and we treat it as T, it works.
            // But if we then receive WS updates for T, we update it.
            // T-1 remains the same.
            //
            // So, updating klinesHistory in place is fine IF the basis (T-1) doesn't change.
            const updatedCandle = {
                ...lastHistoryCandle,
                open: newKline.open,
                high: newKline.high,
                low: newKline.low,
                close: newKline.close,
                volume: newKline.volume,
                time: newTime
            };
            const newHistory = [...klinesHistory];
            newHistory[lastIdx] = updatedCandle;
            klinesHistory = newHistory;
        }

        updateTechnicals();
    }

    function updateTechnicals() {
        if (!klinesHistory.length) return;

        // Calculate technicals using the FULL history including live candle.
        // technicalsService uses length-2 as pivot basis.
        // So pivots will be derived from the candle BEFORE the last one.
        // If last one is Live (T), pivots are from T-1. Correct.
        data = technicalsService.calculateTechnicals(klinesHistory, indicatorSettings);

        // Identify Pivot Basis and Live Candle for Visualization
        liveCandle = klinesHistory[klinesHistory.length - 1];
        pivotBasisCandle = klinesHistory[klinesHistory.length - 2];
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
            liveCandle,
            pivotBasisCandle,
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

                <!-- MODE A: INTEGRATED (Default) -->
                {#if viewMode === 'integrated' && pivotBasisCandle && liveCandle}
                    {@const pivots = data.pivots.classic}
                    {@const r3 = pivots.r3 || 0}
                    {@const s3 = pivots.s3 || 0}
                    {@const maxH = Math.max(Number(pivotBasisCandle.high), Number(liveCandle.high), r3)}
                    {@const minL = Math.min(Number(pivotBasisCandle.low), Number(liveCandle.low), s3)}
                    {@const range = maxH - minL || 1}
                    {@const height = 180}

                    <!-- Pre-calculate Candle 1 (Previous) values -->
                    {@const pO = Number(pivotBasisCandle.open)}
                    {@const pC = Number(pivotBasisCandle.close)}
                    {@const pH = Number(pivotBasisCandle.high)}
                    {@const pL = Number(pivotBasisCandle.low)}
                    {@const pColor = pC >= pO ? 'var(--text-tertiary)' : 'var(--text-secondary)'}
                    {@const pTop = height - ((pH - minL) / range * height)}
                    {@const pBottom = height - ((pL - minL) / range * height)}
                    {@const pBodyTop = height - ((Math.max(pO, pC) - minL) / range * height)}
                    {@const pBodyHeight = Math.abs(pO - pC) / range * height}

                    <!-- Pre-calculate Candle 2 (Live) values -->
                    {@const lO = Number(liveCandle.open)}
                    {@const lC = Number(liveCandle.close)}
                    {@const lH = Number(liveCandle.high)}
                    {@const lL = Number(liveCandle.low)}
                    {@const lColor = lC >= lO ? 'var(--success-color)' : 'var(--danger-color)'}
                    {@const lTop = height - ((lH - minL) / range * height)}
                    {@const lBottom = height - ((lL - minL) / range * height)}
                    {@const lBodyTop = height - ((Math.max(lO, lC) - minL) / range * height)}
                    {@const lBodyHeight = Math.abs(lO - lC) / range * height}

                    <div class="relative w-full bg-[var(--bg-tertiary)]/20 rounded border border-[var(--border-color)]" style="height: {height}px;">
                        <!-- Pivot Lines -->
                        {#each Object.entries(pivots) as [key, val]}
                            {@const y = height - ((val - minL) / range * height)}
                            {#if y >= 0 && y <= height}
                                <div class="absolute w-full border-t border-[var(--text-tertiary)] opacity-30 text-[9px] text-[var(--text-secondary)] flex items-center" style="top: {y}px;">
                                    <span class="ml-1 -mt-3 uppercase opacity-70">{key}</span>
                                    <span class="ml-auto mr-1 -mt-3 opacity-50">{formatVal(val)}</span>
                                </div>
                            {/if}
                        {/each}

                        <!-- Candle 1 Visual -->
                        <div class="absolute left-[30%] -translate-x-1/2 w-3" style="top: {pTop}px; height: {pBottom - pTop}px;">
                            <div class="absolute top-0 bottom-0 left-1/2 w-[1px] bg-current opacity-40" style="color: {pColor};"></div>
                            <div class="absolute left-0 right-0 opacity-40 rounded-[1px]" style="background-color: {pColor}; top: {pBodyTop - pTop}px; height: {Math.max(1, pBodyHeight)}px;"></div>
                        </div>

                        <!-- Candle 2 Visual -->
                        <div class="absolute left-[70%] -translate-x-1/2 w-3" style="top: {lTop}px; height: {lBottom - lTop}px;">
                            <div class="absolute top-0 bottom-0 left-1/2 w-[1px] bg-current" style="color: {lColor};"></div>
                            <div class="absolute left-0 right-0 rounded-[1px]" style="background-color: {lColor}; top: {lBodyTop - lTop}px; height: {Math.max(1, lBodyHeight)}px;"></div>
                            <!-- Live Indicator Dot -->
                            <div class="absolute -right-3 top-[50%] w-1.5 h-1.5 rounded-full bg-[var(--accent-color)] animate-ping"></div>
                        </div>

                        <!-- Legend -->
                        <div class="absolute bottom-1 left-2 text-[9px] text-[var(--text-secondary)] opacity-50">PREV</div>
                        <div class="absolute bottom-1 right-2 text-[9px] text-[var(--text-secondary)] font-bold">LIVE</div>
                    </div>

                <!-- MODE B: SEPARATED -->
                {:else if viewMode === 'separated'}
                    <div class="flex gap-4">
                        <!-- Left: List -->
                        <div class="flex-1 text-xs grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                            {#each Object.entries(data.pivots.classic).sort((a, b) => b[1] - a[1]) as [key, val]}
                                <span class="text-[var(--text-secondary)] w-6 uppercase">{key}</span>
                                <span class="text-right text-[var(--text-primary)] font-mono">{formatVal(val)}</span>
                            {/each}
                        </div>
                        <!-- Right: Simple Micro Chart -->
                        {#if pivotBasisCandle && liveCandle}
                             <!-- Reuse calc logic slightly simplified -->
                             {@const maxH = Math.max(Number(pivotBasisCandle.high), Number(liveCandle.high))}
                             {@const minL = Math.min(Number(pivotBasisCandle.low), Number(liveCandle.low))}
                             {@const range = maxH - minL || 1}

                             <!-- Prev -->
                             {@const pC = Number(pivotBasisCandle.close)}
                             {@const pO = Number(pivotBasisCandle.open)}
                             {@const pH = Number(pivotBasisCandle.high)}
                             {@const pL = Number(pivotBasisCandle.low)}
                             {@const pH_px = (pH - minL) / range * 100}
                             {@const pL_px = (pL - minL) / range * 100}
                             {@const pO_px = (pO - minL) / range * 100}
                             {@const pC_px = (pC - minL) / range * 100}

                             <!-- Live -->
                             {@const lC = Number(liveCandle.close)}
                             {@const lO = Number(liveCandle.open)}
                             {@const lH = Number(liveCandle.high)}
                             {@const lL = Number(liveCandle.low)}
                             {@const lH_px = (lH - minL) / range * 100}
                             {@const lL_px = (lL - minL) / range * 100}
                             {@const lO_px = (lO - minL) / range * 100}
                             {@const lC_px = (lC - minL) / range * 100}
                             {@const lColor = lC >= lO ? 'var(--success-color)' : 'var(--danger-color)'}

                             <div class="w-16 h-32 relative border-l border-b border-[var(--border-color)]">
                                <div class="absolute left-2 w-3 bg-[var(--text-secondary)] opacity-50"
                                     style="bottom: {Math.min(pO_px, pC_px)}%; height: {Math.max(1, Math.abs(pC_px - pO_px))}%;"></div>
                                <div class="absolute left-[1.1rem] w-[1px] bg-[var(--text-secondary)] opacity-50"
                                     style="bottom: {pL_px}%; height: {pH_px - pL_px}%;"></div>

                                <div class="absolute right-2 w-3"
                                     style="background-color: {lColor}; bottom: {Math.min(lO_px, lC_px)}%; height: {Math.max(1, Math.abs(lC_px - lO_px))}%;"></div>
                                <div class="absolute right-[0.9rem] w-[1px]"
                                     style="background-color: {lColor}; bottom: {lL_px}%; height: {lH_px - lL_px}%;"></div>
                             </div>
                        {/if}
                    </div>

                <!-- MODE C: ABSTRACT (Gauge) -->
                {:else if viewMode === 'abstract'}
                    {@const pivots = data.pivots.classic}
                    {@const livePrice = Number(liveCandle?.close || 0)}
                    {@const rangeMin = pivots.s3 || 0}
                    {@const rangeMax = pivots.r3 || 100}
                    {@const fullRange = rangeMax - rangeMin || 1}
                    {@const pct = Math.max(0, Math.min(100, (livePrice - rangeMin) / fullRange * 100))}

                    <div class="flex flex-col gap-4 py-2">
                        <!-- Gauge Bar -->
                        <div class="h-6 w-full bg-[var(--bg-secondary)] rounded relative border border-[var(--border-color)]">
                             <!-- Markers -->
                             {#each abstractKeys as key}
                                {@const val = pivots[key]}
                                {@const pos = (val - rangeMin) / fullRange * 100}
                                <div class="absolute h-full w-[1px] bg-[var(--text-tertiary)]" style="left: {pos}%">
                                    <span class="absolute -top-4 -translate-x-1/2 text-[9px] uppercase text-[var(--text-secondary)]">{key}</span>
                                </div>
                             {/each}

                             <!-- Live Position -->
                             <div class="absolute top-0 bottom-0 w-1 bg-[var(--accent-color)] shadow-[0_0_8px_var(--accent-color)] transition-all duration-300" style="left: {pct}%"></div>
                        </div>
                        <div class="flex justify-between text-xs text-[var(--text-secondary)] font-mono">
                            <span>S3: {formatVal(pivots.s3)}</span>
                            <span class="text-[var(--text-primary)] font-bold">{formatVal(livePrice)}</span>
                            <span>R3: {formatVal(pivots.r3)}</span>
                        </div>
                    </div>

                <!-- Fallback / Default Text Only (shouldn't happen with view modes) -->
                {:else}
                    <div class="text-xs grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                        {#each Object.entries(data.pivots.classic).sort((a, b) => b[1] - a[1]) as [key, val]}
                            <span class="text-[var(--text-secondary)] w-6 uppercase">{key}</span>
                            <span class="text-right text-[var(--text-primary)] font-mono">{formatVal(val)}</span>
                        {/each}
                    </div>
                {/if}
            </div>
        {/if}
    </div>
{/if}

<style>
    .technicals-panel {
        max-width: 100%;
    }
</style>
