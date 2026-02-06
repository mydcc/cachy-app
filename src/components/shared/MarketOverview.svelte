<!--
  Copyright (C) 2026 MYDCT
  Market Overview Tile
  Displays real-time price, 24h stats, and key technicals (RSI).
-->
<script lang="ts">
  import { fade } from "svelte/transition";
  import { untrack, onMount } from "svelte";
  import { uiState } from "../../stores/ui.svelte";
  import { tradeState } from "../../stores/trade.svelte";
  import { settingsState } from "../../stores/settings.svelte";
  import { indicatorState } from "../../stores/indicator.svelte";
  import { favoritesState } from "../../stores/favorites.svelte";
  import { marketState } from "../../stores/market.svelte";
  import { marketWatcher } from "../../services/marketWatcher";
  import { trackInteraction } from "../../services/trackingService";
  import { activeTechnicalsManager } from "../../services/activeTechnicalsManager.svelte";
  import { externalLinkService } from "../../services/externalLinkService";
  import { icons } from "../../lib/constants";
  import { _ } from "../../locales/i18n";
  import { formatDynamicDecimal } from "../../utils/utils";
  import { normalizeSymbol } from "../../utils/symbolUtils";
  import { getCoinglassUrl } from "../../utils/heatmapUtils";
  import { Decimal } from "decimal.js";
  import { windowManager } from "../../lib/windows/WindowManager.svelte";
  import { ChannelWindow } from "../../lib/windows/implementations/ChannelWindow.svelte";
  import Tooltip from "./Tooltip.svelte";

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

  // Performance Optimization: Lazy Load
  let element: HTMLDivElement | undefined = $state();
  let isVisible = $state(false);

  // Price Flashing & Trend Logic
  let flashingDigitIndexes: Set<number> = $state(new Set());
  let lastPriceStr: string = $state("");
  let flashTimeout: ReturnType<typeof setTimeout> | undefined;

  // Derived Real-time values
  let symbol = $derived(customSymbol || tradeState.symbol || "");
  let provider = $derived(settingsState.apiProvider);

  onMount(() => {
    if (!element) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        isVisible = true;
        observer.disconnect();
      }
    });

    observer.observe(element);
    return () => observer.disconnect();
  });

  // Market Data Access
  let wsData = $derived.by(() => {
    if (!symbol) return null;
    const key = normalizeSymbol(symbol, provider);
    return marketState.data[key] || null;
  });

  // Ticker Data (Fallback)
  let tickerData = $derived(
    marketState.data[normalizeSymbol(symbol, provider)],
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

    const prevPriceState = untrack(() => lastPriceStr);

    if (prevPriceState && s !== prevPriceState) {
      const trend = new Decimal(s).gt(new Decimal(prevPriceState))
        ? "up"
        : "down";
      const newIndexes = new Set<number>();

      let foundChange = false;
      for (let i = 0; i < s.length; i++) {
        if (foundChange || s[i] !== prevPriceState[i]) {
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

  // Technicals Data Subscription
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

  // RSI Values
  let rsiValue = $derived.by(() => {
    const tech = wsData?.technicals?.[effectiveRsiTimeframe];
    if (!tech?.oscillators) return null;
    const rsi = tech.oscillators.find((o) => o.name === "RSI");
    return rsi ? new Decimal(rsi.value) : null;
  });

  let signalValue = $derived.by(() => {
    const tech = wsData?.technicals?.[effectiveRsiTimeframe];
    if (!tech?.oscillators) return null;
    const rsi = tech.oscillators.find((o) => o.name === "RSI");
    return rsi && rsi.signal !== undefined ? new Decimal(rsi.signal) : null;
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

  // Display symbol formatting
  let displaySymbol = $derived(symbol);

  // Links
  let tvLink = $derived(`https://www.tradingview.com/chart?symbol=${provider.toUpperCase()}:${symbol.replace("USDT", "")}USDT`);
  let cgHeatmapLink = $derived(getCoinglassUrl(symbol));
  let brokerLink = $derived(
    provider === "bitunix"
      ? `https://www.bitunix.com/spot-trade/${symbol.replace("USDT", "")}_USDT`
      : `https://www.bitget.com/spot/${symbol}_USDT`,
  );

  // Link targets (Fixed: removed non-existent settings property)
  let tvTarget = "_blank";
  let brokerTarget = "_blank";

  // Countdown Logic
  let countdownText = $state("--:--:--");
  $effect(() => {
    if (!nextFundingTime) return;
    const interval = setInterval(() => {
      const now = Date.now();
      const diff = nextFundingTime - now;
      if (diff <= 0) {
        countdownText = "00:00:00";
      } else {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        countdownText = `${hours.toString().padStart(2, "0")}:${minutes
          .toString()
          .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
      }
    }, 1000);
    return () => clearInterval(interval);
  });

  // Helpers
  function formatValue(val: Decimal | null, decimals: number = 2) {
    if (!val) return "-";
    return formatDynamicDecimal(val, decimals);
  }

  function handleClick() {
    if (symbol) {
      tradeState.setSymbol(symbol);
    }
  }

  function toggleFavorite() {
    if (symbol) {
      favoritesState.toggleFavorite(symbol);
    }
  }

  function openChannel(e: Event) {
    e.stopPropagation();
    const config = CHANNEL_CONFIG[baseAsset];
    const plotId = typeof config === "string" ? config : baseAsset;
    const windowId = `channel_${plotId}`;

    if (windowManager.windows.some(w => w.id === windowId)) {
        windowManager.close(windowId);
    } else {
        // TODO: Restore correct URL generation logic. Placeholder for now.
        const url = "";
        windowManager.open(new ChannelWindow(url, `Channel: ${baseAsset}`, windowId));
    }
  }

  // Cache Warming: Pre-load history for Favorites
  $effect(() => {
    // Only fetch if visible to prevent fetch storm
    if (isFavoriteTile && symbol && isVisible) {
      untrack(() => {
        marketWatcher.ensureHistory(symbol, "1h");
      });
    }
  });

  // Base Asset
  let baseAsset = $derived(symbol.replace("USDT", ""));

  const CHANNEL_CONFIG: Record<string, string | boolean> = {
    BTC: true,
    ETH: true,
    SOL: true,
    XRP: true,
    DOGE: true,
  };

  function handleHeatmapClick(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    externalLinkService.openOrFocus(cgHeatmapLink, "_blank");
  }

  // Fixed: use items.includes instead of isFavorite()
  let isFavorite = $derived(favoritesState.items.includes(symbol));
</script>

<div
  bind:this={element}
  class="bg-[var(--bg-secondary)] rounded-lg p-3 shadow-md border border-[var(--border-color)] relative overflow-hidden transition-all duration-300 market-overview-card"
  class:border-[var(--accent-color)]={settingsState.showMarketOverviewLinks}
  class:shadow-lg={settingsState.showMarketOverviewLinks}
  onclick={handleClick}
  role="button"
  tabindex="0"
  onkeydown={(e) => e.key === "Enter" && handleClick()}
>
  {#if !wsData && !tickerData}
    <div class="flex flex-col gap-2 animate-pulse" in:fade={{ duration: 200 }}>
      <div class="h-6 w-24 bg-[var(--bg-tertiary)] rounded shimmer"></div>
      <div class="h-8 w-32 bg-[var(--bg-tertiary)] rounded shimmer"></div>
      <div class="grid grid-cols-2 gap-2 mt-2">
        <div class="h-4 w-full bg-[var(--bg-tertiary)] rounded shimmer"></div>
        <div class="h-4 w-full bg-[var(--bg-tertiary)] rounded shimmer"></div>
      </div>
    </div>
  {:else}
    <div class="flex flex-col h-full" in:fade={{ duration: 200 }}>
      <div class="flex justify-between items-start">
        <div class="flex flex-col">
          <span class="text-xs font-bold text-[var(--text-secondary)]"
            >{displaySymbol}</span
          >
          <span class="text-[10px] text-[var(--text-tertiary)]"
            >{provider.toUpperCase()}</span
          >
        </div>
        {#if onToggleTechnicals}
          <button
            class="p-1 hover:bg-[var(--bg-tertiary)] rounded transition-colors"
            class:text-[var(--accent-color)]={isTechnicalsVisible}
            onclick={(e) => {
              e.stopPropagation();
              onToggleTechnicals();
            }}
          >
            {@html icons.chart}
          </button>
        {/if}
      </div>

      <div class="flex flex-col gap-1 mt-1">
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
              >{$_("marketOverview.rsiTitle")} ({effectiveRsiTimeframe})</span
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
                    {$_("marketOverview.rsiSettings")}
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
              <span class="text-[var(--text-secondary)]"
                >{$_("marketOverview.fundingRate")}</span
              >
              <span
                class="font-medium"
                class:text-[var(--success-color)]={fundingRate.gt(0)}
                class:text-[var(--danger-color)]={fundingRate.lt(0)}
              >
                {formatValue(fundingRate.times(100), 4)}%
              </span>
            </div>
            <div class="flex flex-col text-right">
              <span class="text-[var(--text-secondary)]"
                >{$_("marketOverview.countdown")}</span
              >
              <span class="font-mono text-[var(--text-primary)]"
                >{countdownText}</span
              >
            </div>
          </div>
        {/if}
      {/if}

      {#if settingsState.showMarketOverviewLinks && symbol}
        <div
          class="flex items-center justify-between mt-3 pt-2 border-t border-[var(--border-color)]"
        >
          <div class="flex items-center gap-3">
            {#if settingsState.showTvLink}
              <a
                href={tvLink}
                class="text-[10px] uppercase font-bold text-[var(--text-secondary)] hover:text-[var(--accent-color)] transition-colors"
                title={$_("marketOverview.tooltips.tradingViewChart")}
                onclick={(e) => {
                  e.preventDefault();
                  externalLinkService.openOrFocus(tvLink, tvTarget);
                }}>{$_("marketOverview.tvShort")}</a
              >
            {/if}
            {#if settingsState.showCgHeatLink}
              <a
                href={cgHeatmapLink}
                class="text-[10px] uppercase font-bold text-[var(--text-secondary)] hover:text-[var(--danger-color)] transition-colors"
                title={$_("marketOverview.tooltips.liquidationHeatmap")}
                onclick={handleHeatmapClick}
                >{$_("marketOverview.heatmapShort")}</a
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
          </div>

          <div class="flex items-center gap-0.5">
            {#if CHANNEL_CONFIG[baseAsset] && settingsState.isPro}
              {@const config = CHANNEL_CONFIG[baseAsset]}
              {@const plotId = typeof config === "string" ? config : baseAsset}
              {@const windowId = `channel_${plotId}`}
              {@const isOpen = windowManager.windows.some(
                (w) => w.id === windowId,
              )}
              <button
                class="transition-colors p-1.5 rounded flex items-center hover:bg-[var(--bg-tertiary)]"
                class:text-[var(--accent-color)]={isOpen}
                class:text-[var(--text-secondary)]={!isOpen}
                class:hover:text-[var(--accent-color)]={!isOpen}
                title={isOpen
                  ? $_("marketOverview.tooltips.closeChannel")
                  : $_("marketOverview.tooltips.openChannel")}
                onclick={(e) => {
                  e.stopPropagation();
                  openChannel(e);
                }}>{@html icons.monitor}</button
              >
            {/if}

            <button
              class="text-[var(--text-secondary)] hover:text-[var(--accent-color)] transition-colors p-1.5 flex items-center hover:bg-[var(--bg-tertiary)] rounded"
              class:text-[var(--accent-color)]={isFavorite}
              data-track-id="btn-toggle-favorite"
              data-track-context={JSON.stringify({ symbol })}
              onclick={(e) => {
                e.stopPropagation();
                trackInteraction("btn-toggle-favorite", "click", { symbol });
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
        </div>
      {/if}
    </div>
    </div>
  {/if}
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
