<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { tradeStore, updateTradeStore } from "../../stores/tradeStore";
    import { settingsStore } from "../../stores/settingsStore";
    import { favoritesStore } from "../../stores/favoritesStore";
    import { marketStore, wsStatusStore } from "../../stores/marketStore";
    import { bitunixWs } from "../../services/bitunixWs";
    import { apiService, type Ticker24h } from "../../services/apiService";
    import { icons } from "../../lib/constants";
    import { _ } from "../../locales/i18n";
    import { formatDynamicDecimal } from "../../utils/utils";
    import { Decimal } from "decimal.js";
    import DepthBar from "./DepthBar.svelte"; // Import the new DepthBar

    export let customSymbol: string | undefined = undefined;
    export let isFavoriteTile: boolean = false;

    // Use custom symbol if provided, otherwise fall back to store symbol
    $: symbol = (customSymbol || $tradeStore.symbol || '').toUpperCase();
    $: normalizedSymbolForWs = symbol.replace('.P', '').replace('P', ''); // Basic normalization for WS
    $: provider = $settingsStore.apiProvider;
    $: displaySymbol = getDisplaySymbol(symbol);

    // REST Data (24h Stats, Volume, Change)
    let tickerData: Ticker24h | null = null;
    let restLoading = false;
    let restError: string | null = null;
    let restIntervalId: any;

    // WS Data
    $: wsData = $marketStore[symbol] || $marketStore[symbol.replace('P', '')] || $marketStore[symbol + 'USDT']; // Try robust keys
    $: wsStatus = $wsStatusStore;
    
    // Derived Real-time values (fallback to REST if WS missing)
    $: currentPrice = wsData?.lastPrice || tickerData?.lastPrice;
    $: fundingRate = wsData?.fundingRate;
    $: nextFundingTime = wsData?.nextFundingTime;
    
    // 24h Stats (Prefer WS 'ticker' channel data, fallback to REST)
    $: highPrice = wsData?.highPrice || tickerData?.highPrice;
    $: lowPrice = wsData?.lowPrice || tickerData?.lowPrice;
    $: volume = wsData?.volume || tickerData?.volume;
    $: priceChangePercent = wsData?.priceChangePercent || tickerData?.priceChangePercent;

    // Depth Data
    $: depthData = wsData?.depth;

    $: isFavorite = symbol
        ? $favoritesStore.includes(symbol)
        : false;

    // Countdown Logic
    let countdownText = "--:--:--";
    let countdownInterval: any;

    $: if (nextFundingTime) {
        startCountdown();
    }

    function startCountdown() {
        if (countdownInterval) clearInterval(countdownInterval);
        const update = () => {
            if (!nextFundingTime) return;
            const now = Date.now();
            const diff = nextFundingTime - now;
            if (diff <= 0) {
                countdownText = "00:00:00";
            } else {
                const h = Math.floor(diff / (1000 * 60 * 60));
                const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                const s = Math.floor((diff % (1000 * 60)) / 1000);
                countdownText = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
            }
        };
        update();
        countdownInterval = setInterval(update, 1000);
    }

    // Subscribe to WS when symbol changes
    $: if (symbol && provider === 'bitunix') {
        bitunixWs.subscribe(symbol, 'price');
        bitunixWs.subscribe(symbol, 'ticker'); // Subscribe to 24h ticker
        bitunixWs.subscribe(symbol, 'depth_book5');
    }

    // REST Polling for Volume/24h Change (Background)
    $: if (symbol && provider) {
        // Only run REST polling if we are NOT using Bitunix (or if we want a fallback initially)
        // Bitunix uses WS for this now.
        if (provider !== 'bitunix') {
             setupRestInterval();
             fetchRestData();
        } else {
            // For Bitunix, clear REST interval if it exists
            if (restIntervalId) {
                clearInterval(restIntervalId);
                restIntervalId = undefined;
            }
            // Maybe fetch once initially to populate before WS connects? 
            // Optional, but might feel faster.
            // fetchRestData(); 
        }
    }

    function setupRestInterval() {
        if (restIntervalId) clearInterval(restIntervalId);
        const interval = $settingsStore.marketDataInterval === '1s' ? 5000 : 60000;
        restIntervalId = setInterval(() => fetchRestData(true), interval);
    }

    async function fetchRestData(isBackground = false) {
        if (!symbol || symbol.length < 3) return;
        if (!isBackground && !tickerData) restLoading = true;
        
        try {
            const data = await apiService.fetchTicker24h(symbol, provider);
            tickerData = data;
            restError = null;
        } catch (e) {
            console.error("Failed to fetch REST market data", e);
            restError = "N/A";
        } finally {
            restLoading = false;
        }
    }

    onMount(() => {
        if (symbol && provider === 'bitunix') {
            bitunixWs.connect();
        }
    });

    onDestroy(() => {
        if (restIntervalId) clearInterval(restIntervalId);
        if (countdownInterval) clearInterval(countdownInterval);
        if (symbol && provider === 'bitunix') {
             bitunixWs.unsubscribe(symbol, 'price');
             bitunixWs.unsubscribe(symbol, 'ticker');
             bitunixWs.unsubscribe(symbol, 'depth_book5');
        }
    });

    function formatValue(val: Decimal | undefined | null, decimals: number = 2) {
        if (!val) return "-";
        return formatDynamicDecimal(val, decimals);
    }

    function getDisplaySymbol(rawSymbol: string | undefined): string {
        if (!rawSymbol) return symbol || "";
        let display = rawSymbol.toUpperCase();
        if (!display.endsWith("P") && !display.endsWith(".P")) {
            display += "P";
        }
        return display;
    }

    function toggleFavorite() {
        if (symbol) favoritesStore.toggleFavorite(symbol);
    }

    function loadToCalculator() {
        if (isFavoriteTile && symbol) {
            updateTradeStore((s) => {
                const newState = { ...s, symbol: symbol.toUpperCase() };
                if (currentPrice) {
                    newState.entryPrice = currentPrice.toNumber();
                }
                return newState;
            });
        }
    }
</script>

<!-- svelte-ignore a11y-no-noninteractive-tabindex -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
    class="market-overview-card bg-[var(--bg-secondary)] rounded-xl shadow-lg border border-[var(--border-color)] p-4 flex flex-col gap-2 min-w-[200px] backdrop-blur-sm bg-opacity-95 transition-all relative {isFavoriteTile
        ? 'cursor-pointer hover:border-[var(--accent-color)] active:scale-[0.98]'
        : ''}"
    on:click={loadToCalculator}
    on:keydown={(e) => e.key === "Enter" && loadToCalculator()}
    role={isFavoriteTile ? "button" : "region"}
    tabindex={isFavoriteTile ? 0 : -1}
>
    <!-- WS Indicator Removed -->

    <!-- Absolute Refresh Button (Top Right) -->
    <button
        class="absolute top-2 right-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors p-1 rounded-md hover:bg-[var(--bg-tertiary)] z-50"
        title="Refresh Stats"
        on:click|stopPropagation={() => fetchRestData()}
        class:animate-spin={restLoading}
    >
        {@html icons.refresh ||
            '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 5.5A10 10 0 1 1 11.99 2.02"/></svg>'}
    </button>

    <div class="flex justify-between items-start">
        <div>
            <div
                class="text-xs text-[var(--text-secondary)] uppercase font-bold tracking-wider"
            >
                {provider}
            </div>
            <div class="text-lg font-bold text-[var(--text-primary)]">
                {displaySymbol}
            </div>
        </div>
    </div>

    {#if restError && !currentPrice}
        <div class="text-center text-[var(--danger-color)] text-sm py-2">
            {$_("apiErrors.symbolNotFound") || "Symbol not found"}
        </div>
    {:else if currentPrice || tickerData}
        <div class="flex flex-col gap-1 mt-1">
            <div class="flex justify-between items-baseline">
                <span class="text-2xl font-bold text-[var(--text-primary)] transition-colors duration-200"
                      class:text-green-400={false}
                >
                    {formatValue(currentPrice, 4)}
                </span>
                {#if priceChangePercent}
                <span
                    class="text-sm font-medium"
                    style:color={priceChangePercent.gte(0)
                        ? "var(--success-color)"
                        : "var(--danger-color)"}
                >
                    {priceChangePercent.gte(0) ? "+" : ""}{formatValue(priceChangePercent, 2)}%
                </span>
                {/if}
            </div>
            
            <!-- Depth Visualization -->
            {#if depthData}
                <DepthBar bids={depthData.bids} asks={depthData.asks} />
            {/if}

            <!-- 24h Stats (WS or REST) -->
            {#if highPrice || tickerData}
            <div class="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-xs">
                <div class="flex flex-col">
                    <span class="text-[var(--text-secondary)]">24h High</span>
                    <span class="font-medium text-[var(--text-primary)]">{formatValue(highPrice, 4)}</span>
                </div>
                <div class="flex flex-col text-right">
                    <span class="text-[var(--text-secondary)]">24h Low</span>
                    <span class="font-medium text-[var(--text-primary)]">{formatValue(lowPrice, 4)}</span>
                </div>
                <div class="flex flex-col col-span-2 mt-1">
                    <span class="text-[var(--text-secondary)]">Vol ({displaySymbol.replace(/USDT.?$/, "").replace(/P$/, "")})</span>
                    <span class="font-medium text-[var(--text-primary)]">{formatValue(volume, 0)}</span>
                </div>
            </div>
            {/if}

            <!-- WS Funding Rate Section -->
            {#if fundingRate}
            <div class="mt-3 pt-2 border-t border-[var(--border-color)] grid grid-cols-2 gap-2 text-xs">
                 <div class="flex flex-col">
                    <span class="text-[var(--text-secondary)]">Funding Rate</span>
                    <span class="font-medium" 
                          class:text-[var(--success-color)]={fundingRate.gt(0)} 
                          class:text-[var(--danger-color)]={fundingRate.lt(0)}>
                        {formatValue(fundingRate.times(100), 4)}%
                    </span>
                 </div>
                 <div class="flex flex-col text-right">
                    <span class="text-[var(--text-secondary)]">Countdown</span>
                    <span class="font-mono text-[var(--text-primary)]">{countdownText}</span>
                 </div>
            </div>
            {/if}
        </div>
    {:else}
        <!-- Loading Skeleton -->
        <div class="flex justify-center py-4">
            <div class="animate-pulse flex flex-col w-full gap-2">
                <div class="h-8 bg-[var(--bg-tertiary)] rounded w-3/4"></div>
                <div class="h-4 bg-[var(--bg-tertiary)] rounded w-1/2"></div>
                <div class="h-12 bg-[var(--bg-tertiary)] rounded w-full mt-2"></div>
            </div>
        </div>
    {/if}

    <!-- Star Icon for Favorites -->
    <button
        class="absolute bottom-2 right-2 text-[var(--text-secondary)] hover:text-[var(--accent-color)] transition-colors p-1"
        class:text-[var(--accent-color)]={isFavorite}
        on:click|stopPropagation={toggleFavorite}
        title={isFavorite ? "Remove from Favorites" : "Add to Favorites"}
    >
        {#if isFavorite}
            {@html icons.starFilled}
        {:else}
            {@html icons.starEmpty}
        {/if}
    </button>
</div>

<style>
    .market-overview-card {
        z-index: 40;
    }
</style>