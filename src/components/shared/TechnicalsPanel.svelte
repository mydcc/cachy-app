<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { tradeStore } from "../../stores/tradeStore";
    import { settingsStore } from "../../stores/settingsStore";
    import { marketStore } from "../../stores/marketStore";
    import { bitunixWs } from "../../services/bitunixWs";
    import { apiService } from "../../services/apiService";
    import { technicalsService, type TechnicalsData } from "../../services/technicalsService";
    import { _ } from "../../locales/i18n";
    import { formatDynamicDecimal } from "../../utils/utils";
    import { Decimal } from "decimal.js";
    import Tooltip from "../shared/Tooltip.svelte";

    export let isVisible: boolean = false;

    let data: TechnicalsData | null = null;
    let loading = false;
    let error: string | null = null;

    // Store local history for real-time updates
    let klinesHistory: any[] = [];
    let currentSubscription: string | null = null;

    $: symbol = $tradeStore.symbol;
    $: timeframe = $tradeStore.atrTimeframe || '1d';
    $: showPanel = $settingsStore.showTechnicals && isVisible;

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

        // Re-calculate technicals
        data = technicalsService.calculateTechnicals(klinesHistory);
    }

    async function fetchData(silent = false) {
        if (!symbol) return;
        if (!silent) loading = true;
        error = null;

        try {
            // Fetch history
            const klines = await apiService.fetchBitunixKlines(symbol, timeframe, 250);
            klinesHistory = klines;
            data = technicalsService.calculateTechnicals(klinesHistory);
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
</script>

{#if showPanel}
    <div class="technicals-panel p-3 flex flex-col gap-2 w-full md:w-64 transition-all">

        <!-- Header -->
        <div class="flex justify-between items-center pb-2">
            <h3 class="font-bold text-[var(--text-primary)]">Technicals <span class="text-xs bg-[var(--bg-tertiary)] px-1.5 py-0.5 rounded text-[var(--text-secondary)] ml-1">{timeframe}</span></h3>

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
