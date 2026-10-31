<!--
  Copyright (C) 2026 MYDCT

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as
  published by the Free Software Foundation, either version 3 of the
  License, or (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License
  along with this program.  If not, see <https://www.gnu.org/licenses/>.
-->

<script lang="ts">

  import { tradeState } from "../../stores/trade.svelte";
  import { settingsState } from "../../stores/settings.svelte";
  import { indicatorState } from "../../stores/indicator.svelte";
  import { uiState } from "../../stores/ui.svelte";
  import { marketState } from "../../stores/market.svelte";
  import type { TechnicalsData } from "../../services/technicalsTypes";
  import { _ } from "../../locales/i18n";
  import type { TranslationKey } from "../../locales/schema";
  import { TIMEFRAME_QUICK_PICKS } from "../../lib/constants";
  import TimeframeDropdown from "./TimeframeDropdown.svelte";
  import { activeTechnicalsManager } from "../../services/activeTechnicalsManager.svelte";
  import { TechnicalsPresenter } from "../../utils/technicalsPresenter";
  import { untrack } from "svelte";
  import { marketWatcher } from "../../services/marketWatcher";
  import { INDICATOR_CATALOGUE } from "../../lib/alerts/indicatorCatalogue";
  import { computeLessonSeries } from "../../lib/academy/indicatorLessonSeries";
  import { LESSON_HISTORY_TARGET, lessonKlines } from "../../lib/academy/lessonSettings";
  import { computeStructureRead } from "../../lib/academy/structureRead";
  import { higherTimeframe, recentLevels } from "../../lib/academy/structureSignals";

  interface Props {
    isVisible?: boolean;
    fluidWidth?: boolean;
  }

  let { isVisible = false, fluidWidth = false }: Props = $props();

  // Reactivity
  let symbol = $derived(tradeState.symbol);
  let timeframe = $derived(tradeState.analysisTimeframe || "1h");
  let showPanel = $derived(settingsState.showTechnicals && isVisible);
  let indicatorSettings = $derived(indicatorState);

  // Data comes strictly from MarketState (pushed by ActiveTechnicalsManager)
  let wsData = $derived(symbol ? marketState.data[symbol] : null);
  let data: TechnicalsData | null = $derived(wsData?.technicals?.[timeframe] ?? null);

  // Cached pivots transformation: only recomputed when data.pivots changes,
  // not on unrelated template re-renders (AGENTS.md performance rule).
  let pivotsArray = $derived(
    data?.pivots ? TechnicalsPresenter.getPivotsArray(data.pivots) : [],
  );

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

  /*
   * Market-context check (FEAT-0766): the reading order the Academy lesson
   * explains, applied to the current symbol. Structure lives on the analysis
   * timeframe, direction and levels on the bias timeframe one step above.
   */
  interface ContextBar {
    time: number;
    high: number;
    low: number;
    close: number;
  }

  const ADX_TREND_THRESHOLD = 25;

  let biasTimeframe = $derived(higherTimeframe(timeframe));

  function contextBars(tf: string): ContextBar[] {
    const market = marketState.data[symbol];
    void market?.klinesLastUpdated?.[tf];
    const klines = market?.klines?.[tf];
    if (!klines || klines.length === 0) return [];
    const out: ContextBar[] = [];
    // Same validation the lesson charts use: one bad candle must not skew a swing.
    for (const kline of lessonKlines(klines)) {
      const time = Number(kline.time); // audit: safe — epoch-ms timestamp
      const high = Number(kline.high); // audit: safe — f64 indicator input (ADR-0021)
      const low = Number(kline.low); // audit: safe — f64 indicator input (ADR-0021)
      const close = Number(kline.close); // audit: safe — f64 indicator input (ADR-0021)
      if (!Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) continue;
      out.push({ time, high, low, close });
    }
    return out;
  }

  let analysisBars = $derived(contextBars(timeframe));
  let biasBars = $derived(contextBars(biasTimeframe));
  let analysisRead = $derived(computeStructureRead(analysisBars));
  let biasRead = $derived(computeStructureRead(biasBars));

  /** The nth-from-last finite value of a series, or null. Display only (ADR-0021). */
  function lastFinite(values: readonly (string | null)[] | undefined, skip = 0): number | null {
    if (!values) return null;
    let seen = 0;
    for (let i = values.length - 1; i >= 0; i--) {
      const raw = values[i];
      if (raw === null || raw === undefined) continue;
      const parsed = Number(raw); // audit: safe — f64 indicator display value (ADR-0021)
      if (!Number.isFinite(parsed)) continue;
      if (seen === skip) return parsed;
      seen++;
    }
    return null;
  }

  let biasEma = $derived.by(() => {
    const entry = INDICATOR_CATALOGUE.find((item) => item.id === "ema");
    if (!entry || biasBars.length === 0) return null;
    const candles = biasBars.map((bar) => ({
      open_time_ms: bar.time,
      open: String(bar.close),
      high: String(bar.high),
      low: String(bar.low),
      close: String(bar.close),
    }));
    const values = computeLessonSeries(entry, candles, biasTimeframe).lines.find(
      (line) => line.name === "value",
    )?.values;
    return { now: lastFinite(values), prev: lastFinite(values, 1) };
  });

  let biasValue = $derived.by(() => {
    const now = biasEma?.now ?? null;
    const prev = biasEma?.prev ?? null;
    const close = biasBars.length > 0 ? biasBars[biasBars.length - 1].close : null;
    if (now === null || prev === null || close === null) return "—";
    const direction = now > prev ? "rising" : now < prev ? "falling" : "flat";
    const side = close > now ? "above" : close < now ? "below" : "flat";
    return `${$_(`technicals.context.${direction}` as TranslationKey)} · ${$_(`technicals.context.${side}` as TranslationKey)}`;
  });

  let lastBreak = $derived(
    [...analysisRead.events]
      .reverse()
      .find((event) => event.kind.startsWith("BOS") || event.kind.startsWith("CHOCH")) ?? null,
  );

  let structureValue = $derived.by(() => {
    const event = lastBreak;
    if (event === null) return $_(`technicals.context.noBreak` as TranslationKey);
    const kind =
      event.kind === "BOS-up"
        ? "bosUp"
        : event.kind === "BOS-down"
          ? "bosDown"
          : event.kind === "CHOCH-up"
            ? "chochUp"
            : "chochDown";
    const ago = analysisBars.length - 1 - event.index;
    return `${$_(`technicals.context.${kind}` as TranslationKey)} · ${$_("technicals.context.candlesAgo", { values: { n: ago } })}`;
  });

  let biasClose = $derived(biasBars.length > 0 ? biasBars[biasBars.length - 1].close : null);
  let contextLevels = $derived(
    biasClose === null ? [] : recentLevels(biasRead.swings, biasClose, 1),
  );
  let nearestResistance = $derived(
    contextLevels.find((level) => level.side === "resistance") ?? null,
  );
  let nearestSupport = $derived(contextLevels.find((level) => level.side === "support") ?? null);

  let regimeValue = $derived.by(() => {
    const adx = data?.advanced?.adx?.value;
    const chop = data?.advanced?.choppiness?.value;
    if (adx === undefined || chop === undefined) return "—";
    const comparator = adx >= ADX_TREND_THRESHOLD ? "≥" : "<";
    return `ADX ${adx.toFixed(1)} ${comparator} ${ADX_TREND_THRESHOLD} · Chop ${chop.toFixed(1)}`;
  });

  let volatilityValue = $derived.by(() => {
    const bb = data?.volatility?.bb;
    const atr = data?.volatility?.atr;
    if (!bb || atr === undefined) return "—";
    const width = TechnicalsPresenter.calculateBollingerBandWidth(bb.upper, bb.lower, bb.middle);
    return `BW ${width.toFixed(2)} % · ATR ${TechnicalsPresenter.formatVal(atr, indicatorSettings?.precision)}`;
  });

  /*
   * The bias timeframe needs its own candles — the analysis channel does not
   * carry them. Registered only while the block is on, so hiding it costs
   * nothing.
   */
  $effect(() => {
    const current = symbol;
    const bias = biasTimeframe;
    const needed =
      showPanel && indicatorSettings.panelSections.context && current !== "" && bias !== timeframe;
    if (!needed) return;
    const channel = `kline_${bias}`;
    untrack(() => {
      void marketWatcher.ensureHistory(current, bias, LESSON_HISTORY_TARGET);
      marketWatcher.register(current, channel, "chart");
    });
    return () => marketWatcher.unregister(current, channel, "chart");
  });

  function translateAction(action: string | undefined): string {
    if (!action) return "-";
    // First try exact key
    const key = action.toLowerCase().replace(/\s+/g, "");
    // Runtime-checked dynamic key — see syncService.ts's identical pattern.
    const translation = $_(`settings.technicals.${key}` as TranslationKey);

    // If not found, try generic Buy/Sell
    if (!translation || translation.includes("settings.technicals")) {
      if (action.includes("Buy")) return $_("common.buy" as TranslationKey) || action;
      if (action.includes("Sell")) return $_("common.sell" as TranslationKey) || action;
      if (action.includes("Neutral"))
        return $_("common.neutral" as TranslationKey) || action;
      return action;
    }
    return translation;
  }

  function translateContext(context: string): string {
    if (context === "Overbought")
      return $_("settings.technicals.overbought" as TranslationKey) || "Overbought";
    if (context === "Oversold")
      return $_("settings.technicals.oversold" as TranslationKey) || "Oversold";
    if (context === "Trend")
      return $_("settings.technicals.trend" as TranslationKey) || "Trend";
    if (context === "Range")
      return $_("settings.technicals.range" as TranslationKey) || "Range";
    return translateAction(context);
  }

  // --- UI Event Handlers ---
  function setTimeframe(tf: string) {
    tradeState.update((s) => ({ ...s, analysisTimeframe: tf }));
  }
</script>

<!-- Dropdown state and the dismissing click live in the shared component. -->

{#if showPanel}
  <div
    class="technicals-panel p-3 flex flex-col gap-2 w-full transition-all relative"
    class:md:w-72={!fluidWidth && !settingsState.showIndicatorParams}
    class:md:w-[22rem]={!fluidWidth && settingsState.showIndicatorParams}
  >
    <!-- Top Header -->
    <div
      class="flex justify-between items-center pb-2 relative border-b border-[var(--border-color)] mb-2"
    >
      <div class="flex items-center gap-2">
        <!-- Title Button (Opens Settings) -->
        <button
          type="button"
          class="text-sm font-bold text-[var(--text-primary)] hover:text-[var(--accent-color)] transition-colors border-none outline-none bg-transparent cursor-pointer p-0"
          onclick={() => {
            uiState.toggleSettingsModal(true);
            uiState.settingsTab = "trading";
            uiState.settingsTradingSubTab = "market";
          }}
        >
          {typeof $_ === "function"
            ? $_("settings.technicals.title")
            : "Technicals"}
        </button>

        <!-- Timeframe chip + quick-pick dropdown (shared with the Academy lesson) -->
        <TimeframeDropdown
          value={timeframe}
          options={TIMEFRAME_QUICK_PICKS}
          onSelect={setTimeframe}
          label={$_("common.timeframe")}
        />
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
            class="animate-pulse w-indicator h-indicator bg-[var(--accent-color)] rounded-full"
          ></div>
        {:else}
          <div
            class="w-indicator h-indicator rounded-full {data
              ? 'bg-success'
              : 'bg-danger'} opacity-50"
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
        class="flex-1 overflow-y-auto pr-1 custom-scrollbar max-h-128 {settingsState.technicalsFullHeight ? 'xl:max-h-none' : ''}"
      >
        <div class="flex flex-col gap-4">
          <!-- Market-context check (FEAT-0766): the reading order the Academy
               lesson explains, applied to the current symbol. Five lines, no
               expander, no verdict — the interpretation stays with the reader. -->
          {#if indicatorSettings.panelSections.context}
            <div class="flex flex-col gap-1" data-testid="technicals-context">
              <div
                class="flex justify-between items-baseline text-[10px] uppercase text-[var(--text-secondary)] px-1"
              >
                <span>{$_("technicals.context.title")}</span>
                <span class="font-mono text-[var(--text-tertiary)]">{biasTimeframe}</span>
              </div>
              <div
                class="flex justify-between items-baseline gap-2 text-xs py-1 px-1 border-b border-[var(--border-color)]"
                data-testid="context-bias"
              >
                <span class="text-[var(--text-secondary)] shrink-0"
                  >{$_("technicals.context.bias")}</span
                >
                <span class="font-mono text-[var(--text-primary)] text-right">{biasValue}</span>
              </div>
              <div
                class="flex justify-between items-baseline gap-2 text-xs py-1 px-1 border-b border-[var(--border-color)]"
                data-testid="context-structure"
              >
                <span class="text-[var(--text-secondary)] shrink-0"
                  >{$_("technicals.context.structure")}</span
                >
                <span class="font-mono text-[var(--text-primary)] text-right">{structureValue}</span>
              </div>
              <div
                class="flex justify-between items-baseline gap-2 text-xs py-1 px-1 border-b border-[var(--border-color)]"
                data-testid="context-resistance"
              >
                <span class="text-[var(--text-secondary)] shrink-0"
                  >{$_("technicals.context.resistance")}</span
                >
                <span class="font-mono text-[var(--text-primary)] text-right"
                  >{nearestResistance
                    ? TechnicalsPresenter.formatVal(
                        nearestResistance.price,
                        indicatorSettings?.precision,
                      )
                    : "—"}</span
                >
              </div>
              <div
                class="flex justify-between items-baseline gap-2 text-xs py-1 px-1 border-b border-[var(--border-color)]"
                data-testid="context-support"
              >
                <span class="text-[var(--text-secondary)] shrink-0"
                  >{$_("technicals.context.support")}</span
                >
                <span class="font-mono text-[var(--text-primary)] text-right"
                  >{nearestSupport
                    ? TechnicalsPresenter.formatVal(
                        nearestSupport.price,
                        indicatorSettings?.precision,
                      )
                    : "—"}</span
                >
              </div>
              <div
                class="flex justify-between items-baseline gap-2 text-xs py-1 px-1 border-b border-[var(--border-color)]"
                data-testid="context-regime"
              >
                <span class="text-[var(--text-secondary)] shrink-0"
                  >{$_("technicals.context.regime")}</span
                >
                <span class="font-mono text-[var(--text-primary)] text-right">{regimeValue}</span>
              </div>
              <div
                class="flex justify-between items-baseline gap-2 text-xs py-1 px-1 border-b border-[var(--border-color)]"
                data-testid="context-volatility"
              >
                <span class="text-[var(--text-secondary)] shrink-0"
                  >{$_("technicals.context.volatility")}</span
                >
                <span class="font-mono text-[var(--text-primary)] text-right">{volatilityValue}</span>
              </div>
            </div>
          {/if}

          <!-- DASHBOARD SECTION (Minimalist List) -->
          <div class="flex flex-col gap-1">
            <!-- Summary Action -->
            {#if indicatorSettings.panelSections.summary}
              <div
                class="flex flex-col gap-1 py-1 border-b border-[var(--border-color)]"
              >
                <div class="flex justify-between items-center text-xs px-1">
                  <span
                    class="text-[var(--text-secondary)] uppercase font-medium"
                  >
                    {typeof $_ === "function"
                      ? $_("settings.technicals.summaryAction")
                      : "Summary"}
                  </span>
                  <span
                    class="font-bold {TechnicalsPresenter.getActionColor(
                      data.summary.action,
                    )}"
                  >
                    {translateAction(data.summary.action)}
                  </span>
                </div>
              </div>
            {/if}

            <!-- Market Confluence (Gauge) -->
            {#if indicatorSettings.panelSections.confluence && data.confluence}
              <div
                class="flex flex-col gap-1 py-1 border-b border-[var(--border-color)] px-1"
              >
                <div class="flex justify-between items-center text-xs">
                  <span
                    class="text-[var(--text-secondary)] uppercase font-medium"
                  >
                    {typeof $_ === "function"
                      ? $_("settings.technicals.marketConfluence")
                      : "Confluence"}
                  </span>
                  <span
                    class="font-bold {TechnicalsPresenter.getActionColor(
                      data.confluence.level,
                    )}"
                  >
                    {Math.round(data.confluence.score)}%
                  </span>
                </div>
                <!-- Linear Gauge -->
                <div
                  class="relative h-1.5 bg-[var(--bg-tertiary)] rounded-full mt-1 overflow-hidden"
                  title={data.confluence.contributing.join("\n")}
                >
                  <!-- Gradient Background: Red -> Yellow -> Green -->
                  <div
                    class="absolute inset-0 bg-gradient-to-r from-[var(--danger-color)] via-[var(--warning-color)] to-[var(--success-color)] opacity-40"
                  ></div>
                  <!-- Marker -->
                  <div
                    class="absolute top-0 bottom-0 w-1 bg-[var(--text-primary)] shadow-[0_0_4px_rgba(0,0,0,0.5)] transform -translate-x-1/2 transition-all duration-500"
                    style="left: {data.confluence.score}%"
                  ></div>
                </div>
                <div
                  class="flex justify-between text-[8px] text-[var(--text-tertiary)] mt-0.5 uppercase"
                >
                  <span>{translateAction("Sell")}</span>
                  <span>{translateAction("Neutral")}</span>
                  <span>{translateAction("Buy")}</span>
                </div>
              </div>
            {/if}

            <!-- Volatility -->
            {#if indicatorSettings.panelSections.volatility && data.volatility}
              {#if data.volatility.atr}
              <div
                class="flex justify-between items-center text-xs py-1 border-b border-[var(--border-color)] hover:bg-[var(--bg-tertiary)] px-1 rounded transition-colors group"
              >
                <span
                  class="text-[var(--text-secondary)] uppercase font-medium group-hover:text-[var(--text-primary)] transition-colors"
                  >{$_("settings.technicals.atr")}</span
                >
                <span class="font-mono text-[var(--text-primary)]"
                  >{TechnicalsPresenter.formatVal(
                    data.volatility.atr,
                    indicatorSettings?.precision,
                  )}</span
                >
              </div>
              {/if}
              {#if data.volatility.bb}
              <div
                class="flex justify-between items-center text-xs py-1 border-b border-[var(--border-color)] hover:bg-[var(--bg-tertiary)] px-1 rounded transition-colors group"
              >
                <span
                  class="text-[var(--text-secondary)] uppercase font-medium group-hover:text-[var(--text-primary)] transition-colors"
                  >{$_("settings.technicals.bbWidth")}</span
                >
                <span class="font-mono text-[var(--text-primary)]"
                  >{TechnicalsPresenter.formatVal(
                    TechnicalsPresenter.calculateBollingerBandWidth(
                      data.volatility.bb.upper,
                      data.volatility.bb.lower,
                      data.volatility.bb.middle,
                    ),
                    2,
                  )}%</span
                >
              </div>
              {/if}
            {/if}
          </div>

          <!-- Oscillators -->
          {#if indicatorSettings.panelSections.oscillators}
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
                    >{TechnicalsPresenter.formatVal(
                      osc.value,
                      indicatorSettings?.precision,
                    )}</span
                  >
                  <!-- Context Aware Action -->
                  <span
                    class="font-bold text-right {TechnicalsPresenter.getActionColor(
                      osc.action,
                    )}"
                    title={$_("ui.action", { values: { action: osc.action } })}
                    >{translateContext(
                      TechnicalsPresenter.getOscillatorContext(
                        osc.name,
                        osc.value,
                        osc.action,
                      ),
                    )}</span
                  >
                </div>
              {/each}
            </div>
          {/if}

          <!-- Moving Averages -->
          {#if indicatorSettings.panelSections.movingAverages}
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
                    <span class="font-mono"
                      >{TechnicalsPresenter.formatVal(
                        ma.value,
                        indicatorSettings?.precision,
                      )}</span
                    >
                    <span
                      class="font-bold {TechnicalsPresenter.getActionColor(
                        ma.action,
                      )}">{translateAction(ma.action)}</span
                    >
                  </div>
                </div>
              {/each}
            </div>
          {/if}

          <!-- Pivot Points -->
          {#if indicatorSettings.panelSections.pivots && data.pivots}
            <div class="flex flex-col gap-1">
              <div
                class="text-[10px] uppercase text-[var(--text-secondary)] px-1"
              >
                {$_("settings.technicals.pivotsTitle") || "Pivot Points"}
              </div>
              <div class="grid grid-cols-1 gap-y-0.5">
                {#each pivotsArray as pivot (pivot.label)}
                  <div
                    class="flex justify-between text-xs py-0.5 px-1 border-b border-[var(--border-color)] last:border-0 hover:bg-[var(--bg-tertiary)] rounded transition-colors"
                  >
                    <span class="font-bold {pivot.color}">{pivot.label}</span>
                    <span class="font-mono"
                      >{TechnicalsPresenter.formatVal(
                        pivot.val,
                        indicatorSettings?.precision,
                      )}</span
                    >
                  </div>
                {/each}
              </div>
            </div>
          {/if}

          <!-- Advanced / Pro -->
          {#if indicatorSettings.panelSections.advanced && data.advanced}
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
                  <span>{$_("settings.technicals.vwap")}</span>
                  <span class="font-mono"
                    >{TechnicalsPresenter.formatVal(
                      data.advanced.vwap,
                      indicatorSettings?.precision,
                    )}</span
                  >
                </div>
              {/if}

              <!-- Volume MA (New) -->
              {#if data.advanced.volumeMa}
                <div
                  class="flex justify-between text-xs py-1 px-1 border-b border-[var(--border-color)]"
                >
                  <span>{$_("settings.technicals.volumeMa.title")}</span>
                  <span class="font-mono"
                    >{TechnicalsPresenter.formatVal(
                      data.advanced.volumeMa,
                      0
                    )}</span
                  >
                </div>
              {/if}

              <!-- MFI -->
              {#if data.advanced.mfi}
                <div
                  class="flex justify-between text-xs py-1 px-1 border-b border-[var(--border-color)]"
                >
                  <span>{$_("settings.technicals.mfi")}</span>
                  <div class="flex gap-2">
                    <span class="font-mono"
                      >{TechnicalsPresenter.formatVal(
                        data.advanced.mfi.value,
                        indicatorSettings?.precision,
                      )}</span
                    >
                    <span
                      class="font-bold {TechnicalsPresenter.getActionColor(
                        data.advanced.mfi.action,
                      )}"
                      >{translateContext(
                        TechnicalsPresenter.getOscillatorContext(
                          "MFI",
                          data.advanced.mfi.value,
                          data.advanced.mfi.action,
                        ),
                      )}</span
                    >
                  </div>
                </div>
              {/if}

              <!-- SuperTrend (New) -->
              {#if data.advanced.superTrend}
                <div
                  class="flex justify-between text-xs py-1 px-1 border-b border-[var(--border-color)]"
                >
                  <span>{$_("settings.technicals.superTrend.title")}</span>
                  <div class="flex gap-2">
                    <span class="font-mono"
                      >{TechnicalsPresenter.formatVal(
                        data.advanced.superTrend.value,
                        indicatorSettings?.precision,
                      )}</span
                    >
                    <span
                      class="font-bold {TechnicalsPresenter.getSuperTrendColor(
                        data.advanced.superTrend.trend,
                      )}"
                      >{translateAction(
                        data.advanced.superTrend.trend.toUpperCase() === "BULL"
                          ? "Buy"
                          : "Sell",
                      )}</span
                    >
                  </div>
                </div>
              {/if}

              <!-- ADX -->
              {#if data.advanced.adx}
                <div
                  class="flex justify-between text-xs py-1 px-1 border-b border-[var(--border-color)]"
                >
                  <span>{$_("settings.technicals.adx")} ({data.advanced.adx.trend})</span>
                  <div class="flex gap-2">
                    <span class="font-mono"
                      >{TechnicalsPresenter.formatVal(
                        data.advanced.adx.value,
                        1,
                      )}</span
                    >
                    <span class="text-[var(--text-secondary)] text-[10px]">
                        DI+: {TechnicalsPresenter.formatVal(data.advanced.adx.pdi, 1)} DI-: {TechnicalsPresenter.formatVal(data.advanced.adx.mdi, 1)}
                    </span>
                  </div>
                </div>
              {/if}

              <!-- Choppiness -->
              {#if data.advanced.choppiness}
                <div
                  class="flex justify-between text-xs py-1 px-1 border-b border-[var(--border-color)]"
                >
                  <span>{$_("settings.technicals.choppiness")}</span>
                  <div class="flex gap-2">
                    <span class="font-mono"
                      >{TechnicalsPresenter.formatVal(
                        data.advanced.choppiness.value,
                        1,
                      )}</span
                    >
                    <span
                      class="font-bold {data.advanced.choppiness.state === 'Trend' ? 'text-[var(--accent-color)]' : 'text-[var(--text-secondary)]'}"
                      >{data.advanced.choppiness.state}</span
                    >
                  </div>
                </div>
              {/if}

              <!-- Parabolic SAR -->
              {#if data.advanced.parabolicSar}
                <div
                  class="flex justify-between text-xs py-1 px-1 border-b border-[var(--border-color)]"
                >
                  <span>{$_("settings.technicals.parabolicSar")}</span>
                  <span class="font-mono"
                    >{TechnicalsPresenter.formatVal(
                      data.advanced.parabolicSar,
                      indicatorSettings?.precision,
                    )}</span
                  >
                </div>
              {/if}

              <!-- ATR Trailing Stop (New) -->
              {#if data.advanced.atrTrailingStop}
                <div
                  class="flex flex-col text-xs py-1 px-1 border-b border-[var(--border-color)]"
                >
                  <div class="flex justify-between">
                    <span>{$_("settings.technicals.atrStopSell")}</span>
                    <span class="font-mono text-[var(--danger-color)]"
                      >{TechnicalsPresenter.formatVal(
                        data.advanced.atrTrailingStop.sell,
                        indicatorSettings?.precision,
                      )}</span
                    >
                  </div>
                  <div class="flex justify-between">
                    <span>{$_("settings.technicals.atrStopBuy")}</span>
                    <span class="font-mono text-[var(--success-color)]"
                      >{TechnicalsPresenter.formatVal(
                        data.advanced.atrTrailingStop.buy,
                        indicatorSettings?.precision,
                      )}</span
                    >
                  </div>
                </div>
              {/if}

              <!-- OBV (New) -->
              {#if data.advanced.obv}
                <div
                  class="flex justify-between text-xs py-1 px-1 border-b border-[var(--border-color)]"
                >
                  <span>{$_("settings.technicals.obv")}</span>
                  <span class="font-mono"
                    >{TechnicalsPresenter.formatVal(data.advanced.obv, 0)}</span
                  >
                </div>
              {/if}

              <!-- Volume Profile -->
              {#if data.advanced.volumeProfile}
                <div
                  class="flex flex-col text-xs py-1 px-1 border-b border-[var(--border-color)]"
                >
                  <div class="flex justify-between">
                    <span>{$_("settings.technicals.vpPoc")}</span>
                    <span class="font-mono"
                      >{TechnicalsPresenter.formatVal(data.advanced.volumeProfile.poc, indicatorSettings?.precision)}</span
                    >
                  </div>
                  <div class="flex justify-between text-[10px] text-[var(--text-secondary)]">
                    <span>{$_("settings.technicals.vaHighLow")}</span>
                    <span class="font-mono">
                        {TechnicalsPresenter.formatVal(data.advanced.volumeProfile.vaHigh, indicatorSettings?.precision)} / {TechnicalsPresenter.formatVal(data.advanced.volumeProfile.vaLow, indicatorSettings?.precision)}
                    </span>
                  </div>
                </div>
              {/if}

              <!-- Ichimoku (Restyled) -->
              {#if data.advanced.ichimoku}
                <div
                  class="flex justify-between text-xs py-1 px-1 border-b border-[var(--border-color)]"
                >
                  <span>{$_("settings.technicals.ichimoku")}</span>
                  <span
                    class="font-bold {TechnicalsPresenter.getActionColor(
                      data.advanced.ichimoku.action,
                    )}">{translateAction(data.advanced.ichimoku.action)}</span
                  >
                </div>
              {/if}
            </div>
          {/if}

          <!-- SIGNALS SECTION (Restyled) -->
          {#if indicatorSettings.panelSections.signals}
            <div
              class="flex flex-col gap-1 border-t border-[var(--border-color)] pt-2"
            >
              <div
                class="text-[10px] uppercase text-[var(--text-secondary)] px-1"
              >
                {$_("settings.workspace.signals")}
              </div>

              <!-- Market Structure (New) -->
              {#if data.advanced?.marketStructure}
                {#if data.advanced.marketStructure.highs.length > 0}
                  {@const lastHigh = data.advanced.marketStructure.highs[data.advanced.marketStructure.highs.length - 1]}
                  <div class="flex justify-between text-xs py-1 px-1 border-b border-[var(--border-color)] last:border-0 hover:bg-[var(--bg-tertiary)] rounded">
                    <span>{$_("settings.technicals.marketStructureHigh")}</span>
                    <span class="font-mono">{lastHigh.type} @ {TechnicalsPresenter.formatVal(lastHigh.value, indicatorSettings?.precision)}</span>
                  </div>
                {/if}
                {#if data.advanced.marketStructure.lows.length > 0}
                  {@const lastLow = data.advanced.marketStructure.lows[data.advanced.marketStructure.lows.length - 1]}
                  <div class="flex justify-between text-xs py-1 px-1 border-b border-[var(--border-color)] last:border-0 hover:bg-[var(--bg-tertiary)] rounded">
                    <span>{$_("settings.technicals.marketStructureLow")}</span>
                    <span class="font-mono">{lastLow.type} @ {TechnicalsPresenter.formatVal(lastLow.value, indicatorSettings?.precision)}</span>
                  </div>
                {/if}
              {/if}

              {#if data.divergences && data.divergences.length > 0}
                {#each data.divergences as div}
                  <div
                    class="flex flex-col text-xs py-1 px-1 border-b border-[var(--border-color)] last:border-0 hover:bg-[var(--bg-tertiary)] rounded"
                  >
                    <div class="flex justify-between">
                      <span class="font-medium">{div.indicator} {div.type}</span
                      >
                      <span
                        class="font-bold {TechnicalsPresenter.getDivergenceColor(
                          div.side,
                        )}"
                      >
                        {translateAction(div.side)}
                      </span>
                    </div>
                    <div
                      class="text-[9px] text-[var(--text-secondary)] flex justify-between mt-0.5"
                    >
                      <span
                        >{$_("settings.technicals.value")}: {TechnicalsPresenter.formatVal(div.indStart, 1)} ➝ {TechnicalsPresenter.formatVal(
                          div.indEnd,
                          1,
                        )}</span
                      >
                      <span
                        >{$_("settings.technicals.price")}: {TechnicalsPresenter.formatVal(
                          div.priceStart,
                          indicatorSettings?.precision,
                        )} ➝ {TechnicalsPresenter.formatVal(
                          div.priceEnd,
                          indicatorSettings?.precision,
                        )}</span
                      >
                    </div>
                  </div>
                {/each}
              {:else if (!data.advanced?.marketStructure?.highs.length && !data.advanced?.marketStructure?.lows.length)}
                <div
                  class="text-xs text-[var(--text-secondary)] px-1 py-1 italic"
                >
                  {$_("settings.technicals.noSignals")}
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
