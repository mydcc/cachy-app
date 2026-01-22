<!--
  Copyright (C) 2026 MYDCT
-->

<script lang="ts">
  import { stopPropagation } from "svelte/legacy";

  import { untrack } from "svelte";
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

  $effect(() => {
    return () => {
      if (currentSubscription) {
        const [oldSym, oldTf] = currentSubscription.split(":");
        marketWatcher.unregister(oldSym, `kline_${oldTf}`);
        marketWatcher.unregister(oldSym, "price");
      }
    };
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
      if (import.meta.env.DEV) {
        console.error("[Technicals] Calculation error:", e);
      }
      error = "Calculation failed";
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
        if (import.meta.env.DEV) {
          console.error("Technicals fetch error:", e);
        }
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

  function translateAction(action: string | undefined): string {
    if (!action) return "-";
    const key = action.toLowerCase().replace(/\s+/g, "");
    const translation = $_(`settings.technicals.${key}`);
    // If translation key is not found, it returns the key string in some svelte-i18n configs
    // or undefined. We want the original action if not found.
    return translation && !translation.includes("settings.technicals")
      ? translation
      : action;
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
    if (!val || !val.toDecimalPlaces) return "-";
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
    class="technicals-panel p-3 flex flex-col gap-2 w-full transition-all relative"
    class:md:w-72={!settingsState.showIndicatorParams}
    class:md:w-[22rem]={settingsState.showIndicatorParams}
  >
    <!-- Top Header -->
    <div
      class="flex justify-between items-center pb-2 timeframe-selector-container relative border-b border-[var(--border-color)] mb-2"
    >
      <div class="flex items-center gap-2">
        <!-- Title Button (Opens Settings) -->
        <button
          type="button"
          class="text-sm font-bold text-[var(--text-primary)] hover:text-[var(--accent-color)] transition-colors border-none outline-none bg-transparent cursor-pointer p-0"
          onclick={() => uiState.openSettings("indicators")}
        >
          {typeof $_ === "function"
            ? $_("settings.technicals.title")
            : "Technicals"}
        </button>

        <!-- Timeframe Badge with Hover Dropdown -->
        <div
          class="relative timeframe-selector-container"
          role="group"
          onmouseenter={handleDropdownEnter}
          onmouseleave={handleDropdownLeave}
        >
          <button
            type="button"
            class="text-[10px] bg-[var(--bg-tertiary)] px-1.5 py-0.5 rounded text-[var(--text-primary)] cursor-pointer hover:bg-[var(--accent-color)] border-none outline-none font-mono flex items-center justify-center"
          >
            {timeframe}
          </button>

          <!-- Dropdown -->
          {#if showTimeframePopup}
            <div
              class="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded shadow-xl z-50 p-2 w-48 flex flex-col gap-2"
            >
              <div class="grid grid-cols-3 gap-1">
                {#each ["5m", "15m", "30m", "1h", "4h", "1d"] as tf}
                  <button
                    class="py-1 text-xs border border-[var(--border-color)] hover:bg-[var(--accent-color)] rounded text-[var(--text-primary)]"
                    onclick={() => setTimeframe(tf)}>{tf}</button
                  >
                {/each}
              </div>
              <div
                class="flex gap-1 border-t border-[var(--border-color)] pt-2"
              >
                <input
                  bind:value={customTimeframeInput}
                  placeholder="e.g. 3m, 1W"
                  class="w-full text-xs p-1 rounded border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-primary)] outline-none focus:border-[var(--accent-color)]"
                  onkeydown={(e) =>
                    e.key === "Enter" && handleCustomTimeframeSubmit()}
                />
                <button
                  class="px-2 bg-[var(--bg-tertiary)] text-xs rounded hover:bg-[var(--accent-color)] text-[var(--text-primary)]"
                  onclick={handleCustomTimeframeSubmit}>OK</button
                >
              </div>
            </div>
          {/if}
        </div>
      </div>

      <!-- Status Dot -->
      {#if isStale || loading}
        <div
          class="animate-pulse w-2 h-2 bg-[var(--accent-color)] rounded-full"
        ></div>
      {/if}
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
        <div class="flex flex-col gap-4">
          <!-- DASHBOARD SECTION (Minimalist List) -->
          <div class="flex flex-col gap-1">
            <!-- Summary Action -->
            {#if settingsState.showTechnicalsSummary}
              <div
                class="flex justify-between items-center text-xs py-1 border-b border-[var(--border-color)] hover:bg-[var(--bg-tertiary)] px-1 rounded transition-colors group"
              >
                <span
                  class="text-[var(--text-secondary)] uppercase font-medium group-hover:text-[var(--text-primary)] transition-colors"
                  >{typeof $_ === "function"
                    ? $_("settings.technicals.summaryAction")
                    : "Summary"}</span
                >
                <span class="font-bold {getActionColor(data.summary.action)}"
                  >{translateAction(data.summary.action)}</span
                >
              </div>
            {/if}

            <!-- Market Confluence -->
            {#if settingsState.showTechnicalsConfluence && data.confluence}
              <div
                class="flex justify-between items-center text-xs py-1 border-b border-[var(--border-color)] hover:bg-[var(--bg-tertiary)] px-1 rounded transition-colors group"
              >
                <span
                  class="text-[var(--text-secondary)] uppercase font-medium group-hover:text-[var(--text-primary)] transition-colors"
                  >{typeof $_ === "function"
                    ? $_("settings.technicals.marketConfluence")
                    : "Confluence"}</span
                >
                <div
                  class="flex items-center gap-2"
                  title={data.confluence.contributing.join("\n")}
                >
                  <span
                    class="font-bold {getActionColor(data.confluence.level)}"
                    >{Math.round(data.confluence.score)}%</span
                  >
                  <span
                    class="text-[10px] font-bold {getActionColor(
                      data.confluence.level,
                    )}">{translateAction(data.confluence.level)}</span
                  >
                </div>
              </div>
            {/if}

            <!-- Volatility -->
            {#if settingsState.showTechnicalsVolatility && data.volatility}
              <div
                class="flex justify-between items-center text-xs py-1 border-b border-[var(--border-color)] hover:bg-[var(--bg-tertiary)] px-1 rounded transition-colors group"
              >
                <span
                  class="text-[var(--text-secondary)] uppercase font-medium group-hover:text-[var(--text-primary)] transition-colors"
                  >ATR</span
                >
                <span class="font-mono text-[var(--text-primary)]"
                  >{formatVal(data.volatility.atr)}</span
                >
              </div>
              <div
                class="flex justify-between items-center text-xs py-1 border-b border-[var(--border-color)] hover:bg-[var(--bg-tertiary)] px-1 rounded transition-colors group"
              >
                <span
                  class="text-[var(--text-secondary)] uppercase font-medium group-hover:text-[var(--text-primary)] transition-colors"
                  >BB Width</span
                >
                <span class="font-mono text-[var(--text-primary)]"
                  >{formatVal(
                    data.volatility.bb.upper
                      .minus(data.volatility.bb.lower)
                      .div(data.volatility.bb.middle)
                      .times(100),
                    2,
                  )}%</span
                >
              </div>
            {/if}
          </div>

          <!-- Oscillators -->
          {#if settingsState.showTechnicalsOscillators}
            <div class="flex flex-col gap-1">
              <div
                class="text-[10px] uppercase text-[var(--text-secondary)] px-1"
              >
                {$_("settings.technicals.oscillatorsTitle") || "Oscillators"}
              </div>
              {#each data.oscillators as osc}
                <div
                  class="grid grid-cols-[1fr_auto_auto] gap-x-2 text-xs py-1 border-b border-[var(--border-color)] last:border-0 hover:bg-[var(--bg-tertiary)] px-1 rounded"
                >
                  <span class="truncate" title={osc.params}>{osc.name}</span>
                  <span class="font-mono text-right"
                    >{formatVal(osc.value)}</span
                  >
                  <span
                    class="font-bold text-right {getActionColor(osc.action)}"
                    >{osc.action}</span
                  >
                </div>
              {/each}
            </div>
          {/if}

          <!-- Moving Averages -->
          {#if settingsState.showTechnicalsMAs}
            <div class="flex flex-col gap-1">
              <div
                class="text-[10px] uppercase text-[var(--text-secondary)] px-1"
              >
                {$_("settings.technicals.movingAveragesTitle") ||
                  "Moving Averages"}
              </div>
              {#each data.movingAverages as ma}
                <div
                  class="flex justify-between text-xs py-1 border-b border-[var(--border-color)] last:border-0 hover:bg-[var(--bg-tertiary)] px-1 rounded"
                >
                  <span>{ma.name} ({ma.params})</span>
                  <div class="flex gap-2">
                    <span class="font-mono">{formatVal(ma.value)}</span>
                    <span class="font-bold {getActionColor(ma.action)}"
                      >{ma.action}</span
                    >
                  </div>
                </div>
              {/each}
            </div>
          {/if}

          <!-- Pivot Points -->
          {#if settingsState.showTechnicalsPivots && data.pivots}
            <div class="flex flex-col gap-1">
              <div
                class="text-[10px] uppercase text-[var(--text-secondary)] px-1"
              >
                {$_("settings.technicals.pivotsTitle") || "Pivot Points"}
              </div>
              <div class="grid grid-cols-1 gap-y-0.5">
                {#each [{ label: "R3", val: data.pivots.classic.r3, color: "text-[var(--danger-color)]" }, { label: "R2", val: data.pivots.classic.r2, color: "text-[var(--danger-color)]" }, { label: "R1", val: data.pivots.classic.r1, color: "text-[var(--danger-color)]" }, { label: "P", val: data.pivots.classic.p, color: "text-[var(--text-primary)]" }, { label: "S1", val: data.pivots.classic.s1, color: "text-[var(--success-color)]" }, { label: "S2", val: data.pivots.classic.s2, color: "text-[var(--success-color)]" }, { label: "S3", val: data.pivots.classic.s3, color: "text-[var(--success-color)]" }] as pivot}
                  <div
                    class="flex justify-between text-xs py-0.5 px-1 border-b border-[var(--border-color)] last:border-0 hover:bg-[var(--bg-tertiary)] rounded transition-colors"
                  >
                    <span class="font-bold {pivot.color}">{pivot.label}</span>
                    <span class="font-mono">{formatVal(pivot.val)}</span>
                  </div>
                {/each}
              </div>
            </div>
          {/if}

          <!-- Advanced / Pro -->
          {#if settingsState.showTechnicalsAdvanced && data.advanced}
            <div class="flex flex-col gap-1">
              <div
                class="text-[10px] uppercase text-[var(--text-secondary)] px-1"
              >
                {$_("settings.technicals.advancedTitle") || "Advanced"}
              </div>

              <!-- VWAP -->
              {#if data.advanced.vwap}
                <div
                  class="flex justify-between text-xs py-1 px-1 border-b border-[var(--border-color)]"
                >
                  <span>VWAP</span>
                  <span class="font-mono">{formatVal(data.advanced.vwap)}</span>
                </div>
              {/if}

              <!-- MFI -->
              {#if data.advanced.mfi}
                <div
                  class="flex justify-between text-xs py-1 px-1 border-b border(--border-color)"
                >
                  <span>MFI</span>
                  <div class="flex gap-2">
                    <span class="font-mono"
                      >{formatVal(data.advanced.mfi.value)}</span
                    >
                    <span
                      class="font-bold {getActionColor(
                        data.advanced.mfi.action,
                      )}">{data.advanced.mfi.action}</span
                    >
                  </div>
                </div>
              {/if}

              <!-- SuperTrend (New) -->
              {#if data.advanced.superTrend}
                <div
                  class="flex justify-between text-xs py-1 px-1 border-b border-[var(--border-color)]"
                >
                  <span>SuperTrend</span>
                  <div class="flex gap-2">
                    <span class="font-mono"
                      >{formatVal(data.advanced.superTrend.value)}</span
                    >
                    <span
                      class="font-bold {data.advanced.superTrend.trend ===
                      'bull'
                        ? 'text-[var(--success-color)]'
                        : 'text-[var(--danger-color)]'}"
                      >{data.advanced.superTrend.trend.toUpperCase()}</span
                    >
                  </div>
                </div>
              {/if}

              <!-- ATR Trailing Stop (New) -->
              {#if data.advanced.atrTrailingStop}
                <div
                  class="flex flex-col text-xs py-1 px-1 border-b border-[var(--border-color)]"
                >
                  <div class="flex justify-between">
                    <span>ATR Stop (L)</span>
                    <span class="font-mono text-[var(--danger-color)]"
                      >{formatVal(data.advanced.atrTrailingStop.sell)}</span
                    >
                  </div>
                  <div class="flex justify-between">
                    <span>ATR Stop (S)</span>
                    <span class="font-mono text-[var(--success-color)]"
                      >{formatVal(data.advanced.atrTrailingStop.buy)}</span
                    >
                  </div>
                </div>
              {/if}

              <!-- OBV (New) -->
              {#if data.advanced.obv}
                <div
                  class="flex justify-between text-xs py-1 px-1 border-b border-[var(--border-color)]"
                >
                  <span>OBV</span>
                  <span class="font-mono"
                    >{formatVal(data.advanced.obv, 0)}</span
                  >
                </div>
              {/if}

              <!-- Ichimoku (Restyled) -->
              {#if data.advanced.ichimoku}
                <div
                  class="flex justify-between text-xs py-1 px-1 border-b border-[var(--border-color)]"
                >
                  <span>Ichimoku</span>
                  <span
                    class="font-bold {getActionColor(
                      data.advanced.ichimoku.action,
                    )}">{data.advanced.ichimoku.action}</span
                  >
                </div>
              {/if}
            </div>
          {/if}

          <!-- SIGNALS SECTION (Restyled) -->
          {#if settingsState.showTechnicalsSignals && data.divergences && data.divergences.length > 0}
            <div
              class="flex flex-col gap-1 border-t border-[var(--border-color)] pt-2"
            >
              <div
                class="text-[10px] uppercase text-[var(--text-secondary)] px-1"
              >
                Signals (Divergences)
              </div>
              {#each data.divergences as div}
                <div
                  class="flex justify-between text-xs py-1 px-1 border-b border-[var(--border-color)] last:border-0 hover:bg-[var(--bg-tertiary)] rounded"
                >
                  <span>{div.indicator}</span>
                  <span
                    class="font-bold {div.side === 'Bullish'
                      ? 'text-[var(--success-color)]'
                      : 'text-[var(--danger-color)]'}"
                  >
                    {div.side}
                    {div.type}
                  </span>
                </div>
              {/each}
            </div>
          {/if}
        </div>
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
