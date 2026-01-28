<!--
  Copyright (C) 2026 MYDCT

  Market Overview Tile
  Displays real-time price, 24h stats, and key technicals (RSI).
  Now utilizes ActiveTechnicalsManager for unified data source.
-->

<script lang="ts">
  import { fade } from "svelte/transition";
  import { untrack } from "svelte";
  import { uiState } from "../../stores/ui.svelte";
  import { tradeState } from "../../stores/trade.svelte";
  import { settingsState } from "../../stores/settings.svelte";
  import { indicatorState } from "../../stores/indicator.svelte";
  import { favoritesState } from "../../stores/favorites.svelte";
  import { marketState } from "../../stores/market.svelte";
  import { marketWatcher } from "../../services/marketWatcher";
  import { activeTechnicalsManager } from "../../services/activeTechnicalsManager.svelte";
  import { externalLinkService } from "../../services/externalLinkService";
  import { icons } from "../../lib/constants";
  import { _ } from "../../locales/i18n";
  import { formatDynamicDecimal } from "../../utils/utils";
  import { normalizeSymbol } from "../../utils/symbolUtils";
  import { Decimal } from "decimal.js";
  import { app } from "../../services/app";
  import DepthBar from "./DepthBar.svelte";
  import Tooltip from "./Tooltip.svelte";
  import { viewport } from "../../actions/viewport";
  import { burn } from "../../actions/burn";

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

  // Price Flashing & Trend Logic
  let flashingDigitIndexes: Set<number> = $state(new Set());
  let lastPriceStr: string = $state("");
  let flashTimeout: ReturnType<typeof setTimeout> | undefined;

  // Derived Real-time values
  let symbol = $derived(customSymbol || tradeState.symbol || "");
  let provider = $derived(settingsState.apiProvider);

  // Market Data Access
  let wsData = $derived.by(() => {
    if (!symbol) return null;
    const key = normalizeSymbol(symbol, provider);
    return marketState.data[key] || null;
  });

  // Ticker Data (Fallback)
  let tickerData = $derived(
    marketState.data[normalizeSymbol(symbol, "bitunix")],
  );

  let currentPrice = $derived.by(() => {
    return (wsData?.lastPrice ??
      tickerData?.lastPrice ??
      null) as Decimal | null;
  });

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
      const trend = new Decimal(s).gt(new Decimal(lastPriceStr))
        ? "up"
        : "down";
      const newIndexes = new Set<number>();

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

    return () => {
      if (flashTimeout) clearTimeout(flashTimeout);
    };
  });

  // RSI Timeframe
  let effectiveRsiTimeframe = $derived(
    settingsState.syncRsiTimeframe
      ? tradeState.atrTimeframe || indicatorState.rsi.defaultTimeframe || "1d"
      : indicatorState.rsi.defaultTimeframe || "1d",
  );

  // Technicals Data Subscription (via ActiveTechnicalsManager)
  $effect(() => {
    if (symbol && symbol.length >= 3 && effectiveRsiTimeframe) {
      untrack(() => {
        activeTechnicalsManager.register(symbol, effectiveRsiTimeframe);
      });
      return () => {
        activeTechnicalsManager.unregister(symbol, effectiveRsiTimeframe);
      };
    }
  });

  // RSI Values from centralized Technicals
  let rsiValue = $derived.by(() => {
    if (!wsData?.technicals?.oscillators) return null;
    const rsi = wsData.technicals.oscillators.find((o) => o.name === "RSI");
    return rsi ? rsi.value : null;
  });

  let signalValue = $derived.by(() => {
    if (!wsData?.technicals?.oscillators) return null;
    const rsi = wsData.technicals.oscillators.find((o) => o.name === "RSI");
    return rsi ? rsi.signal : null; // Signal might be undefined on IndicatorResult, check type
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

  // Countdown Logic
  let countdownText = $state("--:--:--");
  let countdownInterval: ReturnType<typeof setInterval> | undefined;

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
        countdownText = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
      }
    };
    update();
    countdownInterval = setInterval(update, 1000);
  }

  $effect(() => {
    if (nextFundingTime) untrack(startCountdown);
    return () => {
      if (countdownInterval) clearInterval(countdownInterval);
    };
  });

  // Watch for symbol or provider changes (Ticker & Price)
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

  // Depth Subscription
  $effect(() => {
    if (symbol && settingsState.showMarketActivity) {
      marketWatcher.register(symbol, "depth_book5");
      return () => {
        marketWatcher.unregister(symbol, "depth_book5");
      };
    }
  });

  // Reset isInitialLoad once we have data
  $effect(() => {
    if (isInitialLoad && (wsData || tickerData)) {
      isInitialLoad = false;
    }
  });

  // Base Asset (e.g. XRP) for external links
  let displaySymbol = $derived(getDisplaySymbol(symbol));
  let baseAsset = $derived(symbol.toUpperCase().replace(/USDT(\.P|P)?$/, ""));

  function formatValue(val: Decimal | undefined | null, decimals: number = 2) {
    if (!val) return "-";
    return formatDynamicDecimal(val, decimals);
  }

  function getDisplaySymbol(rawSymbol: string | undefined): string {
    if (!rawSymbol) return symbol || "";
    let display = rawSymbol.toUpperCase();
    if (display.endsWith(".P")) display = display.slice(0, -2);
    else if (display.endsWith("USDTP")) display = display.slice(0, -1);
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
          useAtrSl: true,
          atrMode: "auto" as "auto" | "manual",
        };
        if (currentPrice) {
          newState.entryPrice = new Decimal(currentPrice).toNumber();
        }
        return newState;
      });
      app.fetchAllAnalysisData(symbol.toUpperCase());
    }
  }

  // --- External Links ---
  let tvLink = $derived.by(() => {
    const providerPrefix =
      provider.toUpperCase() === "BITGET" ? "BITGET" : "BITUNIX";
    const formattedSymbol = symbol.endsWith(".P")
      ? symbol.replace(".P", "")
      : symbol;
    return `https://www.tradingview.com/chart/?symbol=${providerPrefix}:${formattedSymbol.toUpperCase()}`;
  });
  let cgHeatmapLink = $derived(
    `https://www.coinglass.com/pro/futures/LiquidationHeatMap?coin=${baseAsset}`,
  );
  let brokerLink = $derived.by(() => {
    const s = symbol.toUpperCase();
    if (provider.toLowerCase() === "bitget") {
      const formatted = s.endsWith("USDT") ? s : s + "USDT";
      return `https://www.bitget.com/futures/usdt/${formatted}`;
    } else {
      const formatted = s.endsWith("USDT") ? s : s + "USDT";
      return `https://www.bitunix.com/contract-trade/${formatted}`;
    }
  });

  // Dynamic Window Targets (One tab per symbol/provider)
  let tvTarget = $derived(`cachy_tv_${symbol.replace(/[^a-zA-Z0-9]/g, "_")}`);
  let cgTarget = $derived(
    `cachy_cg_${baseAsset.replace(/[^a-zA-Z0-9]/g, "_")}`,
  );
  let brokerTarget = $derived(
    `cachy_broker_${provider.replace(/[^a-zA-Z0-9]/g, "_")}_${symbol.replace(/[^a-zA-Z0-9]/g, "_")}`,
  );

  // Channel Config
  const CHANNEL_CONFIG: Record<string, string | boolean> = {
    BTC: true,
    ETH: true,
    SOL: true,
    LINK: true,
    XRP: true,
  };
  function openChannel() {
    if (!symbol) return;
    const s = symbol.toUpperCase().replace(/USDT(\.P|P)?$/, "");
    const config = CHANNEL_CONFIG[s];
    if (!config) return;
    const plotId = typeof config === "string" ? config : s;
    const url = `https://space.cachy.app/index.php?plot_id=${plotId}`;
    const windowId = `channel_${plotId}`;
    uiState.toggleWindow(windowId, url, `${s} Channel`);
  }

  let isFavorite = $derived(
    symbol ? favoritesState.items.includes(symbol) : false,
  );
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
  use:viewport={symbol}
  use:burn={settingsState.burnMarketOverviewTiles &&
  settingsState.enableBurningBorders
    ? {
        color: priceChangePercent?.gte(0) ? "#00ff88" : "#ff4444",
        intensity:
          rsiValue && (rsiValue.gte(70) || rsiValue.lte(30)) ? 2.0 : 1.0,
      }
    : null}
>
  <div class="absolute top-2 right-2 flex gap-1 z-50">
    {#if settingsState.showTechnicals && !isFavoriteTile && onToggleTechnicals}
      <button
        class="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors p-1 rounded-md hover:bg-[var(--bg-tertiary)]"
        class:text-[var(--accent-color)]={isTechnicalsVisible}
        title={$_("marketOverview.tooltips.toggleTechnicals")}
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
      title={$_("marketOverview.tooltips.refreshStats")}
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
    <!-- Loading State -->
    <div class="flex flex-col gap-4 py-2 animate-pulse">
      <div class="flex justify-between items-baseline">
        <div class="h-8 bg-[var(--bg-tertiary)] rounded w-1/2 shimmer"></div>
        <div class="h-4 bg-[var(--bg-tertiary)] rounded w-1/4 shimmer"></div>
      </div>
      <div class="h-2 bg-[var(--bg-tertiary)] rounded w-full shimmer"></div>
    </div>
  {:else if !currentPrice && !tickerData}
    <div class="text-center text-[var(--danger-color)] text-sm py-2">
      {$_("apiErrors.noMarketData") || "No market data available"}
    </div>
  {:else if currentPrice === null}
    <div class="flex flex-col gap-4 py-2 animate-pulse">
      <div class="flex justify-between items-baseline">
        <div class="h-8 bg-[var(--bg-tertiary)] rounded w-1/2 shimmer"></div>
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
              class="text-[10px] uppercase font-bold text-[var(--text-secondary)] hover:text-[var(--accent-color)] transition-colors"
              title="TradingView Chart"
              onclick={(e) => {
                e.preventDefault();
                externalLinkService.openOrFocus(tvLink, tvTarget);
              }}>TV</a
            >
          {/if}
          {#if settingsState.showCgHeatLink}
            <a
              href={cgHeatmapLink}
              class="text-[10px] uppercase font-bold text-[var(--text-secondary)] hover:text-[var(--danger-color)] transition-colors"
              title={$_("marketOverview.tooltips.liquidationHeatmap")}
              onclick={(e) => {
                e.preventDefault();
                externalLinkService.openOrFocus(cgHeatmapLink, cgTarget);
              }}>CG Heat</a
            >
          {/if}
          {#if settingsState.showBrokerLink}
            <a
              href={brokerLink}
              class="text-[10px] uppercase font-bold text-[var(--text-secondary)] hover:text-[var(--success-color)] transition-colors"
              title={$_("marketOverview.tooltips.openOnProvider", {
                values: { provider: provider.toUpperCase() },
              })}
              onclick={(e) => {
                e.preventDefault();
                externalLinkService.openOrFocus(brokerLink, brokerTarget);
              }}>{provider.toUpperCase()}</a
            >
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
              title={isOpen
                ? $_("marketOverview.tooltips.closeChannel")
                : $_("marketOverview.tooltips.openChannel")}
              onclick={(e) => {
                e.stopPropagation();
                openChannel();
              }}>{@html icons.monitor}</button
            >
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
    title={isFavorite
      ? $_("marketOverview.tooltips.removeFavorite")
      : $_("marketOverview.tooltips.addFavorite")}
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
