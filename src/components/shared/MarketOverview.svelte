<!--
  Copyright (C) 2026 MYDCT

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License
  along with this program.  If not, see <https://www.gnu.org/licenses/>.
-->

<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { fade } from "svelte/transition";
  import { uiState } from "../../stores/ui.svelte";
  import { tradeState } from "../../stores/trade.svelte";
  import { settingsState } from "../../stores/settings.svelte";
  import { indicatorState } from "../../stores/indicator.svelte";
  import { favoritesState } from "../../stores/favorites.svelte";
  import { marketState, type MarketData } from "../../stores/market.svelte";
  import { marketWatcher } from "../../services/marketWatcher";
  import {
    apiService,
    type Ticker24h,
    type Kline,
  } from "../../services/apiService";
  import { JSIndicators } from "../../services/technicalsService";
  import { icons } from "../../lib/constants";
  import { _ } from "../../locales/i18n";
  import { formatDynamicDecimal } from "../../utils/utils";
  import { normalizeSymbol } from "../../utils/symbolUtils";
  import { indicators } from "../../utils/indicators";
  import { Decimal } from "decimal.js";
  import { app } from "../../services/app";
  import DepthBar from "./DepthBar.svelte"; // Import the new DepthBar
  import Tooltip from "./Tooltip.svelte";
  import NewsSentimentPanel from "./NewsSentimentPanel.svelte";

  interface Props {
    customSymbol?: string | undefined;
    isFavoriteTile?: boolean;
    onToggleTechnicals?: (() => void) | undefined;
    isTechnicalsVisible?: boolean;
  }

  let {
    customSymbol = undefined,
    isFavoriteTile = false,
    onToggleTechnicals = undefined,
    isTechnicalsVisible = false,
  }: Props = $props();

  // Initial state
  let animationKey = $state(0);
  let priceTrend: "up" | "down" | null = $state(null);
  let isInitialLoad = $state(true);

  // RSI Logic
  let historyKlines: Kline[] = $state([]);
  // Price Flashing & Trend Logic
  let flashingDigitIndexes: Set<number> = $state(new Set());
  let lastPriceStr: string = $state("");
  let flashTimeout: any = null;

  // Helper to get changed parts of price
  const priceParts = $derived.by(() => {
    const s = currentPrice ? currentPrice.toString() : "0.0000";
    const parts = [];
    for (let i = 0; i < s.length; i++) {
      parts.push({
        char: s[i],
        changed: flashingDigitIndexes.has(i),
      });
    }
    return parts;
  });

  $effect(() => {
    const cp = currentPrice;
    if (!cp) return;
    const s = cp.toString();

    if (lastPriceStr && s !== lastPriceStr) {
      const trend = Number(s) > Number(lastPriceStr) ? "up" : "down";
      const newIndexes = new Set<number>();

      // Identify which digits changed and flash all digits to the right as well
      let foundChange = false;
      for (let i = 0; i < s.length; i++) {
        if (foundChange || s[i] !== lastPriceStr[i]) {
          newIndexes.add(i);
          foundChange = true;
        }
      }

      priceTrend = trend;
      flashingDigitIndexes = newIndexes;
      animationKey += 1;

      if (flashTimeout) clearTimeout(flashTimeout);
      flashTimeout = setTimeout(() => {
        flashingDigitIndexes = new Set();
      }, 600);
    }

    lastPriceStr = s;
  });
  let rsiValue: Decimal | null = $state(null);
  let signalValue: Decimal | null = $state(null);
  let lastRsiCalcTime = 0;
  const RSI_THROTTLE_MS = 1000;
  let rsiTimeout: any = null;

  // Subscribe Channel Mapping
  function mapTimeframeToChannel(tf: string): string {
    const map: Record<string, string> = {
      "1m": "market_kline_1min",
      "3m": "market_kline_3min",
      "5m": "market_kline_5min",
      "15m": "market_kline_15min",
      "30m": "market_kline_30min",
      "1h": "market_kline_60min",
      "2h": "market_kline_2h",
      "4h": "market_kline_4h",
      "6h": "market_kline_6h",
      "8h": "market_kline_8h",
      "12h": "market_kline_12h",
      "1d": "market_kline_1day",
      "3d": "market_kline_3day",
      "1w": "market_kline_1week",
      "1M": "market_kline_1month",
    };
    return map[tf] || "market_kline_1day";
  }

  // Fetch History on Mount/Symbol/Timeframe Change
  // Manage dynamic kline subscription via MarketWatcher
  let currentWsKlineChannel: string | null = $state(null);

  async function fetchHistoryKlines(tf: string) {
    if (!symbol || symbol.length < 3) return;
    try {
      // Need enough history for RSI + Signal
      const limit = Math.max(
        indicatorState.rsi.length + indicatorState.rsi.signalLength + 10,
        50,
      );
      const klines = await apiService.fetchBitunixKlines(symbol, tf, limit);
      historyKlines = klines ?? [];
    } catch (e: any) {
      if (e.message !== "apiErrors.symbolNotFound") {
        console.error("Failed to fetch kline history for RSI", e);
      }
    } finally {
    }
  }

  // Countdown Logic
  let countdownText = $state("--:--:--");
  let countdownInterval: any;

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
        countdownText = `${h.toString().padStart(2, "0")}:${m
          .toString()
          .padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
      }
    };
    update();
    countdownInterval = setInterval(update, 1000);
  }

  // Reactive Variables
  let symbol = $derived(customSymbol || tradeState.symbol || "");
  let provider = $derived(settingsState.apiProvider);
  let tickerData = $derived(
    marketState.data[normalizeSymbol(symbol, "bitunix")],
  );
  // WS Data
  let wsData = $derived.by(() => {
    if (!symbol) return null;
    return marketState.data[normalizeSymbol(symbol, "bitunix")] || null;
  });
  let displaySymbol = $derived(getDisplaySymbol(symbol));

  $effect(() => {
    // MarketWatcher handles connections and polling automatically
    // Cleanup logic moved here
    return () => {
      if (countdownInterval) clearInterval(countdownInterval);
      if (symbol && provider === "bitunix") {
        marketWatcher.unregister(symbol, "price");
        marketWatcher.unregister(symbol, "ticker");
        marketWatcher.unregister(symbol, "depth_book5");
        if (currentWsKlineChannel)
          marketWatcher.unregister(symbol, currentWsKlineChannel);
      }
    };
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
    if (symbol) favoritesState.toggleFavorite(symbol);
  }

  function loadToCalculator() {
    if (isFavoriteTile && symbol) {
      tradeState.update((s) => {
        const newState = {
          ...s,
          symbol: symbol.toUpperCase(),
          useAtrSl: true, // Auto-enable ATR Stop Loss
          atrMode: "auto" as "auto" | "manual", // Set to auto mode
        };
        if (currentPrice) {
          newState.entryPrice = currentPrice.toNumber();
        }
        return newState;
      });

      // Fetch everything: Price, Service-ATR and Multi-ATR
      app.fetchAllAnalysisData(symbol.toUpperCase());
    }
  }

  // --- Channel Logic ---
  // --- Channel Logic ---
  const CHANNEL_CONFIG: Record<string, string | boolean> = {
    BTC: true, // true = use symbol as ID
    ETH: true,
    SOL: true,
    LINK: true,
    XRP: true,
    // Example for mapping a symbol to a different plot_id:
    // DOGE: "meme_plot"
  };

  function openChannel() {
    if (!symbol) return;
    const s = symbol.toUpperCase().replace(/USDT(\.P|P)?$/, "");

    // Check if symbol is configured
    const config = CHANNEL_CONFIG[s];
    if (!config) return;

    // Determine plot_id: use specific string if provided, otherwise symbol
    const plotId = typeof config === "string" ? config : s;

    const url = `https://space.cachy.app/index.php?plot_id=${plotId}`;
    const title = `${s} Channel`;

    // Open in dynamic window with unique ID per config/symbol
    const windowId = `channel_${plotId}`;
    uiState.toggleWindow(windowId, url, title);
  }

  let wsStatus = $derived(marketState.connectionStatus);
  // Derived Real-time values
  let currentPrice = $derived.by(() => {
    return (wsData?.lastPrice ??
      tickerData?.lastPrice ??
      null) as Decimal | null;
  });

  // Funding Rate & Countdown
  let fundingRate = $derived.by(
    () => (wsData?.fundingRate ?? null) as Decimal | null,
  );
  let nextFundingTime = $derived.by(
    () => (wsData?.nextFundingTime ?? null) as number | null,
  );
  // 24h Stats
  let highPrice = $derived.by(
    () =>
      (wsData?.highPrice ?? tickerData?.highPrice ?? null) as Decimal | null,
  );
  let lowPrice = $derived.by(
    () => (wsData?.lowPrice ?? tickerData?.lowPrice ?? null) as Decimal | null,
  );
  let volume = $derived.by(
    () => (wsData?.volume ?? tickerData?.volume ?? null) as Decimal | null,
  );
  let priceChangePercent = $derived.by(
    () =>
      (wsData?.priceChangePercent ??
        tickerData?.priceChangePercent ??
        null) as Decimal | null,
  );
  // Depth Data
  let depthData = $derived(wsData?.depth);
  // RSI Timeframe
  let effectiveRsiTimeframe = $derived(
    settingsState.syncRsiTimeframe
      ? tradeState.atrTimeframe || indicatorState.rsi.defaultTimeframe || "1d"
      : indicatorState.rsi.defaultTimeframe || "1d",
  );
  $effect(() => {
    if (
      symbol &&
      symbol.length >= 3 &&
      provider === "bitunix" &&
      effectiveRsiTimeframe
    ) {
      untrack(() => {
        fetchHistoryKlines(effectiveRsiTimeframe);

        const newChannel = `kline_${effectiveRsiTimeframe}`;
        if (currentWsKlineChannel && currentWsKlineChannel !== newChannel) {
          marketWatcher.unregister(symbol, currentWsKlineChannel);
        }
        marketWatcher.register(symbol, newChannel);
        currentWsKlineChannel = newChannel;
      });
    }
  });

  // Base Asset (e.g. XRP) for external links
  let baseAsset = $derived(symbol.toUpperCase().replace(/USDT(\.P|P)?$/, ""));

  // Dynamic TradingView Link
  let tvLink = $derived.by(() => {
    const providerPrefix =
      provider.toUpperCase() === "BINANCE" ? "BINANCE" : "BITUNIX";
    const formattedSymbol = symbol.endsWith(".P")
      ? symbol.replace(".P", "")
      : symbol;
    return `https://www.tradingview.com/chart/?symbol=${providerPrefix}:${formattedSymbol.toUpperCase()}`;
  });

  // Coinglass Heatmap Link
  let cgHeatmapLink = $derived(
    `https://www.coinglass.com/pro/futures/LiquidationHeatMap?coin=${baseAsset}`,
  );

  // Direct Broker Link
  let brokerLink = $derived.by(() => {
    const s = symbol.toUpperCase();
    if (provider.toLowerCase() === "binance") {
      // Binance Futures URL structure
      const formatted = s.endsWith("USDT") ? s : s + "USDT";
      return `https://www.binance.com/en/futures/${formatted}`;
    } else {
      // Bitunix Contract Trade URL structure
      const formatted = s.endsWith("USDT") ? s : s + "USDT";
      return `https://www.bitunix.com/contract-trade/${formatted}`;
    }
  });

  $effect(() => {
    if (historyKlines.length > 0) {
      const _triggers = [indicatorState.rsi, currentPrice];

      untrack(() => {
        const now = Date.now();
        const timeSinceLast = now - lastRsiCalcTime;

        const performCalc = () => {
          const sourceMode = indicatorState.rsi.source || "close";
          const length = indicatorState.rsi.length || 14;

          let values = historyKlines.map((k) => {
            if (sourceMode === "open") return k.open;
            if (sourceMode === "high") return k.high;
            if (sourceMode === "low") return k.low;
            if (sourceMode === "hl2") return k.high.plus(k.low).div(2);
            if (sourceMode === "hlc3")
              return k.high.plus(k.low).plus(k.close).div(3);
            return k.close;
          });

          const liveKline = wsData?.klines
            ? wsData.klines[effectiveRsiTimeframe]
            : null;
          if (liveKline) {
            let currentVal = liveKline.close;
            if (sourceMode === "open") currentVal = liveKline.open;
            else if (sourceMode === "high") currentVal = liveKline.high;
            else if (sourceMode === "low") currentVal = liveKline.low;
            else if (sourceMode === "hl2")
              currentVal = liveKline.high.plus(liveKline.low).div(2);
            else if (sourceMode === "hlc3")
              currentVal = liveKline.high
                .plus(liveKline.low)
                .plus(liveKline.close)
                .div(3);

            if (values && values.length > 0)
              values[values.length - 1] = currentVal;
          } else if (currentPrice && sourceMode === "close") {
            if (values && values.length > 0)
              values[values.length - 1] = currentPrice as Decimal;
          }

          const rsiSeries: Decimal[] = [];
          if (values.length > length) {
            const valuesNum = values.map((v) => v.toNumber());
            const rsiSeriesNum = JSIndicators.rsi(valuesNum, length);
            for (let i = 0; i < rsiSeriesNum.length; i++) {
              if (rsiSeriesNum[i] > 0) {
                rsiSeries.push(new Decimal(rsiSeriesNum[i]));
              }
            }
          }

          if (rsiSeries.length > 0) {
            rsiValue = rsiSeries[rsiSeries.length - 1];
            if (indicatorState.rsi.showSignal) {
              const sigType = indicatorState.rsi.signalType || "sma";
              const sigLen = indicatorState.rsi.signalLength || 14;
              if (sigType === "ema") {
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
          lastRsiCalcTime = Date.now();
        };

        if (timeSinceLast >= RSI_THROTTLE_MS) {
          performCalc();
        } else {
          if (rsiTimeout) clearTimeout(rsiTimeout);
          rsiTimeout = setTimeout(performCalc, RSI_THROTTLE_MS - timeSinceLast);
        }
      });
    }
  });
  let isFavorite = $derived(
    symbol ? favoritesState.items.includes(symbol) : false,
  );
  $effect(() => {
    if (nextFundingTime) untrack(startCountdown);
  });
  // Watch for symbol or provider changes
  $effect(() => {
    if (symbol) {
      marketWatcher.register(symbol, "price");
      marketWatcher.register(symbol, "ticker");
      return () => {
        marketWatcher.unregister(symbol, "price");
        marketWatcher.unregister(symbol, "ticker");
      };
    }
  });
  $effect(() => {
    if (symbol && provider === "bitunix") {
      marketWatcher.register(symbol, "depth_book5");
    }
  });

  // Reset isInitialLoad once we have data
  $effect(() => {
    if (isInitialLoad && (wsData || tickerData)) {
      isInitialLoad = false;
    }
  });
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="market-overview-card glass-panel rounded-xl shadow-lg border border-[var(--border-color)] p-4 flex flex-col gap-2 min-w-[200px] transition-all relative {isFavoriteTile
    ? 'cursor-pointer hover:border-[var(--accent-color)] active:opacity-90'
    : ''}"
  onclick={loadToCalculator}
  onkeydown={(e) => e.key === "Enter" && loadToCalculator()}
  role={isFavoriteTile ? "button" : "region"}
  tabindex={isFavoriteTile ? 0 : -1}
>
  <div class="absolute top-2 right-2 flex gap-1 z-50">
    {#if settingsState.showTechnicals && !isFavoriteTile && onToggleTechnicals}
      <button
        class="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors p-1 rounded-md hover:bg-[var(--bg-tertiary)]"
        class:text-[var(--accent-color)]={isTechnicalsVisible}
        title="Toggle Technicals"
        onclick={(e) => {
          e.stopPropagation();
          onToggleTechnicals?.();
        }}
      >
        {@html icons.chart ||
          '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>'}
      </button>
    {/if}

    <button
      class="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors p-1 rounded-md hover:bg-[var(--bg-tertiary)]"
      title="Refresh Stats"
      onclick={(e) => {
        e.stopPropagation();
        app.handleFetchPrice();
      }}
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

  {#if isInitialLoad}
    <!-- Loading State during initial load -->
    <div class="flex flex-col gap-4 py-2 animate-pulse">
      <div class="flex justify-between items-baseline">
        <div class="h-8 bg-[var(--bg-tertiary)] rounded w-1/2 shimmer"></div>
        <div class="h-4 bg-[var(--bg-tertiary)] rounded w-1/4 shimmer"></div>
      </div>
      <div class="h-2 bg-[var(--bg-tertiary)] rounded w-full shimmer"></div>
      <div class="grid grid-cols-2 gap-4 mt-2">
        <div class="space-y-2">
          <div class="h-3 bg-[var(--bg-tertiary)] rounded w-3/4 shimmer"></div>
          <div class="h-4 bg-[var(--bg-tertiary)] rounded w-1/2 shimmer"></div>
        </div>
        <div class="space-y-2 flex flex-col items-end">
          <div class="h-3 bg-[var(--bg-tertiary)] rounded w-3/4 shimmer"></div>
          <div class="h-4 bg-[var(--bg-tertiary)] rounded w-1/2 shimmer"></div>
        </div>
      </div>
    </div>
  {:else if !currentPrice && !tickerData}
    <!-- Error state after loading attempt -->
    <div class="text-center text-[var(--danger-color)] text-sm py-2">
      {$_("apiErrors.noMarketData") || "No market data available"}
    </div>
  {:else if !currentPrice || currentPrice.isZero()}
    <!-- Skeleton / Loading State for subsequent updates -->
    <div class="flex flex-col gap-4 py-2 animate-pulse">
      <div class="flex justify-between items-baseline">
        <div class="h-8 bg-[var(--bg-tertiary)] rounded w-1/2 shimmer"></div>
        <div class="h-4 bg-[var(--bg-tertiary)] rounded w-1/4 shimmer"></div>
      </div>
      <div class="h-2 bg-[var(--bg-tertiary)] rounded w-full shimmer"></div>
      <div class="grid grid-cols-2 gap-4 mt-2">
        <div class="space-y-2">
          <div class="h-3 bg-[var(--bg-tertiary)] rounded w-3/4 shimmer"></div>
          <div class="h-4 bg-[var(--bg-tertiary)] rounded w-1/2 shimmer"></div>
        </div>
        <div class="space-y-2 flex flex-col items-end">
          <div class="h-3 bg-[var(--bg-tertiary)] rounded w-3/4 shimmer"></div>
          <div class="h-4 bg-[var(--bg-tertiary)] rounded w-1/2 shimmer"></div>
        </div>
      </div>
    </div>
  {:else}
    <!-- Real Data State -->
    <div in:fade={{ duration: 400 }} class="flex flex-col gap-1 mt-1">
      <div class="flex justify-between items-baseline">
        <div class="text-2xl font-bold tracking-tight flex">
          {#key animationKey}
            {#each priceParts as part}
              <span
                class={part.changed
                  ? priceTrend === "up"
                    ? "price-up-flash"
                    : "price-down-flash"
                  : "text-[var(--text-primary)]"}
                style="display: inline-block;"
              >
                {part.char}
              </span>
            {/each}
          {/key}
        </div>
        {#if priceChangePercent}
          <span
            class="text-sm font-medium"
            style:color={priceChangePercent.gte(0)
              ? "var(--success-color)"
              : "var(--danger-color)"}
          >
            {priceChangePercent.gte(0) ? "+" : ""}{formatValue(
              priceChangePercent,
              2,
            )}%
          </span>
        {/if}
      </div>

      {#if settingsState.showMarketActivity && depthData}
        <DepthBar bids={depthData.bids} asks={depthData.asks} />
      {/if}

      {#if settingsState.showMarketActivity}
        <div class="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-xs">
          <div class="flex flex-col">
            <span class="text-[var(--text-secondary)]"
              >{$_("marketOverview.24hLow")}</span
            >
            <span class="font-medium text-[var(--text-primary)]"
              >{formatValue(lowPrice, 4)}</span
            >
          </div>
          <div class="flex flex-col text-right">
            <span class="text-[var(--text-secondary)]"
              >{$_("marketOverview.24hHigh")}</span
            >
            <span class="font-medium text-[var(--text-primary)]"
              >{formatValue(highPrice, 4)}</span
            >
          </div>
          <div class="flex flex-col mt-1">
            <span class="text-[var(--text-secondary)]"
              >{$_("marketOverview.vol")} ({displaySymbol
                .replace(/USDT.?$/, "")
                .replace(/P$/, "")})</span
            >
            <span class="font-medium text-[var(--text-primary)]"
              >{formatValue(volume, 0)}</span
            >
          </div>
          {#if settingsState.showMarketSentiment}
            <div class="flex flex-col mt-1 text-right relative group">
              <span class="text-[var(--text-secondary)]"
                >RSI ({effectiveRsiTimeframe})</span
              >
              <span
                class="font-medium transition-colors duration-300 cursor-help"
                class:text-[var(--danger-color)]={rsiValue && rsiValue.gte(70)}
                class:text-[var(--success-color)]={rsiValue && rsiValue.lte(30)}
                class:text-[var(--text-primary)]={!rsiValue ||
                  (rsiValue.gt(30) && rsiValue.lt(70))}
              >
                {formatValue(rsiValue, 2)}
              </span>
              <div
                class="absolute right-0 bottom-full mb-2 hidden group-hover:block z-50"
              >
                <Tooltip>
                  <div
                    class="flex flex-col gap-1 text-xs whitespace-nowrap bg-[var(--bg-tertiary)] text-[var(--text-primary)] p-2 rounded shadow-xl border border-[var(--border-color)]"
                  >
                    <div
                      class="font-bold border-b border-[var(--border-color)] pb-1 mb-1"
                    >
                      RSI Settings
                    </div>
                    <div class="flex justify-between gap-4">
                      <span>{$_("marketOverview.length")}:</span>
                      <span class="font-mono">{indicatorState.rsi.length}</span>
                    </div>
                    <div class="flex justify-between gap-4">
                      <span>{$_("marketOverview.source")}:</span>
                      <span class="font-mono capitalize"
                        >{indicatorState.rsi.source}</span
                      >
                    </div>
                    {#if indicatorState.rsi.showSignal && signalValue}
                      <div
                        class="flex justify-between gap-4 text-[var(--accent-color)]"
                      >
                        <span
                          >{$_("marketOverview.signal")} ({indicatorState.rsi.signalType.toUpperCase()}):</span
                        >
                        <span class="font-mono"
                          >{formatValue(signalValue, 2)}</span
                        >
                      </div>
                    {/if}
                  </div>
                </Tooltip>
              </div>
            </div>
          {/if}
        </div>

        {#if fundingRate}
          <div
            class="mt-3 pt-2 border-t border-[var(--border-color)] grid grid-cols-2 gap-2 text-xs"
          >
            <div class="flex flex-col">
              <span class="text-[var(--text-secondary)]">Funding Rate</span>
              <span
                class="font-medium"
                class:text-[var(--success-color)]={fundingRate.gt(0)}
                class:text-[var(--danger-color)]={fundingRate.lt(0)}
              >
                {formatValue(fundingRate.times(100), 4)}%
              </span>
            </div>
            <div class="flex flex-col text-right">
              <span class="text-[var(--text-secondary)]">Countdown</span>
              <span class="font-mono text-[var(--text-primary)]"
                >{countdownText}</span
              >
            </div>
          </div>
        {/if}
      {/if}

      {#if settingsState.showMarketOverviewLinks && symbol}
        <div
          class="flex items-center gap-4 mt-3 pt-2 border-t border-[var(--border-color)]"
        >
          {#if settingsState.showTvLink}
            <a
              href={tvLink}
              target="cachy_external_tv"
              rel="noopener noreferrer"
              class="text-[10px] uppercase font-bold text-[var(--text-secondary)] hover:text-[var(--accent-color)] transition-colors"
              title="TradingView Chart"
            >
              TV
            </a>
          {/if}

          {#if settingsState.showCgHeatLink}
            <a
              href={cgHeatmapLink}
              target="cachy_external_coinglass"
              rel="noopener noreferrer"
              class="text-[10px] uppercase font-bold text-[var(--text-secondary)] hover:text-[var(--danger-color)] transition-colors"
              title="Liquidation Heatmap"
            >
              CG Heat
            </a>
          {/if}

          {#if settingsState.showBrokerLink}
            <a
              href={brokerLink}
              target="cachy_external_broker"
              rel="noopener noreferrer"
              class="text-[10px] uppercase font-bold text-[var(--text-secondary)] hover:text-[var(--success-color)] transition-colors"
              title="Open on {provider}"
            >
              {provider.toUpperCase()}
            </a>
          {/if}

          {#if CHANNEL_CONFIG[baseAsset] && settingsState.isPro}
            {@const config = CHANNEL_CONFIG[baseAsset]}
            {@const plotId = typeof config === "string" ? config : baseAsset}
            {@const windowId = `channel_${plotId}`}
            {@const isOpen = uiState.windows.some((w) => w.id === windowId)}
            <button
              class="transition-colors p-0.5 rounded"
              class:text-[var(--accent-color)]={isOpen}
              class:text-[var(--text-secondary)]={!isOpen}
              class:hover:text-[var(--accent-color)]={!isOpen}
              title={isOpen ? "Close Channel" : "Open Channel"}
              onclick={(e) => {
                e.stopPropagation();
                openChannel();
              }}
            >
              {@html icons.monitor}
            </button>
          {/if}
        </div>
      {/if}
    </div>
  {/if}

  <button
    class="absolute bottom-2 right-2 text-[var(--text-secondary)] hover:text-[var(--accent-color)] transition-colors p-1"
    class:text-[var(--accent-color)]={isFavorite}
    onclick={(e) => {
      e.stopPropagation();
      toggleFavorite();
    }}
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
  .shimmer {
    animation: shimmer 2s infinite linear;
    background: linear-gradient(
      to right,
      var(--bg-tertiary) 0%,
      var(--bg-secondary) 50%,
      var(--bg-tertiary) 100%
    );
    background-size: 200% 100%;
  }
  @keyframes shimmer {
    0% {
      background-position: -200% 0;
    }
    100% {
      background-position: 200% 0;
    }
  }
</style>
