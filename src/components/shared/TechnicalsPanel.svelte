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
  import type { TechnicalsData } from "../../services/technicalsTypes";
  import { normalizeTimeframeInput } from "../../utils/utils";
  import { Decimal } from "decimal.js";
  import { _ } from "../../locales/i18n";
  import { activeTechnicalsManager } from "../../services/activeTechnicalsManager.svelte";

  interface Props {
    isVisible?: boolean;
  }

  let { isVisible = false }: Props = $props();

  // Local UI state
  let showTimeframePopup = $state(false);
  let customTimeframeInput = $state("");
  let hoverTimeout: number | null = null;

  // Reactivity
  let symbol = $derived(tradeState.symbol);
  let timeframe = $derived(tradeState.analysisTimeframe || "1h");
  let showPanel = $derived(settingsState.showTechnicals && isVisible);
  let indicatorSettings = $derived(indicatorState);

  // Data comes strictly from MarketState (pushed by ActiveTechnicalsManager)
  let wsData = $derived(symbol ? marketState.data[symbol] : null);
  let data: TechnicalsData | null = $derived(wsData?.technicals ?? null);

  // We can infer "loading" if we have a symbol but no data yet
  let loading = $derived(showPanel && symbol && !data);
  let error: string | null = $state(null);

  // Manage Subscription
  $effect(() => {
    if (showPanel && symbol && timeframe) {
      activeTechnicalsManager.register(symbol, timeframe);
      return () => {
        activeTechnicalsManager.unregister(symbol, timeframe);
      };
    }
  });

  function handleDropdownLeave() {
    if (hoverTimeout) clearTimeout(hoverTimeout);
    hoverTimeout = window.setTimeout(() => {
      showTimeframePopup = false;
      hoverTimeout = null;
    }, 300);
  }

  function translateAction(action: string | undefined): string {
    if (!action) return "-";
    // First try exact key
    const key = action.toLowerCase().replace(/\s+/g, "");
    const translation = $_(`settings.technicals.${key}`);

    // If not found, try generic Buy/Sell
    if (!translation || translation.includes("settings.technicals")) {
       if (action.includes("Buy")) return $_("common.buy") || action;
       if (action.includes("Sell")) return $_("common.sell") || action;
       if (action.includes("Neutral")) return $_("common.neutral") || action;
       return action;
    }
    return translation;
  }

  function translateContext(context: string): string {
      if (context === "Overbought") return $_("technicals.overbought") || "Overbought";
      if (context === "Oversold") return $_("technicals.oversold") || "Oversold";
      if (context === "Trend") return $_("technicals.trend") || "Trend";
      if (context === "Range") return $_("technicals.range") || "Range";
      return translateAction(context);
  }

  function getActionColor(action: string) {
    const a = action.toLowerCase();
    if (a.includes("strong buy")) return "text-[#00ff88] font-bold";
    if (a.includes("strong sell")) return "text-[#ff0044] font-bold";
    if (a.includes("buy")) return "text-[var(--success-color)]";
    if (a.includes("sell")) return "text-[var(--danger-color)]";
    return "text-[var(--text-secondary)]";
  }

  function formatVal(val: Decimal | undefined, precOverride?: number) {
    if (!val || !val.toDecimalPlaces) return "-";
    const prec = precOverride ?? indicatorSettings?.precision ?? 4;
    return val.toDecimalPlaces(prec).toString();
  }

  function getOscillatorContext(name: string, val: Decimal, action: string) {
    const v = val.toNumber();
    if (name === "RSI") {
      if (v >= 70) return "Overbought";
      if (v <= 30) return "Oversold";
    }
    if (name === "Stoch" || name === "StochRSI") {
        if (v >= 80) return "Overbought";
        if (v <= 20) return "Oversold";
    }
    if (name === "Will %R") {
         if (v > -20) return "Overbought";
         if (v < -80) return "Oversold";
    }
    if (name === "CCI") {
        if (v > 100) return "Overbought";
        if (v < -100) return "Oversold";
    }
    return action;
  }

  // --- UI Event Handlers ---
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

      <!-- Status Dot & Time -->
      <div class="flex items-center gap-2">
        {#if data?.lastUpdated}
          <span class="text-[9px] text-[var(--text-tertiary)] font-mono">
            {new Date(data.lastUpdated).toLocaleTimeString()}
          </span>
        {/if}
        {#if loading}
          <div
            class="animate-pulse w-2 h-2 bg-[var(--accent-color)] rounded-full"
          ></div>
        {:else}
          <div
            class="w-2 h-2 rounded-full {data
              ? 'bg-green-500'
              : 'bg-red-500'} opacity-50"
          ></div>
        {/if}
      </div>
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
              <div class="flex flex-col gap-1 py-1 border-b border-[var(--border-color)]">
                <div class="flex justify-between items-center text-xs px-1">
                    <span class="text-[var(--text-secondary)] uppercase font-medium">
                        {typeof $_ === "function" ? $_("settings.technicals.summaryAction") : "Summary"}
                    </span>
                    <span class="font-bold {getActionColor(data.summary.action)}">
                        {translateAction(data.summary.action)}
                    </span>
                </div>
              </div>
            {/if}

            <!-- Market Confluence (Gauge) -->
            {#if settingsState.showTechnicalsConfluence && data.confluence}
              <div class="flex flex-col gap-1 py-1 border-b border-[var(--border-color)] px-1">
                <div class="flex justify-between items-center text-xs">
                    <span class="text-[var(--text-secondary)] uppercase font-medium">
                        {typeof $_ === "function" ? $_("settings.technicals.marketConfluence") : "Confluence"}
                    </span>
                    <span class="font-bold {getActionColor(data.confluence.level)}">
                        {Math.round(data.confluence.score)}%
                    </span>
                </div>
                <!-- Linear Gauge -->
                <div class="relative h-1.5 bg-[var(--bg-tertiary)] rounded-full mt-1 overflow-hidden" title={data.confluence.contributing.join("\n")}>
                    <!-- Gradient Background: Red -> Yellow -> Green -->
                    <div class="absolute inset-0 bg-gradient-to-r from-[var(--danger-color)] via-[var(--warning-color)] to-[var(--success-color)] opacity-40"></div>
                    <!-- Marker -->
                    <div
                        class="absolute top-0 bottom-0 w-1 bg-[var(--text-primary)] shadow-[0_0_4px_rgba(0,0,0,0.5)] transform -translate-x-1/2 transition-all duration-500"
                        style="left: {data.confluence.score}%"
                    ></div>
                </div>
                <div class="flex justify-between text-[8px] text-[var(--text-tertiary)] mt-0.5 uppercase">
                    <span>{translateAction("Sell")}</span>
                    <span>{translateAction("Neutral")}</span>
                    <span>{translateAction("Buy")}</span>
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
                    new Decimal(data.volatility.bb.upper)
                      .minus(new Decimal(data.volatility.bb.lower))
                      .div(new Decimal(data.volatility.bb.middle))
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
                  class="grid grid-cols-[1fr_auto_auto] gap-x-2 text-xs py-1 border-b border-[var(--border-color)] last:border-0 hover:bg-[var(--bg-tertiary)] px-1 rounded group"
                >
                  <span class="truncate" title={osc.params}>{osc.name}</span>
                  <span class="font-mono text-right"
                    >{formatVal(osc.value)}</span
                  >
                  <!-- Context Aware Action -->
                  <span
                    class="font-bold text-right {getActionColor(osc.action)}"
                    title="Action: {osc.action}"
                    >{translateContext(getOscillatorContext(osc.name, osc.value, osc.action))}</span
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
                      >{translateAction(ma.action)}</span
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
                  class="flex justify-between text-xs py-1 px-1 border-b border-[var(--border-color)]"
                >
                  <span>MFI</span>
                  <div class="flex gap-2">
                    <span class="font-mono"
                      >{formatVal(data.advanced.mfi.value)}</span
                    >
                    <span
                      class="font-bold {getActionColor(
                        data.advanced.mfi.action,
                      )}">{translateContext(getOscillatorContext("MFI", data.advanced.mfi.value, data.advanced.mfi.action))}</span
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
                      >{translateAction(data.advanced.superTrend.trend.toUpperCase() === "BULL" ? "Buy" : "Sell")}</span
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
                    )}">{translateAction(data.advanced.ichimoku.action)}</span
                  >
                </div>
              {/if}
            </div>
          {/if}

          <!-- SIGNALS SECTION (Restyled) -->
          {#if settingsState.showTechnicalsSignals}
            <div class="flex flex-col gap-1 border-t border-[var(--border-color)] pt-2">
              <div class="text-[10px] uppercase text-[var(--text-secondary)] px-1">
                Signals
              </div>

              {#if data.divergences && data.divergences.length > 0}
                {#each data.divergences as div}
                  <div class="flex flex-col text-xs py-1 px-1 border-b border-[var(--border-color)] last:border-0 hover:bg-[var(--bg-tertiary)] rounded">
                    <div class="flex justify-between">
                        <span class="font-medium">{div.indicator} {div.type}</span>
                        <span class="font-bold {div.side === 'Bullish' ? 'text-[var(--success-color)]' : 'text-[var(--danger-color)]'}">
                          {translateAction(div.side)}
                        </span>
                    </div>
                    <div class="text-[9px] text-[var(--text-secondary)] flex justify-between mt-0.5">
                        <span>Val: {formatVal(div.indStart, 1)} ➝ {formatVal(div.indEnd, 1)}</span>
                        <span>Price: {formatVal(div.priceStart)} ➝ {formatVal(div.priceEnd)}</span>
                    </div>
                  </div>
                {/each}
              {:else}
                  <div class="text-xs text-[var(--text-secondary)] px-1 py-1 italic">
                     {$_("technicals.noSignals") || "No divergences detected"}
                  </div>
              {/if}
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
