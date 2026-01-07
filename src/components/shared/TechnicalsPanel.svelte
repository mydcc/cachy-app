<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { tradeStore, updateTradeStore } from "../../stores/tradeStore";
    import { settingsStore } from "../../stores/settingsStore";
    import { apiService } from "../../services/apiService";
    import { technicalsService, type TechnicalsData } from "../../services/technicalsService";
    import { _ } from "../../locales/i18n";
    import { formatDynamicDecimal, normalizeTimeframeInput } from "../../utils/utils";
    import { Decimal } from "decimal.js";
    import Tooltip from "../shared/Tooltip.svelte";

    export let isVisible: boolean = false;

    let data: TechnicalsData | null = null;
    let loading = false;
    let error: string | null = null;
    let refreshInterval: any;
    let showTimeframePopup = false;
    let customTimeframeInput = "";

    // Use analysisTimeframe for Technicals, NOT atrTimeframe
    $: symbol = $tradeStore.symbol;
    $: timeframe = $tradeStore.analysisTimeframe || '1h';
    $: showPanel = $settingsStore.showTechnicals && isVisible;

    // Trigger fetch when relevant props change
    $: if (showPanel && symbol && timeframe) {
        fetchData();
    } else if (!showPanel) {
        // Clear data if hidden to save memory? Optional.
    }

    // Auto-refresh every 1m if visible
    $: if (showPanel) {
        startRefreshTimer();
    } else {
        stopRefreshTimer();
    }

    function startRefreshTimer() {
        stopRefreshTimer();
        refreshInterval = setInterval(() => {
            fetchData(true);
        }, 60000);
    }

    function stopRefreshTimer() {
        if (refreshInterval) clearInterval(refreshInterval);
    }

    async function fetchData(silent = false) {
        if (!symbol) return;
        if (!silent) loading = true;
        error = null;

        try {
            // Mapping ATR timeframe to API interval
            // API expects: 1m, 5m, 15m, 30m, 1h, 4h, 1d, 1w, 1M
            // TradeStore might have different keys? Usually they match.
            // Ensure we fetch enough data (e.g., 205 candles for EMA200 + calculation buffer)
            const klines = await apiService.fetchBitunixKlines(symbol, timeframe, 250);

            data = technicalsService.calculateTechnicals(klines);
        } catch (e) {
            console.error("Technicals fetch error:", e);
            error = "Failed to load";
        } finally {
            loading = false;
        }
    }

    onDestroy(() => {
        stopRefreshTimer();
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
</script>

<svelte:window on:click={handleClickOutside} />

{#if showPanel}
    <div class="technicals-panel p-3 flex flex-col gap-2 w-full md:w-64 transition-all relative">

        <!-- Header -->
        <div class="flex justify-between items-center pb-2 timeframe-selector-container relative">
            <h3
                class="font-bold text-[var(--text-primary)] cursor-pointer hover:text-[var(--accent-color)] flex items-center gap-2"
                on:click={toggleTimeframePopup}
            >
                Technicals
                <span class="text-xs bg-[var(--bg-tertiary)] px-1.5 py-0.5 rounded text-[var(--text-secondary)] ml-1 hover:bg-[var(--accent-color)] hover:text-white transition-colors">
                    {timeframe}
                </span>
            </h3>

            {#if showTimeframePopup}
                <div class="absolute top-full left-0 mt-1 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded shadow-xl z-50 p-2 w-48 flex flex-col gap-2">
                    <!-- Row 1 -->
                    <div class="grid grid-cols-3 gap-1">
                        <button class="btn-xs border border-[var(--border-color)] hover:bg-[var(--accent-color)] hover:text-white rounded" on:click={() => setTimeframe('1m')}>1m</button>
                        <button class="btn-xs border border-[var(--border-color)] hover:bg-[var(--accent-color)] hover:text-white rounded" on:click={() => setTimeframe('5m')}>5m</button>
                        <button class="btn-xs border border-[var(--border-color)] hover:bg-[var(--accent-color)] hover:text-white rounded" on:click={() => setTimeframe('15m')}>15m</button>
                    </div>
                    <!-- Row 2 -->
                    <div class="grid grid-cols-3 gap-1">
                        <button class="btn-xs border border-[var(--border-color)] hover:bg-[var(--accent-color)] hover:text-white rounded" on:click={() => setTimeframe('1h')}>1h</button>
                        <button class="btn-xs border border-[var(--border-color)] hover:bg-[var(--accent-color)] hover:text-white rounded" on:click={() => setTimeframe('4h')}>4h</button>
                        <button class="btn-xs border border-[var(--border-color)] hover:bg-[var(--accent-color)] hover:text-white rounded" on:click={() => setTimeframe('1d')}>1d</button>
                    </div>
                    <!-- Row 3 Custom -->
                    <div class="flex gap-1">
                        <input
                            type="text"
                            class="w-full text-xs p-1 rounded border border-[var(--border-color)] bg-[var(--bg-primary)]"
                            placeholder="e.g. 24m"
                            bind:value={customTimeframeInput}
                            on:keydown={(e) => e.key === 'Enter' && handleCustomTimeframeSubmit()}
                        />
                        <button class="px-2 bg-[var(--bg-tertiary)] hover:bg-[var(--accent-color)] hover:text-white rounded text-xs" on:click={handleCustomTimeframeSubmit}>OK</button>
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
                <h4 class="text-xs font-bold text-[var(--text-secondary)] uppercase">Pivots (Classic)</h4>
                <div class="text-xs grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                    {#each Object.entries(data.pivots.classic).reverse() as [key, val]}
                        <span class="text-[var(--text-secondary)] w-6 uppercase">{key}</span>
                        <span class="text-right text-[var(--text-primary)] font-mono">{formatVal(val)}</span>
                    {/each}
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
