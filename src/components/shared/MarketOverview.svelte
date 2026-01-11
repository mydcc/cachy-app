<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { tradeStore, updateTradeStore } from "../../stores/tradeStore";
    import { settingsStore } from "../../stores/settingsStore";
    import { indicatorStore } from "../../stores/indicatorStore";
    import { favoritesStore } from "../../stores/favoritesStore";
    import { marketStore, wsStatusStore } from "../../stores/marketStore";
    import { bitunixWs } from "../../services/bitunixWs";
    import { apiService, type Ticker24h, type Kline } from "../../services/apiService";
    import { icons } from "../../lib/constants";
    import { _ } from "../../locales/i18n";
    import { formatDynamicDecimal } from "../../utils/utils";
    import { indicators } from "../../utils/indicators";
    import { Decimal } from "decimal.js";
    import DepthBar from "./DepthBar.svelte"; // Import the new DepthBar
    import Tooltip from "./Tooltip.svelte";
    import { enhancedInput } from "../../lib/actions/inputEnhancements";

    export let customSymbol: string | undefined = undefined;
    export let isFavoriteTile: boolean = false;
    export let onToggleTechnicals: (() => void) | undefined = undefined;
    export let isTechnicalsVisible: boolean = false;

    // View Mode State: 'depth' or 'trades'
    let viewMode: 'depth' | 'trades' = 'depth';
    let isTradeSettingsOpen = false;

    // Use custom symbol if provided, otherwise fall back to store symbol
    $: symbol = (customSymbol || $tradeStore.symbol || '').toUpperCase();
    $: normalizedSymbolForWs = symbol.replace('.P', '').replace('P', ''); // Basic normalization for WS
    $: provider = $settingsStore.apiProvider;
    $: displaySymbol = getDisplaySymbol(symbol);

    // Trade List Settings
    $: tradeListSettings = $settingsStore.tradeListSettings;

    function updateTradeSetting(key: string, value: number) {
        settingsStore.update(s => ({
            ...s,
            tradeListSettings: {
                ...s.tradeListSettings,
                [key]: value
            }
        }));
    }

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

    // Trade Data Processing
    $: filteredTrades = (wsData?.trades || [])
        .filter(t => {
            const now = Date.now();
            const ageSeconds = (now - t.time) / 1000;
            const minValue = new Decimal(tradeListSettings.minTradeValue);

            // Age Filter
            if (ageSeconds > tradeListSettings.maxTradeAgeSeconds) return false;

            // Value Filter
            if (t.value.lt(minValue)) return false;

            return true;
        })
        .slice(0, tradeListSettings.maxTradeCount);

    // RSI Logic
    let historyKlines: Kline[] = [];
    let rsiValue: Decimal | null = null;
    let signalValue: Decimal | null = null;

    // Determine effective Timeframe
    $: effectiveRsiTimeframe = $settingsStore.syncRsiTimeframe
        ? ($tradeStore.atrTimeframe || $indicatorStore.rsi.defaultTimeframe || '1d')
        : ($indicatorStore.rsi.defaultTimeframe || '1d');

    // Subscribe Channel Mapping
    function mapTimeframeToChannel(tf: string): string {
        const map: Record<string, string> = {
            '1m': 'market_kline_1min',
            '3m': 'market_kline_3min',
            '5m': 'market_kline_5min',
            '15m': 'market_kline_15min',
            '30m': 'market_kline_30min',
            '1h': 'market_kline_60min',
            '2h': 'market_kline_2h',
            '4h': 'market_kline_4h',
            '6h': 'market_kline_6h',
            '8h': 'market_kline_8h',
            '12h': 'market_kline_12h',
            '1d': 'market_kline_1day',
            '3d': 'market_kline_3day',
            '1w': 'market_kline_1week',
            '1M': 'market_kline_1month',
        };
        return map[tf] || 'market_kline_1day';
    }

    // Fetch History on Mount/Symbol/Timeframe Change
    $: if (symbol && provider === 'bitunix' && effectiveRsiTimeframe) {
        fetchHistoryKlines(effectiveRsiTimeframe);
        // Update WS Subscription
        bitunixWs.subscribe(symbol, mapTimeframeToChannel(effectiveRsiTimeframe) as any);
    }

    let currentWsChannel: string | null = null;
    $: if (symbol && provider === 'bitunix' && effectiveRsiTimeframe) {
        const newChannel = mapTimeframeToChannel(effectiveRsiTimeframe);
        if (currentWsChannel && currentWsChannel !== newChannel) {
            bitunixWs.unsubscribe(symbol, currentWsChannel as any);
        }
        bitunixWs.subscribe(symbol, newChannel as any);
        currentWsChannel = newChannel;
    }

    async function fetchHistoryKlines(tf: string) {
        try {
            // Need enough history for RSI + Signal
            // RSI 14 needs 15. Signal 14 needs 14 more RSIs. Total ~30-40.
            const limit = Math.max($indicatorStore.rsi.length + $indicatorStore.rsi.signalLength + 10, 50);
            const klines = await apiService.fetchBitunixKlines(symbol, tf, limit);
            historyKlines = klines;
        } catch (e) {
            console.error("Failed to fetch kline history for RSI", e);
        }
    }

    // Reactively Calculate RSI
    $: if (historyKlines.length > 0) {
        const sourceMode = $indicatorStore.rsi.source || 'close';
        const length = $indicatorStore.rsi.length || 14;

        // Prepare Source Array
        // Map Klines to Values
        let values = historyKlines.map(k => {
            if (sourceMode === 'open') return k.open;
            if (sourceMode === 'high') return k.high;
            if (sourceMode === 'low') return k.low;
            if (sourceMode === 'hl2') return k.high.plus(k.low).div(2);
            if (sourceMode === 'hlc3') return k.high.plus(k.low).plus(k.close).div(3);
            return k.close;
        });

        // Update latest candle from WS
        if (wsData?.kline) {
            const k = wsData.kline;
            let currentVal = k.close;
            if (sourceMode === 'open') currentVal = k.open;
            else if (sourceMode === 'high') currentVal = k.high;
            else if (sourceMode === 'low') currentVal = k.low;
            else if (sourceMode === 'hl2') currentVal = k.high.plus(k.low).div(2);
            else if (sourceMode === 'hlc3') currentVal = k.high.plus(k.low).plus(k.close).div(3);

            // Update last element
            if (values.length > 0) values[values.length - 1] = currentVal;
        } else if (currentPrice && sourceMode === 'close') {
             // Fallback for Close only
             if (values.length > 0) values[values.length - 1] = currentPrice;
        }

        // Calculate RSI Series (we need series for Signal line)
        // indicators.calculateRSI returns ONE value. We need a series?
        // indicators.ts only returns the LAST RSI.
        // I need to implement calculateRSI_Series or just calculate RSI array manually here?
        // OR extend indicators.ts to return series?
        // For Signal Line (MA of RSI), I need at least 'signalLength' RSIs.

        // Let's modify logic:
        // 1. Calculate RSI for the whole array?
        // `indicators.calculateRSI` calculates ONE value at the end.
        // To get a series, I need to call it sliding window? Inefficient.
        // I should have implemented `calculateRSISeries`.

        // Calculate RSI Series
        // We need previous RSIs to calculate the Signal Line (MA of RSI).
        // Since `indicators.calculateRSI` returns only the *last* RSI, we need to manually calculate the series
        // or loop. Looping is acceptable for ~100 points.

        const rsiSeries: Decimal[] = [];
        // We need enough data points.
        // Start from index = length.
        if (values.length > length) {
            // Optimization: Only calculate last N RSIs needed for Signal Line
            // Signal Line is EMA/SMA of RSI. Requires `signalLength` points.
            const signalLen = $indicatorStore.rsi.signalLength || 14;
            const pointsNeededForSignal = signalLen + 10; // Buffer

            let startIndex = Math.max(length, values.length - pointsNeededForSignal - 1);

            // To calculate RSI at 'startIndex', we need previous 'length' price changes.
            // Actually, standard RSI uses Wilder's Smoothing which depends on ALL previous data for accuracy.
            // For approximation with limited history, we can start calculation earlier.
            // Best is to just calculate RSI for the whole available history (limit=50-100 is small enough).

            startIndex = length; // Calculate all possible RSIs from the fetched history

            // We need to implement a loop calling calculateRSI on slices?
            // No, that's O(N^2).
            // Better to use `calculateRSI` logic iteratively?
            // `indicators.ts` doesn't expose iterative logic.
            // For now, given N=100, O(N^2) is fine (100 * 100 = 10,000 ops -> instant).

            for (let i = startIndex; i < values.length; i++) {
                // Slice from 0 to i+1 (inclusive of current candle)
                // Actually `calculateRSI` takes the whole array and returns the last one.
                // So pass slice 0..i+1
                const slice = values.slice(0, i + 1);
                const r = indicators.calculateRSI(slice, length);
                if (r) rsiSeries.push(r);
            }
        }

        if (rsiSeries.length > 0) {
            rsiValue = rsiSeries[rsiSeries.length - 1];

            // Calculate Signal Line
            if ($indicatorStore.rsi.showSignal) {
                const sigType = $indicatorStore.rsi.signalType || 'sma';
                const sigLen = $indicatorStore.rsi.signalLength || 14;

                if (sigType === 'ema') {
                    signalValue = indicators.calculateEMA(rsiSeries, sigLen);
                } else {
                    signalValue = indicators.calculateSMA(rsiSeries, sigLen);
                }
            } else {
                signalValue = null;
            }
        } else {
            rsiValue = null;
            signalValue = null;
        }
    }

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
        bitunixWs.subscribe(symbol, 'trade'); // Subscribe to trade channel
        // Kline subscription handled above dynamically
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
             bitunixWs.unsubscribe(symbol, 'trade');
             if (currentWsChannel) bitunixWs.unsubscribe(symbol, currentWsChannel as any);
        }
    });

    function formatValue(val: Decimal | undefined | null, decimals: number = 2) {
        if (!val) return "-";
        return formatDynamicDecimal(val, decimals);
    }

    function getDisplaySymbol(rawSymbol: string | undefined): string {
        if (!rawSymbol) return symbol || "";
        let display = rawSymbol.toUpperCase();

        if (display.endsWith(".P")) {
            display = display.slice(0, -2);
        } else if (display.endsWith("USDTP")) {
            display = display.slice(0, -1);
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

    <!-- Absolute Buttons (Top Right) -->
    <div class="absolute top-2 right-2 flex gap-1 z-50">
        {#if $settingsStore.showTechnicals && !isFavoriteTile && onToggleTechnicals}
            <button
                class="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors p-1 rounded-md hover:bg-[var(--bg-tertiary)]"
                class:text-[var(--accent-color)]={isTechnicalsVisible}
                title="Toggle Technicals"
                on:click|stopPropagation={onToggleTechnicals}
            >
                {@html icons.chart || '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>'}
            </button>
        {/if}

        <button
            class="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors p-1 rounded-md hover:bg-[var(--bg-tertiary)]"
            title="Refresh Stats"
            on:click|stopPropagation={() => fetchRestData()}
            class:animate-spin={restLoading}
        >
            {@html icons.refresh ||
                '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 5.5A10 10 0 1 1 11.99 2.02"/></svg>'}
        </button>
    </div>

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
            
            <!-- View Toggle & Settings -->
            <div class="flex justify-end items-center gap-1 mt-1 -mb-1 relative z-30">
                 <!-- Settings for Trade List (Only visible in Trade Mode) -->
                 {#if viewMode === 'trades'}
                    <div class="relative group">
                         <button
                            class="text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-0.5 rounded"
                            on:click|stopPropagation={() => isTradeSettingsOpen = !isTradeSettingsOpen}
                            title="Filter Trades"
                         >
                            {@html icons.settings || '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>'}
                         </button>

                         {#if isTradeSettingsOpen}
                            <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
                            <div
                                class="absolute right-0 top-full mt-1 bg-[var(--bg-tertiary)] border border-[var(--border-color)] p-3 rounded shadow-xl w-48 z-50 text-xs"
                                on:click|stopPropagation
                                on:keydown|stopPropagation
                                role="dialog"
                                aria-label="Trade List Settings"
                            >
                                <div class="flex flex-col gap-2">
                                    <div class="font-bold border-b border-[var(--border-color)] pb-1 mb-1">Trade List Filters</div>

                                    <div class="flex flex-col gap-1">
                                        <label for="min-trade-val" class="text-[var(--text-secondary)]">Min Value ($)</label>
                                        <input
                                            id="min-trade-val"
                                            type="number"
                                            class="bg-[var(--bg-primary)] border border-[var(--border-color)] rounded px-1 py-0.5 w-full focus:outline-none focus:border-[var(--accent-color)]"
                                            value={tradeListSettings.minTradeValue}
                                            on:input={(e) => updateTradeSetting('minTradeValue', Number(e.currentTarget.value))}
                                            use:enhancedInput
                                        />
                                    </div>

                                    <div class="flex flex-col gap-1">
                                        <label for="max-trade-age" class="text-[var(--text-secondary)]">Max Age (sec)</label>
                                        <input
                                            id="max-trade-age"
                                            type="number"
                                            class="bg-[var(--bg-primary)] border border-[var(--border-color)] rounded px-1 py-0.5 w-full focus:outline-none focus:border-[var(--accent-color)]"
                                            value={tradeListSettings.maxTradeAgeSeconds}
                                            on:input={(e) => updateTradeSetting('maxTradeAgeSeconds', Number(e.currentTarget.value))}
                                            use:enhancedInput
                                        />
                                    </div>

                                    <div class="flex flex-col gap-1">
                                        <label for="max-trade-cnt" class="text-[var(--text-secondary)]">Count</label>
                                        <input
                                            id="max-trade-cnt"
                                            type="number"
                                            class="bg-[var(--bg-primary)] border border-[var(--border-color)] rounded px-1 py-0.5 w-full focus:outline-none focus:border-[var(--accent-color)]"
                                            value={tradeListSettings.maxTradeCount}
                                            on:input={(e) => updateTradeSetting('maxTradeCount', Number(e.currentTarget.value))}
                                            use:enhancedInput
                                        />
                                    </div>

                                    <button
                                        class="mt-1 bg-[var(--bg-secondary)] hover:bg-[var(--bg-primary)] border border-[var(--border-color)] rounded py-1 transition-colors"
                                        on:click={() => isTradeSettingsOpen = false}
                                    >
                                        Close
                                    </button>
                                </div>
                            </div>
                         {/if}
                    </div>
                 {/if}

                <button
                    class="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors p-0.5 rounded text-xs uppercase font-bold tracking-wider"
                    on:click|stopPropagation={() => viewMode = viewMode === 'depth' ? 'trades' : 'depth'}
                    title={viewMode === 'depth' ? "Switch to Trade List" : "Switch to Depth Bar"}
                >
                    {viewMode === 'depth' ? 'Depth' : 'Trades'}
                </button>
            </div>

            <!-- Visualization Area -->
            {#if viewMode === 'depth' && depthData}
                <div class="mt-1">
                     <DepthBar bids={depthData.bids} asks={depthData.asks} />
                </div>
            {:else if viewMode === 'trades'}
                <div class="flex flex-col gap-0.5 mt-1 text-[10px] min-h-[24px]">
                    {#if filteredTrades.length === 0}
                        <div class="text-center text-[var(--text-secondary)] italic py-1">Waiting for trades...</div>
                    {:else}
                        <div class="grid grid-cols-3 text-[var(--text-secondary)] px-1 pb-0.5 border-b border-[var(--border-color)] opacity-70">
                            <span>Time</span>
                            <span class="text-center">Price</span>
                            <span class="text-right">Val ($)</span>
                        </div>
                        {#each filteredTrades as trade (trade.time + trade.price.toString() + trade.value.toString())}
                            <div class="grid grid-cols-3 px-1 hover:bg-[var(--bg-tertiary)] rounded transition-colors">
                                <span class="text-[var(--text-secondary)] font-mono">
                                    {new Date(trade.time).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' })}
                                </span>
                                <span class="text-center font-medium font-mono"
                                      class:text-[var(--success-color)]={trade.side === 'buy'}
                                      class:text-[var(--danger-color)]={trade.side === 'sell'}
                                >
                                    {formatDynamicDecimal(trade.price, 2)}
                                </span>
                                <span class="text-right font-mono text-[var(--text-primary)]">
                                    {formatDynamicDecimal(trade.value, 0)}
                                </span>
                            </div>
                        {/each}
                    {/if}
                </div>
            {/if}

            <!-- 24h Stats (WS or REST) -->
            {#if highPrice || tickerData}
            <div class="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-xs">
                <div class="flex flex-col">
                    <span class="text-[var(--text-secondary)]">{$_('marketOverview.24hHigh')}</span>
                    <span class="font-medium text-[var(--text-primary)]">{formatValue(highPrice, 4)}</span>
                </div>
                <div class="flex flex-col text-right">
                    <span class="text-[var(--text-secondary)]">{$_('marketOverview.24hLow')}</span>
                    <span class="font-medium text-[var(--text-primary)]">{formatValue(lowPrice, 4)}</span>
                </div>
                <div class="flex flex-col mt-1">
                    <span class="text-[var(--text-secondary)]">{$_('marketOverview.vol')} ({displaySymbol.replace(/USDT.?$/, "").replace(/P$/, "")})</span>
                    <span class="font-medium text-[var(--text-primary)]">{formatValue(volume, 0)}</span>
                </div>
                <!-- RSI Display -->
                <div class="flex flex-col mt-1 text-right relative group">
                    <span class="text-[var(--text-secondary)]">RSI ({effectiveRsiTimeframe})</span>
                    <span class="font-medium transition-colors duration-300 cursor-help"
                        class:text-[var(--danger-color)]={rsiValue && rsiValue.gte(70)}
                        class:text-[var(--success-color)]={rsiValue && rsiValue.lte(30)}
                        class:text-[var(--text-primary)]={!rsiValue || (rsiValue.gt(30) && rsiValue.lt(70))}
                    >
                        {formatValue(rsiValue, 2)}
                    </span>
                    <!-- Tooltip -->
                    <div class="absolute right-0 bottom-full mb-2 hidden group-hover:block z-50">
                        <Tooltip>
                            <div class="flex flex-col gap-1 text-xs whitespace-nowrap bg-[var(--bg-tertiary)] text-[var(--text-primary)] p-2 rounded shadow-xl border border-[var(--border-color)]">
                                <div class="font-bold border-b border-[var(--border-color)] pb-1 mb-1">RSI Settings</div>
                                <div class="flex justify-between gap-4">
                                    <span>{$_('marketOverview.length')}:</span>
                                    <span class="font-mono">{$indicatorStore.rsi.length}</span>
                                </div>
                                <div class="flex justify-between gap-4">
                                    <span>{$_('marketOverview.source')}:</span>
                                    <span class="font-mono capitalize">{$indicatorStore.rsi.source}</span>
                                </div>
                                {#if $indicatorStore.rsi.showSignal && signalValue}
                                <div class="flex justify-between gap-4 text-[var(--accent-color)]">
                                    <span>{$_('marketOverview.signal')} ({$indicatorStore.rsi.signalType.toUpperCase()}):</span>
                                    <span class="font-mono">{formatValue(signalValue, 2)}</span>
                                </div>
                                {/if}
                            </div>
                        </Tooltip>
                    </div>
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