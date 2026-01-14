<script lang="ts">
  import { onDestroy } from "svelte";
  import { tradeStore, updateTradeStore } from "../../stores/tradeStore";
  import { settingsStore } from "../../stores/settingsStore";
  import { indicatorStore } from "../../stores/indicatorStore";
  import { uiStore } from "../../stores/uiStore";
  import { marketStore } from "../../stores/marketStore";
  import { bitunixWs } from "../../services/bitunixWs";
  import { apiService } from "../../services/apiService";
  import { technicalsService } from "../../services/technicalsService";
  import type { Kline, TechnicalsData } from "../../services/technicalsTypes"; // Import strict types
  import {
    normalizeTimeframeInput,
    parseTimestamp,
    getIntervalMs,
  } from "../../utils/utils";
  import { Decimal } from "decimal.js";
  import Tooltip from "../shared/Tooltip.svelte";
  import { marketWatcher } from "../../services/marketWatcher";
  import { normalizeSymbol } from "../../utils/symbolUtils";
  import { _ } from "../../locales/i18n";

  export let isVisible: boolean = false;

  let klinesHistory: Kline[] = [];
  let data: TechnicalsData | null = null;
  let loading = false;
  let error: string | null = null;
  let showTimeframePopup = false;
  let customTimeframeInput = "";
  let currentSubscription: string | null = null;
  let hoverTimeout: number | null = null;
  let isStale = false; // Added for Seamless Swap

  // Use analysisTimeframe for Technicals
  $: symbol = $tradeStore.symbol;
  $: timeframe = $tradeStore.analysisTimeframe || "1h";
  $: showPanel = $settingsStore.showTechnicals && isVisible;
  $: indicatorSettings = $indicatorStore;

  // React to Market Store updates for real-time processing (symbol already normalized in tradeStore)
  $: wsData = symbol ? $marketStore[symbol] : null;

  $: currentKline = wsData?.klines ? wsData.klines[timeframe] : null;

  // Trigger fetch/subscribe when relevant props change
  $: if (showPanel && symbol && timeframe) {
    const subKey = `${symbol}:${timeframe}`;
    if (currentSubscription !== subKey) {
      isStale = true;

      const [oldSym, oldTf] = currentSubscription
        ? currentSubscription.split(":")
        : ["", ""];
      if (oldSym) {
        marketWatcher.unregister(oldSym, `kline_${oldTf}`);
        marketWatcher.unregister(oldSym, "price");
      }

      marketWatcher.register(symbol, `kline_${timeframe}`);
      marketWatcher.register(symbol, "price");

      fetchData().finally(() => {
        isStale = false;
      });
      currentSubscription = subKey;
    }
  } else if (!showPanel && currentSubscription) {
    const [oldSym, oldTf] = currentSubscription.split(":");
    marketWatcher.unregister(oldSym, `kline_${oldTf}`);
    marketWatcher.unregister(oldSym, "price");
    currentSubscription = null;
    isStale = false;
  }

  onDestroy(() => {
    if (currentSubscription) {
      const [oldSym, oldTf] = currentSubscription.split(":");
      marketWatcher.unregister(oldSym, `kline_${oldTf}`);
      marketWatcher.unregister(oldSym, "price");
    }
  });

  // Re-calculate when settings change (without re-fetching)
  $: if (showPanel && klinesHistory.length > 0 && indicatorSettings) {
    updateTechnicals();
  }

  // Handle Real-Time Updates - Guard with !isStale to prevent mixed data
  $: if (showPanel && currentKline && klinesHistory.length > 0 && !isStale) {
    if ($settingsStore.debugMode) {
      console.log(
        `[Technicals] Real-time kline update for ${symbol}:${timeframe}`,
        currentKline
      );
    }
    handleRealTimeUpdate(currentKline);
  } else if (
    $settingsStore.debugMode &&
    showPanel &&
    !isStale &&
    !currentKline
  ) {
    // Only log if we expect data but have none
    console.log(
      `[Technicals] Waiting for kline data in store for ${normalizeSymbol(
        symbol,
        "bitunix"
      )}:${timeframe}`
    );
  }

  // Core Logic for Updating Data and Pivots
  function handleRealTimeUpdate(newKline: any) {
    if (!klinesHistory || klinesHistory.length === 0) return;
    if (!newKline) return;

    // Strict Validation: Ensure incoming data is valid
    // Use parseTimestamp to ensure seconds/ms consistency with REST history
    const rawTime = parseTimestamp(newKline.time);
    const close = newKline.close ? new Decimal(newKline.close) : new Decimal(0);

    if (rawTime <= 0 || close.lte(0)) {
      return;
    }

    // --- ALIGNMENT FIX ---
    const intervalMs = getIntervalMs(timeframe);
    const alignedTime = Math.floor(rawTime / intervalMs) * intervalMs;

    const lastIdx = klinesHistory.length - 1;
    const lastHistoryCandle = klinesHistory[lastIdx];
    const lastTime = lastHistoryCandle.time || 0;

    // Ensure we handle Decimal objects or strings/numbers correctly for history
    const newCandleObj: Kline = {
      open: newKline.open ? new Decimal(newKline.open) : new Decimal(0),
      high: newKline.high ? new Decimal(newKline.high) : new Decimal(0),
      low: newKline.low ? new Decimal(newKline.low) : new Decimal(0),
      close: close,
      volume: newKline.volume ? new Decimal(newKline.volume) : new Decimal(0),
      time: alignedTime, // Use ALIGNED time for the object too
    };

    // Determine if newKline is the SAME candle as the last one in history, or a NEW one
    // Using strict time comparison after alignment
    if (alignedTime > lastTime && lastTime > 0) {
      // New candle started!
      klinesHistory = [...klinesHistory, newCandleObj];
      if (
        klinesHistory.length >
        (indicatorSettings?.historyLimit || 1000) + 50
      ) {
        klinesHistory.shift();
      }
    } else if (alignedTime === lastTime) {
      // It's an update to the last candle.
      const newHistory = [...klinesHistory];
      newHistory[lastIdx] = newCandleObj;
      klinesHistory = newHistory;
    }
    // If alignedTime < lastTime, it's an old update (out of order), ignore it to protect history.

    updateTechnicals();
  }

  async function updateTechnicals() {
    if (!klinesHistory.length) return;
    const startTime = Date.now();
    try {
      if ($settingsStore.debugMode) {
        console.log(
          `[Technicals] Calculating for ${symbol}:${timeframe} (${klinesHistory.length} klines)`
        );
      }
      data = await technicalsService.calculateTechnicals(
        klinesHistory,
        indicatorSettings
      );
      if ($settingsStore.debugMode) {
        console.log(
          `[Technicals] Calculation complete in ${Date.now() - startTime}ms`
        );
      }
    } catch (e) {
      console.error("[Technicals] Calculation error:", e);
    }
  }

  async function fetchData(silent = false) {
    if (!symbol) return;
    if (!silent) loading = true;
    error = null;

    try {
      const limit = indicatorSettings?.historyLimit || 750;
      const klines = await apiService.fetchBitunixKlines(
        symbol,
        timeframe,
        limit
      );

      // Before updating state, double check if we are still on the same request context
      // This prevents race conditions where you switch fast and an old request finishes last
      if (`${symbol}:${timeframe}` === currentSubscription) {
        klinesHistory = klines;
        await updateTechnicals();
      }
    } catch (e) {
      console.error("Technicals fetch error:", e);
      error = "Failed to load";
    } finally {
      loading = false;
    }
  }

  function handleDropdownLeave() {
    if (hoverTimeout) clearTimeout(hoverTimeout);
    hoverTimeout = window.setTimeout(() => {
      showTimeframePopup = false;
      hoverTimeout = null;
    }, 300);
  }

  function translateAction(action: string): string {
    const key = action.toLowerCase().replace(" ", "");
    // key will be buy, sell, strongbuy, strongsell, neutral
    return $_(`settings.technicals.${key}`) || action;
  }

  function getActionColor(action: string) {
    const a = action.toLowerCase();
    if (a.includes("buy")) return "text-[var(--success-color)]";
    if (a.includes("sell")) return "text-[var(--danger-color)]";
    return "text-[var(--text-secondary)]";
  }

  function formatVal(val: Decimal) {
    // val is now strictly a Decimal object
    const prec = indicatorSettings?.precision ?? 4;
    return val.toDecimalPlaces(prec).toString();
  }

  function toggleTimeframePopup() {
    showTimeframePopup = !showTimeframePopup;
  }

  function handleDropdownEnter() {
    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
      hoverTimeout = null;
    }
    showTimeframePopup = true;
  }

  function setTimeframe(tf: string) {
    updateTradeStore((s) => ({ ...s, analysisTimeframe: tf }));
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
    if (
      showTimeframePopup &&
      !(event.target as HTMLElement).closest(".timeframe-selector-container")
    ) {
      showTimeframePopup = false;
    }
  }

  function copyDebugData() {
    if (!klinesHistory.length) return;
    const debugInfo = {
      symbol,
      timeframe,
      totalCandles: klinesHistory.length,
      indicators: data,
    };
    navigator.clipboard
      .writeText(JSON.stringify(debugInfo, null, 2))
      .then(() => alert("Debug data copied!"))
      .catch((err) => console.error("Failed to copy", err));
  }
</script>

<svelte:window on:click={handleClickOutside} />

{#if showPanel}
  <div
    class="technicals-panel p-3 flex flex-col gap-2 w-full transition-all relative"
    class:md:w-64={!$settingsStore.showIndicatorParams}
    class:md:w-[19rem]={$settingsStore.showIndicatorParams}
  >
    <!-- Header -->
    <div
      class="flex justify-between items-center pb-2 timeframe-selector-container relative"
    >
      <div
        class="flex items-center gap-2"
        class:opacity-40={isStale && !loading}
        class:transition-opacity={true}
      >
        <button
          type="button"
          class="font-bold text-[var(--text-primary)] cursor-pointer hover:text-[var(--accent-color)] bg-transparent border-none p-0"
          on:click={() => uiStore.openSettings("indicators")}
          title="Open Technicals Settings"
        >
          Technicals
        </button>
        <span
          role="button"
          tabindex="0"
          class="text-xs bg-[var(--bg-tertiary)] px-1.5 py-0.5 rounded text-[var(--text-primary)] hover:bg-[var(--accent-color)] hover:text-[var(--btn-accent-text)] transition-colors cursor-pointer"
          on:mouseenter={handleDropdownEnter}
          on:mouseleave={handleDropdownLeave}
          on:click|stopPropagation={toggleTimeframePopup}
          on:keydown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              toggleTimeframePopup();
            }
          }}
          aria-label="Change Timeframe"
        >
          {timeframe}
        </span>
      </div>

      {#if isStale || loading}
        <div class="absolute top-0 right-10">
          <div class="animate-pulse flex space-x-1">
            <div class="h-1.5 w-1.5 bg-[var(--accent-color)] rounded-full" />
            <div
              class="h-1.5 w-1.5 bg-[var(--accent-color)] rounded-full animation-delay-200"
            />
            <div
              class="h-1.5 w-1.5 bg-[var(--accent-color)] rounded-full animation-delay-400"
            />
          </div>
        </div>
      {/if}

      <div class="relative group">
        <button
          class="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors p-1"
          on:click={copyDebugData}
          title="Copy Technicals Debug Data"
          aria-label="Copy Technicals Debug Data"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
        </button>
      </div>

      {#if showTimeframePopup}
        <div
          role="menu"
          tabindex="-1"
          class="absolute top-full left-0 mt-1 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded shadow-xl z-50 p-2 w-48 flex flex-col gap-2"
          on:mouseenter={handleDropdownEnter}
          on:mouseleave={handleDropdownLeave}
        >
          <div class="grid grid-cols-3 gap-2">
            <button
              class="py-2 border border-[var(--border-color)] hover:bg-[var(--accent-color)] hover:text-[var(--btn-accent-text)] rounded text-sm font-medium text-[var(--text-primary)]"
              on:click={() => setTimeframe("1m")}>1m</button
            >
            <button
              class="py-2 border border-[var(--border-color)] hover:bg-[var(--accent-color)] hover:text-[var(--btn-accent-text)] rounded text-sm font-medium text-[var(--text-primary)]"
              on:click={() => setTimeframe("5m")}>5m</button
            >
            <button
              class="py-2 border border-[var(--border-color)] hover:bg-[var(--accent-color)] hover:text-[var(--btn-accent-text)] rounded text-sm font-medium text-[var(--text-primary)]"
              on:click={() => setTimeframe("15m")}>15m</button
            >
          </div>
          <div class="grid grid-cols-3 gap-2">
            <button
              class="py-2 border border-[var(--border-color)] hover:bg-[var(--accent-color)] hover:text-[var(--btn-accent-text)] rounded text-sm font-medium text-[var(--text-primary)]"
              on:click={() => setTimeframe("1h")}>1h</button
            >
            <button
              class="py-2 border border-[var(--border-color)] hover:bg-[var(--accent-color)] hover:text-[var(--btn-accent-text)] rounded text-sm font-medium text-[var(--text-primary)]"
              on:click={() => setTimeframe("4h")}>4h</button
            >
            <button
              class="py-2 border border-[var(--border-color)] hover:bg-[var(--accent-color)] hover:text-[var(--btn-accent-text)] rounded text-sm font-medium text-[var(--text-primary)]"
              on:click={() => setTimeframe("1d")}>1d</button
            >
          </div>
          <div class="flex gap-1 mt-1">
            <input
              id="custom-timeframe-input"
              name="customTimeframe"
              type="text"
              class="w-full text-sm p-1.5 rounded border border-[var(--border-color)] bg-[var(--bg-primary)]"
              placeholder="e.g. 24m"
              bind:value={customTimeframeInput}
              on:keydown={(e) =>
                e.key === "Enter" && handleCustomTimeframeSubmit()}
              aria-label="Custom timeframe input"
            />
            <button
              class="px-3 bg-[var(--bg-tertiary)] hover:bg-[var(--accent-color)] hover:text-[var(--btn-accent-text)] rounded text-sm font-medium text-[var(--text-primary)]"
              on:click={handleCustomTimeframeSubmit}
              aria-label="Apply custom timeframe"
            >
              OK
            </button>
          </div>
        </div>
      {/if}

      {#if data?.summary}
        <div
          class="flex items-center gap-2 text-sm font-bold"
          class:opacity-40={isStale}
          class:transition-opacity={true}
        >
          <span class={getActionColor(data.summary.action)}
            >{translateAction(data.summary.action).toUpperCase()}</span
          >
        </div>
      {/if}
    </div>

    {#if loading && !data}
      <div class="flex justify-center py-8">
        <div
          class="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--accent-color)]"
        />
      </div>
    {:else if error}
      <div class="text-[var(--danger-color)] text-center text-sm py-4">
        {error}
      </div>
    {:else if data}
      <!-- Oscillators & MAs (Standard) -->
      <div
        class="flex flex-col gap-2 transition-opacity duration-300"
        class:opacity-40={isStale}
      >
        <h4 class="text-xs font-bold text-[var(--text-secondary)] uppercase">
          {$_("settings.technicals.oscillators")}
        </h4>
        <div class="text-xs grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-1">
          {#each data.oscillators as osc}
            <span
              class="text-[var(--text-primary)] truncate"
              title={osc.name + (osc.params ? " (" + osc.params + ")" : "")}
            >
              {osc.name}
              {#if $settingsStore.showIndicatorParams && osc.params}
                <span class="text-[var(--text-secondary)] font-normal"
                  >({osc.params})</span
                >
              {/if}
            </span>
            <span class="text-right text-[var(--text-secondary)] font-mono"
              >{formatVal(osc.value)}</span
            >
            <span class="text-right font-bold {getActionColor(osc.action)}"
              >{translateAction(osc.action)}</span
            >
          {/each}
        </div>
      </div>
      <div
        class="flex flex-col gap-2 pt-2 border-t border-[var(--border-color)] transition-opacity duration-300"
        class:opacity-40={isStale}
      >
        <h4 class="text-xs font-bold text-[var(--text-secondary)] uppercase">
          {$_("settings.technicals.movingAverages")}
        </h4>
        <div class="text-xs grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-1">
          {#each data.movingAverages as ma}
            <span
              class="text-[var(--text-primary)] truncate"
              title={ma.name + (ma.params ? " (" + ma.params + ")" : "")}
            >
              {ma.name}
              {#if $settingsStore.showIndicatorParams && ma.params}
                <span class="text-[var(--text-secondary)] font-normal"
                  >({ma.params})</span
                >
              {/if}
            </span>
            <span class="text-right text-[var(--text-secondary)] font-mono"
              >{formatVal(ma.value)}</span
            >
            <span class="text-right font-bold {getActionColor(ma.action)}"
              >{translateAction(ma.action)}</span
            >
          {/each}
        </div>
      </div>

      <!-- Pivots Section -->
      <div
        class="flex flex-col gap-2 pt-2 border-t border-[var(--border-color)] transition-opacity duration-300"
        class:opacity-40={isStale}
      >
        <h4 class="text-xs font-bold text-[var(--text-secondary)] uppercase">
          {indicatorSettings?.pivots?.type
            ? `${$_("settings.technicals.pivots")} (${
                indicatorSettings.pivots.type
              })`
            : $_("settings.technicals.pivots")}
        </h4>
        <div class="text-xs grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          {#each Object.entries(data.pivots.classic).sort((a, b) => b[1]
              .minus(a[1])
              .toNumber()) as [key, val]}
            <span class="text-[var(--text-secondary)] w-6 uppercase">{key}</span
            >
            <span class="text-right text-[var(--text-primary)] font-mono"
              >{formatVal(val)}</span
            >
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

  .animation-delay-200 {
    animation-delay: 200ms;
  }
  .animation-delay-400 {
    animation-delay: 400ms;
  }
</style>
