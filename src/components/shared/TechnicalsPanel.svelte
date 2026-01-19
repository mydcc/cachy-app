<!--
  Copyright (C) 2026 MYDCT
-->

<script lang="ts">
  import { stopPropagation } from "svelte/legacy";

  import { onDestroy, untrack } from "svelte";
  import { tradeState } from "../../stores/trade.svelte";
  import { settingsState } from "../../stores/settings.svelte";
  import { indicatorState } from "../../stores/indicator.svelte";
  import { uiState } from "../../stores/ui.svelte";
  import { marketState } from "../../stores/market.svelte";
  import { marketWatcher } from "../../services/marketWatcher";
  import { apiService } from "../../services/apiService";
  import { technicalsService } from "../../services/technicalsService";
  import type { Kline, TechnicalsData } from "../../services/technicalsTypes";
  import {
    normalizeTimeframeInput,
    parseTimestamp,
    getIntervalMs,
  } from "../../utils/utils";
  import { Decimal } from "decimal.js";
  import { _ } from "../../locales/i18n";

  interface Props {
    isVisible?: boolean;
  }

  let { isVisible = false }: Props = $props();

  let klinesHistory: Kline[] = $state([]);
  let data: TechnicalsData | null = $state(null);
  let loading = $state(false);
  let error: string | null = $state(null);
  let showTimeframePopup = $state(false);
  let customTimeframeInput = $state("");
  let currentSubscription: string | null = $state(null);
  let hoverTimeout: number | null = null;
  let isStale = $state(false);
  let lastCalculationTime = 0;
  const CALCULATION_THROTTLE_MS = 1000;
  let calculationTimeout: any = null;

  // Tabs
  type Tab = "Dashboard" | "Oscillators" | "Trend" | "Signals";
  let activeTab: Tab = $state("Dashboard");

  onDestroy(() => {
    if (currentSubscription) {
      const [oldSym, oldTf] = currentSubscription.split(":");
      marketWatcher.unregister(oldSym, `kline_${oldTf}`);
      marketWatcher.unregister(oldSym, "price");
    }
  });

  function handleRealTimeUpdate(newKline: any) {
    if (!klinesHistory || klinesHistory.length === 0) return;
    if (!newKline) return;

    const rawTime = parseTimestamp(newKline.time);
    const close = newKline.close ? new Decimal(newKline.close) : new Decimal(0);

    if (rawTime <= 0 || close.lte(0)) return;

    const intervalMs = getIntervalMs(timeframe);
    const alignedTime = Math.floor(rawTime / intervalMs) * intervalMs;

    const lastIdx = klinesHistory.length - 1;
    const lastHistoryCandle = klinesHistory[lastIdx];
    const lastTime = lastHistoryCandle.time || 0;

    const newCandleObj: Kline = {
      open: newKline.open ? new Decimal(newKline.open) : new Decimal(0),
      high: newKline.high ? new Decimal(newKline.high) : new Decimal(0),
      low: newKline.low ? new Decimal(newKline.low) : new Decimal(0),
      close: close,
      volume: newKline.volume ? new Decimal(newKline.volume) : new Decimal(0),
      time: alignedTime,
    };

    if (alignedTime > lastTime && lastTime > 0) {
      klinesHistory = [...klinesHistory, newCandleObj];
      if (
        klinesHistory.length >
        (indicatorSettings?.historyLimit || 1000) + 50
      ) {
        klinesHistory.shift();
      }
    } else if (alignedTime === lastTime) {
      const newHistory = [...klinesHistory];
      newHistory[lastIdx] = newCandleObj;
      klinesHistory = newHistory;
    }
  }

  async function updateTechnicals() {
    if (!klinesHistory.length) return;
    try {
      const newData = await technicalsService.calculateTechnicals(
        klinesHistory,
        indicatorSettings,
      );
      data = newData;
      // Push to global store for AI visibility
      if (symbol) {
        marketState.updateSymbol(symbol, { technicals: newData });
      }
    } catch (e) {
      console.error("[Technicals] Calculation error:", e);
    }
  }

  async function fetchData(silent = false) {
    if (!symbol || symbol.length < 3) return;
    if (!silent) loading = true;
    error = null;

    try {
      const limit = indicatorSettings?.historyLimit || 750;
      const klines = await apiService.fetchBitunixKlines(
        symbol,
        timeframe,
        limit,
      );

      if (`${symbol}:${timeframe}` === currentSubscription) {
        klinesHistory = klines;
        untrack(() => updateTechnicals());
      }
    } catch (e: any) {
      if (e.message !== "apiErrors.symbolNotFound") {
        console.error("Technicals fetch error:", e);
      }
      error = e.message;
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
    return $_(`settings.technicals.${key}`) || action;
  }

  function getActionColor(action: string) {
    const a = action.toLowerCase();
    if (a.includes("strong buy")) return "text-[#00ff88]"; // Brighter green
    if (a.includes("strong sell")) return "text-[#ff0044]"; // Brighter red
    if (a.includes("buy")) return "text-[var(--success-color)]";
    if (a.includes("sell")) return "text-[var(--danger-color)]";
    return "text-[var(--text-secondary)]";
  }

  function formatVal(val: Decimal | undefined, precOverride?: number) {
    if (!val) return "-";
    const prec = precOverride ?? indicatorSettings?.precision ?? 4;
    return val.toDecimalPlaces(prec).toString();
  }

  // ... (Dropdown handlers same as before) ...
  function toggleTimeframePopup() {
    showTimeframePopup = !showTimeframePopup;
  }
  function handleDropdownEnter() {
    if (hoverTimeout) clearTimeout(hoverTimeout);
    showTimeframePopup = true;
  }
  function setTimeframe(tf: string) {
    tradeState.update((s) => ({ ...s, analysisTimeframe: tf }));
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

  // Reactivity
  let symbol = $derived(tradeState.symbol);
  let timeframe = $derived(tradeState.analysisTimeframe || "1h");
  let showPanel = $derived(settingsState.showTechnicals && isVisible);
  let indicatorSettings = $derived(indicatorState);
  let wsData = $derived(symbol ? marketState.data[symbol] : null);
  let currentKline = $derived(wsData?.klines ? wsData.klines[timeframe] : null);

  $effect(() => {
    if (showPanel && symbol && timeframe) {
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
      // Cleanup if hidden
      const [oldSym, oldTf] = currentSubscription.split(":");
      marketWatcher.unregister(oldSym, `kline_${oldTf}`);
      marketWatcher.unregister(oldSym, "price");
      currentSubscription = null;
      isStale = false;
    }
  });

  $effect(() => {
    if (showPanel && klinesHistory.length > 0) {
      const _settings = indicatorSettings;
      untrack(() => {
        const now = Date.now();
        if (now - lastCalculationTime >= CALCULATION_THROTTLE_MS) {
          updateTechnicals();
          lastCalculationTime = now;
        } else {
          if (calculationTimeout) clearTimeout(calculationTimeout);
          calculationTimeout = setTimeout(
            () => {
              updateTechnicals();
              lastCalculationTime = Date.now();
            },
            CALCULATION_THROTTLE_MS - (now - lastCalculationTime),
          );
        }
      });
    }
  });

  $effect(() => {
    const _trigger = currentKline;
    untrack(() => {
      if (showPanel && currentKline && klinesHistory.length > 0 && !isStale) {
        handleRealTimeUpdate(currentKline);
      }
    });
  });
</script>

<svelte:window onclick={handleClickOutside} />

{#if showPanel}
  <div
    class="technicals-panel p-3 flex flex-col gap-2 w-full transition-all relative overflow-hidden"
    class:md:w-72={!settingsState.showIndicatorParams}
    class:md:w-[22rem]={settingsState.showIndicatorParams}
  >
    <!-- Top Header -->
    <div
      class="flex justify-between items-center pb-2 timeframe-selector-container relative border-b border-[var(--border-color)] mb-2"
    >
      <div class="flex items-center gap-2">
        <h3 class="font-bold text-[var(--text-primary)]">Tech Analysis</h3>
        <span
          class="text-xs bg-[var(--bg-tertiary)] px-1.5 py-0.5 rounded text-[var(--text-primary)] cursor-pointer hover:bg-[var(--accent-color)]"
          onclick={toggleTimeframePopup}
        >
          {timeframe}
        </span>
      </div>
      <!-- Timeframe Popup Code (Simplified/Collapsed) -->
      {#if showTimeframePopup}
        <div
          class="absolute top-full left-0 mt-1 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded shadow-xl z-50 p-2 w-48 flex flex-col gap-2"
        >
          <div class="grid grid-cols-4 gap-1">
            {#each ["1m", "5m", "15m", "30m", "1h", "4h", "12h", "1d"] as tf}
              <button
                class="py-1 text-xs border border-[var(--border-color)] hover:bg-[var(--accent-color)] rounded"
                onclick={() => setTimeframe(tf)}>{tf}</button
              >
            {/each}
          </div>
        </div>
      {/if}

      <!-- Status Dot -->
      {#if isStale || loading}
        <div
          class="animate-pulse w-2 h-2 bg-[var(--accent-color)] rounded-full"
        ></div>
      {/if}
    </div>

    <!-- Tabs -->
    <div class="flex gap-1 mb-2 bg-[var(--bg-tertiary)] p-1 rounded">
      {#each ["Dashboard", "Oscillators", "Trend", "Signals"] as tab}
        <button
          class="flex-1 text-[10px] uppercase font-bold py-1 rounded transition-colors {activeTab ===
          tab
            ? 'bg-[var(--bg-secondary)] text-[var(--accent-color)] shadow-sm'
            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}"
          onclick={() => (activeTab = tab as Tab)}
        >
          {tab}
        </button>
      {/each}
    </div>

    {#if loading && !data}
      <div class="flex justify-center py-8">
        <div
          class="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--accent-color)]"
        ></div>
      </div>
    {:else if error}
      <div class="text-[var(--danger-color)] text-center text-sm">{error}</div>
    {:else if data}
      <div
        class="flex-1 overflow-y-auto pr-1 custom-scrollbar"
        style="max-height: 500px;"
      >
        <!-- DASHBOARD TAB -->
        {#if activeTab === "Dashboard"}
          <div class="flex flex-col gap-4">
            <!-- Confluence Meter -->
            <div class="bg-[var(--bg-tertiary)] p-3 rounded text-center">
              <div
                class="text-[10px] uppercase text-[var(--text-secondary)] mb-1"
              >
                Market Confluence
              </div>
              {#if data.confluence}
                <div
                  class="text-xl font-black {getActionColor(
                    data.confluence.level,
                  )} drop-shadow-sm"
                >
                  {Math.round(data.confluence.score)}%
                </div>
                <div
                  class="text-xs font-bold {getActionColor(
                    data.confluence.level,
                  )}"
                >
                  {data.confluence.level.toUpperCase()}
                </div>
              {:else}
                <div class="text-sm text-[var(--text-secondary)]">
                  Calculating...
                </div>
              {/if}
            </div>

            <!-- Summary Action -->
            <div
              class="flex justify-between items-center bg-[var(--bg-tertiary)] p-2 rounded"
            >
              <span class="text-xs text-[var(--text-secondary)]"
                >Summary Action</span
              >
              <span class="font-bold {getActionColor(data.summary.action)}"
                >{data.summary.action}</span
              >
            </div>

            <!-- Volatility -->
            {#if data.volatility}
              <div
                class="flex flex-col gap-1 bg-[var(--bg-tertiary)] p-2 rounded"
              >
                <div
                  class="text-[10px] uppercase text-[var(--text-secondary)] mb-1"
                >
                  Volatility
                </div>
                <div class="flex justify-between text-xs">
                  <span>ATR</span>
                  <span class="font-mono">{formatVal(data.volatility.atr)}</span
                  >
                </div>
                <div class="flex justify-between text-xs">
                  <span>BB Width</span>
                  <span class="font-mono"
                    >{formatVal(
                      data.volatility.bb.upper
                        .minus(data.volatility.bb.lower)
                        .div(data.volatility.bb.middle)
                        .times(100),
                      2,
                    )}%</span
                  >
                </div>
              </div>
            {/if}
          </div>
        {/if}

        <!-- OSCILLATORS TAB -->
        {#if activeTab === "Oscillators"}
          <div class="flex flex-col gap-1">
            <div
              class="grid grid-cols-[1fr_auto_auto] gap-x-2 text-[10px] text-[var(--text-secondary)] uppercase mb-1 px-1"
            >
              <span>Indicator</span>
              <span class="text-right">Value</span>
              <span class="text-right">Signal</span>
            </div>
            {#each data.oscillators as osc}
              <div
                class="grid grid-cols-[1fr_auto_auto] gap-x-2 text-xs py-1 border-b border-[var(--border-color)] last:border-0 hover:bg-[var(--bg-tertiary)] px-1 rounded"
              >
                <span class="truncate" title={osc.params}>{osc.name}</span>
                <span class="font-mono text-right">{formatVal(osc.value)}</span>
                <span class="font-bold text-right {getActionColor(osc.action)}"
                  >{osc.action}</span
                >
              </div>
            {/each}
            {#if data.advanced}
              <!-- Additional Advanced Oscillators if separate -->
              {#if data.advanced.mfi}
                <div
                  class="grid grid-cols-[1fr_auto_auto] gap-x-2 text-xs py-1 px-1 border-b border-[var(--border-color)]"
                >
                  <span>MFI</span>
                  <span class="font-mono text-right"
                    >{formatVal(data.advanced.mfi.value)}</span
                  >
                  <span
                    class="font-bold text-right {getActionColor(
                      data.advanced.mfi.action,
                    )}">{data.advanced.mfi.action}</span
                  >
                </div>
              {/if}
              {#if data.advanced.williamsR}
                <div
                  class="grid grid-cols-[1fr_auto_auto] gap-x-2 text-xs py-1 px-1 border-b border-[var(--border-color)]"
                >
                  <span>Will %R</span>
                  <span class="font-mono text-right"
                    >{formatVal(data.advanced.williamsR.value)}</span
                  >
                  <span
                    class="font-bold text-right {getActionColor(
                      data.advanced.williamsR.action,
                    )}">{data.advanced.williamsR.action}</span
                  >
                </div>
              {/if}
              {#if data.advanced.stochRsi}
                <div
                  class="grid grid-cols-[1fr_auto_auto] gap-x-2 text-xs py-1 px-1 border-b border-[var(--border-color)]"
                >
                  <span>StochRSI</span>
                  <span class="font-mono text-right"
                    >{formatVal(data.advanced.stochRsi.k)}</span
                  >
                  <span
                    class="font-bold text-right {getActionColor(
                      data.advanced.stochRsi.action,
                    )}">{data.advanced.stochRsi.action}</span
                  >
                </div>
              {/if}
            {/if}
          </div>
        {/if}

        <!-- TREND TAB -->
        {#if activeTab === "Trend"}
          <div class="flex flex-col gap-2">
            <!-- MAs -->
            <div class="bg-[var(--bg-tertiary)] p-2 rounded">
              <div
                class="text-[10px] uppercase text-[var(--text-secondary)] mb-1"
              >
                Moving Averages
              </div>
              {#each data.movingAverages as ma}
                <div class="flex justify-between text-xs py-0.5">
                  <span>{ma.name} ({ma.params})</span>
                  <div class="flex gap-2">
                    <span class="font-mono">{formatVal(ma.value)}</span>
                    <span
                      class="font-bold {getActionColor(
                        ma.action,
                      )} w-8 text-right">{ma.action}</span
                    >
                  </div>
                </div>
              {/each}
            </div>

            <!-- Ichimoku -->
            {#if data.advanced?.ichimoku}
              <div class="bg-[var(--bg-tertiary)] p-2 rounded">
                <div class="flex justify-between items-center mb-1">
                  <div
                    class="text-[10px] uppercase text-[var(--text-secondary)]"
                  >
                    Ichimoku Cloud
                  </div>
                  <span
                    class="text-xs font-bold {getActionColor(
                      data.advanced.ichimoku.action,
                    )}">{data.advanced.ichimoku.action}</span
                  >
                </div>
                <div class="grid grid-cols-2 gap-1 text-xs">
                  <div class="flex justify-between">
                    <span>Conv</span>
                    <span class="font-mono"
                      >{formatVal(data.advanced.ichimoku.conversion)}</span
                    >
                  </div>
                  <div class="flex justify-between">
                    <span>Base</span>
                    <span class="font-mono"
                      >{formatVal(data.advanced.ichimoku.base)}</span
                    >
                  </div>
                  <div class="flex justify-between">
                    <span>SpanA</span>
                    <span class="font-mono"
                      >{formatVal(data.advanced.ichimoku.spanA)}</span
                    >
                  </div>
                  <div class="flex justify-between">
                    <span>SpanB</span>
                    <span class="font-mono"
                      >{formatVal(data.advanced.ichimoku.spanB)}</span
                    >
                  </div>
                </div>
              </div>
            {/if}

            <!-- Choppiness -->
            {#if data.advanced?.choppiness}
              <div
                class="flex justify-between bg-[var(--bg-tertiary)] p-2 rounded text-xs items-center"
              >
                <span>Choppiness Index</span>
                <div class="flex flex-col items-end">
                  <span class="font-mono"
                    >{formatVal(data.advanced.choppiness.value, 2)}</span
                  >
                  <span
                    class="text-[10px] font-bold text-[var(--text-secondary)] uppercase"
                    >{data.advanced.choppiness.state}</span
                  >
                </div>
              </div>
            {/if}

            <!-- VWAP -->
            {#if data.advanced?.vwap}
              <div
                class="flex justify-between bg-[var(--bg-tertiary)] p-2 rounded text-xs items-center"
              >
                <span>VWAP</span>
                <span class="font-mono">{formatVal(data.advanced.vwap)}</span>
              </div>
            {/if}
          </div>
        {/if}

        <!-- SIGNALS TAB -->
        {#if activeTab === "Signals"}
          <div class="flex flex-col gap-2">
            <!-- Divergences -->
            <div
              class="text-[10px] uppercase text-[var(--text-secondary)] mb-1"
            >
              Divergences (Recent)
            </div>
            {#if data.divergences && data.divergences.length > 0}
              {#each data.divergences as div}
                <div
                  class="bg-[var(--bg-tertiary)] p-2 rounded border-l-2 {div.side ===
                  'Bullish'
                    ? 'border-[var(--success-color)]'
                    : 'border-[var(--danger-color)]'}"
                >
                  <div class="flex justify-between text-xs font-bold mb-1">
                    <span>{div.indicator}</span>
                    <span
                      class={div.side === "Bullish"
                        ? "text-[var(--success-color)]"
                        : "text-[var(--danger-color)]"}
                      >{div.side} {div.type}</span
                    >
                  </div>
                  <div
                    class="flex justify-between text-[10px] text-[var(--text-secondary)]"
                  >
                    <span
                      >Price: {formatVal(div.priceStart)} -> {formatVal(
                        div.priceEnd,
                      )}</span
                    >
                  </div>
                </div>
              {/each}
            {:else}
              <div
                class="text-xs text-[var(--text-secondary)] italic text-center py-4"
              >
                No recent divergences detected.
              </div>
            {/if}

            <!-- Confluence Reasons -->
            {#if data.confluence && data.confluence.contributing.length > 0}
              <div
                class="mt-4 text-[10px] uppercase text-[var(--text-secondary)] mb-1"
              >
                Confluence Factors
              </div>
              <ul class="text-xs list-disc pl-4 text-[var(--text-secondary)]">
                {#each data.confluence.contributing as reason}
                  <li>{reason}</li>
                {/each}
              </ul>
            {/if}
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
  .custom-scrollbar::-webkit-scrollbar {
    width: 4px;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: var(--border-color);
    border-radius: 2px;
  }
  .custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }
</style>
