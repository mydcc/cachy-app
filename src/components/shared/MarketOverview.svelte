<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { tradeStore } from '../../stores/tradeStore';
    import { settingsStore } from '../../stores/settingsStore';
    import { apiService, type Ticker24h } from '../../services/apiService';
    import { icons } from '../../lib/constants';
    import { _ } from '../../locales/i18n';
    import { formatDynamicDecimal } from '../../utils/utils';
    import { Decimal } from 'decimal.js';

    let tickerData: Ticker24h | null = null;
    let isLoading = false;
    let error: string | null = null;
    let intervalId: any;
    let debounceTimer: any;

    $: symbol = $tradeStore.symbol;
    $: provider = $settingsStore.apiProvider;
    $: updateInterval = $settingsStore.marketDataInterval;

    // React to symbol, provider, or interval changes
    $: if (symbol && provider && updateInterval) {
        setupInterval();
        debouncedFetchData();
    }

    function setupInterval() {
        if (intervalId) clearInterval(intervalId);

        if (updateInterval === 'manual') return;

        const ms = updateInterval === '10s' ? 10000 : 60000;
        intervalId = setInterval(() => fetchData(true), ms); // Background fetch
    }

    function debouncedFetchData() {
        if (debounceTimer) clearTimeout(debounceTimer);
        // Short debounce to avoid spamming while typing
        debounceTimer = setTimeout(() => {
            fetchData();
        }, 600);
    }

    async function fetchData(isBackground = false) {
        // Basic validation before fetching
        if (!symbol || symbol.length < 3) return;

        if (!isBackground) {
            // Only show loading for manual/initial fetch, not background updates
            // But if we already have data, maybe don't flicker loading unless symbol changed?
            // Simple check: if symbol changed, we probably want loading.
            // For now, simple approach:
            if (!tickerData || tickerData.symbol !== symbol) isLoading = true;
        }

        error = null;
        try {
            // Ensure we handle the symbol normalization inside apiService, but if it's too short, it might fail.
            const data = await apiService.fetchTicker24h(symbol, provider);
            tickerData = data;
        } catch (e) {
            console.error("Failed to fetch market data", e);
            // Don't clear old data on background error, but do on explicit fetch error?
            // If invalid response, it might be a partial symbol.
            error = 'N/A';
            if (!isBackground) tickerData = null;
        } finally {
            isLoading = false;
        }
    }

    onMount(() => {
        if (symbol && provider) fetchData();
    });

    onDestroy(() => {
        if (intervalId) clearInterval(intervalId);
        if (debounceTimer) clearTimeout(debounceTimer);
    });

    function formatValue(val: Decimal | undefined, decimals: number = 2) {
        if (!val) return '-';
        return formatDynamicDecimal(val, decimals);
    }
</script>

<div class="market-overview-card bg-[var(--bg-secondary)] rounded-xl shadow-lg border border-[var(--border-primary)] p-4 flex flex-col gap-2 min-w-[200px] backdrop-blur-sm bg-opacity-95">
    <div class="flex justify-between items-start">
        <div>
            <div class="text-xs text-[var(--text-secondary)] uppercase font-bold tracking-wider">{provider}</div>
            <div class="text-lg font-bold text-[var(--text-primary)]">{tickerData?.symbol || symbol}</div>
        </div>
        <button
            class="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors p-1 rounded-md hover:bg-[var(--bg-tertiary)]"
            title="Refresh"
            on:click={() => fetchData()}
            class:animate-spin={isLoading}
        >
            {@html icons.refresh || '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 5.5A10 10 0 1 1 11.99 2.02"/></svg>'}
        </button>
    </div>

    {#if error}
        <div class="text-center text-[var(--danger-color)] text-sm py-2">
            {$_('apiErrors.symbolNotFound') || 'Symbol not found'}
        </div>
    {:else if tickerData}
        <div class="flex flex-col gap-1 mt-1">
            <div class="flex justify-between items-baseline">
                <span class="text-2xl font-bold text-[var(--text-primary)]">{formatValue(tickerData.lastPrice)}</span>
                <span class="text-sm font-medium" style:color={tickerData.priceChangePercent.gte(0) ? 'var(--success-color)' : 'var(--danger-color)'}>
                    {tickerData.priceChangePercent.gte(0) ? '+' : ''}{formatValue(tickerData.priceChangePercent)}%
                </span>
            </div>

            <div class="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-xs">
                <div class="flex flex-col">
                    <span class="text-[var(--text-secondary)]">24h High</span>
                    <span class="font-medium text-[var(--text-primary)]">{formatValue(tickerData.highPrice)}</span>
                </div>
                <div class="flex flex-col text-right">
                    <span class="text-[var(--text-secondary)]">24h Low</span>
                    <span class="font-medium text-[var(--text-primary)]">{formatValue(tickerData.lowPrice)}</span>
                </div>
                <div class="flex flex-col col-span-2 mt-1">
                    <span class="text-[var(--text-secondary)]">24h Vol ({tickerData.symbol.replace(/USDT.?$/, '')})</span>
                    <span class="font-medium text-[var(--text-primary)]">{formatValue(tickerData.volume, 0)}</span>
                </div>
            </div>
        </div>
    {:else}
        <div class="flex justify-center py-4">
            <div class="animate-pulse flex flex-col w-full gap-2">
                <div class="h-8 bg-[var(--bg-tertiary)] rounded w-3/4"></div>
                <div class="h-4 bg-[var(--bg-tertiary)] rounded w-1/2"></div>
                <div class="h-12 bg-[var(--bg-tertiary)] rounded w-full mt-2"></div>
            </div>
        </div>
    {/if}
</div>

<style>
    .market-overview-card {
        z-index: 40;
    }
</style>
