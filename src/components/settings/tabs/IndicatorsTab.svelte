<!--
  Copyright (C) 2026 MYDCT

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.
-->

<script lang="ts">
  import { _ } from "../../../locales/i18n";
  import Toggle from "../../shared/Toggle.svelte";
  import { enhancedInput } from "../../../lib/actions/inputEnhancements";
  import TimeframeSelector from "../../shared/TimeframeSelector.svelte";
  import { settingsState } from "../../../stores/settings.svelte";
  import { indicatorState } from "../../../stores/indicator.svelte";
  import ProBadge from "./ProBadge.svelte";
  import ProOverlay from "./ProOverlay.svelte";
  import Field from "./IndicatorField.svelte";
  import Select from "./IndicatorSelect.svelte";

  interface Props {
    availableTimeframes: string[];
  }

  let { availableTimeframes }: Props = $props();

  let activeCategory = $state<
    "general" | "oscillators" | "trend" | "volatility" | "volume"
  >("general");

  const categories = [
    { id: "general", label: "General" },
    { id: "oscillators", label: "Oscillators" },
    { id: "trend", label: "Trend" },
    { id: "volatility", label: "Volatility" },
    { id: "volume", label: "Volume & Misc" },
  ] as const;

  function setCategory(id: typeof activeCategory) {
    activeCategory = id;
  }
</script>

<div class="flex flex-col gap-6 h-full">
  <!-- Category Tabs -->
  <div class="flex flex-wrap gap-2 border-b border-[var(--border-color)] pb-2">
    {#each categories as category}
      <button
        class="px-4 py-2 text-sm font-medium rounded-t transition-colors relative {activeCategory ===
        category.id
          ? 'text-[var(--text-primary)] bg-[var(--bg-secondary)] border-b-2 border-[var(--accent-color)]'
          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]/50'}"
        onclick={() => setCategory(category.id)}
      >
        {category.label}
        {#if activeCategory === category.id}
          <div
            class="absolute bottom-[-2px] left-0 w-full h-[2px] bg-[var(--accent-color)]"
          ></div>
        {/if}
      </button>
    {/each}
  </div>

  <div class="flex-1 overflow-y-auto pr-1">
    <!-- General Settings -->
    {#if activeCategory === "general"}
      <div class="flex flex-col gap-6 animate-fade-in">
        <h3 class="text-sm font-bold text-[var(--text-primary)]">
          {$_("settings.indicators.general") || "General Configuration"}
        </h3>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <!-- Precision -->
          <div
            class="p-4 border border-[var(--border-color)] rounded bg-[var(--bg-secondary)] flex flex-col gap-2"
          >
            <label for="precision" class="text-sm font-medium"
              >{$_("settings.indicators.precision") || "Precision"}</label
            >
            <div class="flex items-center justify-between">
              <span class="text-xs text-[var(--text-secondary)]"
                >Decimal places for values</span
              >
              <input
                id="precision"
                type="number"
                bind:value={indicatorState.precision}
                min="0"
                max="8"
                class="input-field rounded settings-number-input w-20"
                use:enhancedInput={{ min: 0, max: 8 }}
              />
            </div>
          </div>

          <!-- History Limit -->
          <div
            class="p-4 border border-[var(--border-color)] rounded bg-[var(--bg-secondary)] flex flex-col gap-2"
          >
            <label for="history-limit" class="text-sm font-medium"
              >{$_("settings.indicators.historyLimit") ||
                "History Limit"}</label
            >
            <div class="flex items-center justify-between">
              <span class="text-xs text-[var(--text-secondary)]"
                >Candles to load for calculation</span
              >
              <input
                id="history-limit"
                type="number"
                bind:value={indicatorState.historyLimit}
                min="100"
                max="10000"
                step="100"
                class="input-field rounded settings-number-input w-24"
                use:enhancedInput={{ min: 100, max: 10000 }}
              />
            </div>
          </div>
        </div>

        <!-- Global Timeframes -->
        <div
          class="p-4 border border-[var(--border-color)] rounded bg-[var(--bg-secondary)] flex flex-col gap-3"
        >
          <div class="flex justify-between items-center">
            <label for="favorite-timeframes" class="text-sm font-medium"
              >{$_("settings.indicators.favoriteTimeframes") ||
                "Favorite Timeframes"}</label
            >
          </div>
          <TimeframeSelector
            bind:selected={settingsState.favoriteTimeframes}
            options={availableTimeframes}
            placeholder={$_("settings.indicators.addTimeframe") ||
              "Add timeframe..."}
          />
        </div>

        <!-- RSI Sync -->
        <div
          class="p-4 border border-[var(--border-color)] rounded bg-[var(--bg-secondary)] flex items-center justify-between"
        >
          <div class="flex flex-col">
            <span class="text-sm font-medium"
              >{$_("settings.indicators.syncRsiTimeframe") ||
                "Sync RSI Timeframe"}</span
            >
            <span class="text-xs text-[var(--text-secondary)]"
              >Use chart timeframe for RSI calculation</span
            >
          </div>
          <Toggle bind:checked={settingsState.syncRsiTimeframe} />
        </div>
      </div>
    {/if}

    <!-- Oscillators -->
    {#if activeCategory === "oscillators"}
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
        <!-- RSI -->
        <div class="indicator-card">
          <div class="indicator-header">
            <h4>RSI</h4>
            <ProBadge />
          </div>
          <div class="indicator-body">
            <div class="row">
              <Field
                label="Length"
                id="rsi-len"
                type="number"
                bind:value={indicatorState.rsi.length}
                min={2}
                max={100}
              />
              <Select
                label="Source"
                id="rsi-src"
                bind:value={indicatorState.rsi.source}
                options={["close", "open", "high", "low", "hl2", "hlc3"]}
              />
            </div>
            <div class="separator"></div>
            <div class="row-between">
              <span class="text-xs">Signal Line</span>
              <Toggle
                bind:checked={indicatorState.rsi.showSignal}
                disabled={!settingsState.isPro}
              />
            </div>
            {#if indicatorState.rsi.showSignal}
              <div class="row mt-2">
                <Select
                  label="Type"
                  id="rsi-sig-type"
                  bind:value={indicatorState.rsi.signalType}
                  options={["sma", "ema"]}
                />
                <Field
                  label="Len"
                  id="rsi-sig-len"
                  type="number"
                  bind:value={indicatorState.rsi.signalLength}
                  min={2}
                  max={100}
                />
              </div>
            {/if}
          </div>
          <ProOverlay />
        </div>

        <!-- Stoch RSI -->
        <div class="indicator-card">
          <div class="indicator-header">
            <h4>Stoch RSI</h4>
            <ProBadge />
          </div>
          <div class="indicator-body">
            <div class="row">
              <Field
                label="Len"
                id="srsi-len"
                type="number"
                bind:value={indicatorState.stochRsi.length}
                min={2}
                max={100}
              />
              <Field
                label="RSI Len"
                id="srsi-rlen"
                type="number"
                bind:value={indicatorState.stochRsi.rsiLength}
                min={2}
                max={100}
              />
            </div>
            <div class="row">
              <Field
                label="%K"
                id="srsi-k"
                type="number"
                bind:value={indicatorState.stochRsi.kPeriod}
                min={1}
                max={100}
              />
              <Field
                label="%D"
                id="srsi-d"
                type="number"
                bind:value={indicatorState.stochRsi.dPeriod}
                min={1}
                max={100}
              />
            </div>
          </div>
          <ProOverlay />
        </div>

        <!-- Stochastic -->
        <div class="indicator-card">
          <div class="indicator-header">
            <h4>Stochastic</h4>
            <ProBadge />
          </div>
          <div class="indicator-body">
            <div class="row">
              <Field
                label="%K Len"
                id="stoch-k"
                type="number"
                bind:value={indicatorState.stochastic.kPeriod}
                min={2}
                max={100}
              />
              <Field
                label="%K Smth"
                id="stoch-ks"
                type="number"
                bind:value={indicatorState.stochastic.kSmoothing}
                min={1}
                max={50}
              />
            </div>
            <div class="row">
              <Field
                label="%D Smth"
                id="stoch-ds"
                type="number"
                bind:value={indicatorState.stochastic.dPeriod}
                min={1}
                max={50}
              />
            </div>
          </div>
          <ProOverlay />
        </div>

        <!-- CCI -->
        <div class="indicator-card">
          <div class="indicator-header">
            <h4>CCI</h4>
            <ProBadge />
          </div>
          <div class="indicator-body">
            <div class="row">
              <Field
                label="Length"
                id="cci-len"
                type="number"
                bind:value={indicatorState.cci.length}
                min={2}
                max={100}
              />
              <Select
                label="Source"
                id="cci-src"
                bind:value={indicatorState.cci.source}
                options={["close", "open", "high", "low", "hl2", "hlc3"]}
              />
            </div>
            <div class="separator"></div>
            <div class="row">
              <Select
                label="Smooth Type"
                id="cci-st"
                bind:value={indicatorState.cci.smoothingType}
                options={["sma", "ema"]}
              />
              <Field
                label="Smooth Len"
                id="cci-sl"
                type="number"
                bind:value={indicatorState.cci.smoothingLength}
                min={1}
                max={50}
              />
            </div>
          </div>
          <ProOverlay />
        </div>

        <!-- Williams %R -->
        <div class="indicator-card">
          <div class="indicator-header">
            <h4>Williams %R</h4>
            <ProBadge />
          </div>
          <div class="indicator-body">
            <div class="row">
              <Field
                label="Length"
                id="wr-len"
                type="number"
                bind:value={indicatorState.williamsR.length}
                min={2}
                max={100}
              />
            </div>
          </div>
          <ProOverlay />
        </div>

        <!-- MFI -->
        <div class="indicator-card">
          <div class="indicator-header">
            <h4>Money Flow Index</h4>
            <ProBadge />
          </div>
          <div class="indicator-body">
            <div class="row">
              <Field
                label="Length"
                id="mfi-len"
                type="number"
                bind:value={indicatorState.mfi.length}
                min={2}
                max={100}
              />
            </div>
          </div>
          <ProOverlay />
        </div>

        <!-- Momentum -->
        <div class="indicator-card">
          <div class="indicator-header">
            <h4>Momentum</h4>
            <ProBadge />
          </div>
          <div class="indicator-body">
            <div class="row">
              <Field
                label="Length"
                id="mom-len"
                type="number"
                bind:value={indicatorState.momentum.length}
                min={2}
                max={100}
              />
              <Select
                label="Source"
                id="mom-src"
                bind:value={indicatorState.momentum.source}
                options={["close", "open", "high", "low", "hl2", "hlc3"]}
              />
            </div>
          </div>
          <ProOverlay />
        </div>

        <!-- Awesome Oscillator -->
        <div class="indicator-card">
          <div class="indicator-header">
            <h4>Awesome Osc</h4>
            <ProBadge />
          </div>
          <div class="indicator-body">
            <div class="row">
              <Field
                label="Fast Len"
                id="ao-fast"
                type="number"
                bind:value={indicatorState.ao.fastLength}
                min={1}
                max={100}
              />
              <Field
                label="Slow Len"
                id="ao-slow"
                type="number"
                bind:value={indicatorState.ao.slowLength}
                min={1}
                max={100}
              />
            </div>
          </div>
          <ProOverlay />
        </div>
      </div>
    {/if}

    <!-- Trend -->
    {#if activeCategory === "trend"}
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
        <!-- MACD -->
        <div class="indicator-card">
          <div class="indicator-header">
            <h4>MACD</h4>
            <ProBadge />
          </div>
          <div class="indicator-body">
            <div class="row">
              <Field
                label="Fast"
                id="macd-f"
                type="number"
                bind:value={indicatorState.macd.fastLength}
                min={2}
                max={100}
              />
              <Field
                label="Slow"
                id="macd-s"
                type="number"
                bind:value={indicatorState.macd.slowLength}
                min={2}
                max={100}
              />
              <Field
                label="Sig"
                id="macd-sig"
                type="number"
                bind:value={indicatorState.macd.signalLength}
                min={2}
                max={100}
              />
            </div>
            <div class="row mt-2">
              <Select
                label="Source"
                id="macd-src"
                bind:value={indicatorState.macd.source}
                options={["close", "open", "high", "low", "hl2", "hlc3"]}
              />
            </div>
            <div class="separator"></div>
            <div class="row">
              <Select
                label="Osc MA"
                id="macd-osc-ma"
                bind:value={indicatorState.macd.oscillatorMaType}
                options={["ema", "sma"]}
              />
              <Select
                label="Sig MA"
                id="macd-sig-ma"
                bind:value={indicatorState.macd.signalMaType}
                options={["ema", "sma"]}
              />
            </div>
          </div>
          <ProOverlay />
        </div>

        <!-- EMA Settings -->
        <div class="indicator-card col-span-1 lg:col-span-2">
          <div class="indicator-header">
            <h4>EMA Triple</h4>
            <ProBadge />
          </div>
          <div class="indicator-body flex flex-col gap-4">
            <div class="row">
              <Select
                label="Common Source"
                id="ema-src"
                bind:value={indicatorState.ema.source}
                options={["close", "open", "high", "low", "hl2", "hlc3"]}
              />
            </div>

            <!-- EMA 1 -->
            <div
              class="p-2 border border-[var(--border-color)]/50 rounded bg-[var(--bg-primary)]/50"
            >
              <div class="text-xs font-bold mb-2">EMA 1</div>
              <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
                <Field
                  label="Len"
                  id="ema1-l"
                  type="number"
                  bind:value={indicatorState.ema.ema1.length}
                  min={2}
                  max={500}
                />
                <Field
                  label="Offset"
                  id="ema1-o"
                  type="number"
                  bind:value={indicatorState.ema.ema1.offset}
                  min={-100}
                  max={100}
                />
                <Select
                  label="Smth Type"
                  id="ema1-st"
                  bind:value={indicatorState.ema.ema1.smoothingType}
                  options={["none", "sma", "ema", "smma", "wma", "vwma"]}
                />
                {#if indicatorState.ema.ema1.smoothingType !== "none"}
                  <Field
                    label="Smth Len"
                    id="ema1-sl"
                    type="number"
                    bind:value={indicatorState.ema.ema1.smoothingLength}
                    min={1}
                    max={100}
                  />
                {/if}
              </div>
            </div>

            <!-- EMA 2 -->
            <div
              class="p-2 border border-[var(--border-color)]/50 rounded bg-[var(--bg-primary)]/50"
            >
              <div class="text-xs font-bold mb-2">EMA 2</div>
              <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
                <Field
                  label="Len"
                  id="ema2-l"
                  type="number"
                  bind:value={indicatorState.ema.ema2.length}
                  min={2}
                  max={500}
                />
                <Field
                  label="Offset"
                  id="ema2-o"
                  type="number"
                  bind:value={indicatorState.ema.ema2.offset}
                  min={-100}
                  max={100}
                />
                <Select
                  label="Smth Type"
                  id="ema2-st"
                  bind:value={indicatorState.ema.ema2.smoothingType}
                  options={["none", "sma", "ema", "smma", "wma", "vwma"]}
                />
                {#if indicatorState.ema.ema2.smoothingType !== "none"}
                  <Field
                    label="Smth Len"
                    id="ema2-sl"
                    type="number"
                    bind:value={indicatorState.ema.ema2.smoothingLength}
                    min={1}
                    max={100}
                  />
                {/if}
              </div>
            </div>

            <!-- EMA 3 -->
            <div
              class="p-2 border border-[var(--border-color)]/50 rounded bg-[var(--bg-primary)]/50"
            >
              <div class="text-xs font-bold mb-2">EMA 3</div>
              <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
                <Field
                  label="Len"
                  id="ema3-l"
                  type="number"
                  bind:value={indicatorState.ema.ema3.length}
                  min={2}
                  max={500}
                />
                <Field
                  label="Offset"
                  id="ema3-o"
                  type="number"
                  bind:value={indicatorState.ema.ema3.offset}
                  min={-100}
                  max={100}
                />
                <Select
                  label="Smth Type"
                  id="ema3-st"
                  bind:value={indicatorState.ema.ema3.smoothingType}
                  options={["none", "sma", "ema", "smma", "wma", "vwma"]}
                />
                {#if indicatorState.ema.ema3.smoothingType !== "none"}
                  <Field
                    label="Smth Len"
                    id="ema3-sl"
                    type="number"
                    bind:value={indicatorState.ema.ema3.smoothingLength}
                    min={1}
                    max={100}
                  />
                {/if}
              </div>
            </div>
          </div>
          <ProOverlay />
        </div>

        <!-- ADX -->
        <div class="indicator-card">
          <div class="indicator-header">
            <h4>ADX</h4>
            <ProBadge />
          </div>
          <div class="indicator-body">
            <div class="row">
              <Field
                label="Scaling (Smth)"
                id="adx-s"
                type="number"
                bind:value={indicatorState.adx.adxSmoothing}
                min={2}
                max={100}
              />
              <Field
                label="DI Len"
                id="adx-di"
                type="number"
                bind:value={indicatorState.adx.diLength}
                min={2}
                max={100}
              />
            </div>
            <div class="row mt-2">
              <Field
                label="Threshold"
                id="adx-th"
                type="number"
                bind:value={indicatorState.adx.threshold}
                min={0}
                max={100}
              />
            </div>
          </div>
          <ProOverlay />
        </div>

        <!-- SuperTrend -->
        <div class="indicator-card">
          <div class="indicator-header">
            <h4>SuperTrend</h4>
            <ProBadge />
          </div>
          <div class="indicator-body">
            <div class="row">
              <Field
                label="Factor"
                id="st-fac"
                type="number"
                bind:value={indicatorState.superTrend.factor}
                step={0.1}
                min={0.1}
                max={20}
              />
              <Field
                label="Period"
                id="st-per"
                type="number"
                bind:value={indicatorState.superTrend.period}
                min={2}
                max={100}
              />
            </div>
          </div>
          <ProOverlay />
        </div>

        <!-- Ichimoku -->
        <div class="indicator-card">
          <div class="indicator-header">
            <h4>Ichimoku Cloud</h4>
            <ProBadge />
          </div>
          <div class="indicator-body">
            <div class="grid grid-cols-2 gap-2">
              <Field
                label="Conversion"
                id="ichi-conv"
                type="number"
                bind:value={indicatorState.ichimoku.conversionPeriod}
                min={1}
              />
              <Field
                label="Base"
                id="ichi-base"
                type="number"
                bind:value={indicatorState.ichimoku.basePeriod}
                min={1}
              />
              <Field
                label="Span B"
                id="ichi-spanb"
                type="number"
                bind:value={indicatorState.ichimoku.spanBPeriod}
                min={1}
              />
              <Field
                label="Displace"
                id="ichi-disp"
                type="number"
                bind:value={indicatorState.ichimoku.displacement}
                min={1}
              />
            </div>
          </div>
          <ProOverlay />
        </div>

        <!-- Pivots -->
        <div class="indicator-card">
          <div class="indicator-header">
            <h4>Pivots</h4>
            <ProBadge />
          </div>
          <div class="indicator-body">
            <div class="row">
              <Select
                label="Type"
                id="piv-type"
                bind:value={indicatorState.pivots.type}
                options={["classic", "woodie", "camarilla", "fibonacci"]}
              />
              <Select
                label="Mode"
                id="piv-mode"
                bind:value={indicatorState.pivots.viewMode}
                options={["integrated", "separated", "abstract"]}
              />
            </div>
          </div>
          <ProOverlay />
        </div>
      </div>
    {/if}

    <!-- Volatility -->
    {#if activeCategory === "volatility"}
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
        <!-- ATR -->
        <div class="indicator-card">
          <div class="indicator-header">
            <h4>ATR</h4>
            <ProBadge />
          </div>
          <div class="indicator-body">
            <div class="row">
              <Field
                label="Length"
                id="atr-len"
                type="number"
                bind:value={indicatorState.atr.length}
                min={2}
                max={100}
              />
            </div>
          </div>
          <ProOverlay />
        </div>

        <!-- Bollinger Bands -->
        <div class="indicator-card">
          <div class="indicator-header">
            <h4>Bollinger Bands</h4>
            <ProBadge />
          </div>
          <div class="indicator-body">
            <div class="row">
              <Field
                label="Length"
                id="bb-len"
                type="number"
                bind:value={indicatorState.bb.length}
                min={2}
                max={100}
              />
              <Field
                label="StdDev"
                id="bb-std"
                type="number"
                bind:value={indicatorState.bb.stdDev}
                min={0.1}
                step={0.1}
                max={10}
              />
            </div>
          </div>
          <ProOverlay />
        </div>

        <!-- Choppiness Index -->
        <div class="indicator-card">
          <div class="indicator-header">
            <h4>Choppiness Index</h4>
            <ProBadge />
          </div>
          <div class="indicator-body">
            <div class="row">
              <Field
                label="Length"
                id="chop-len"
                type="number"
                bind:value={indicatorState.choppiness.length}
                min={2}
                max={100}
              />
            </div>
          </div>
          <ProOverlay />
        </div>

        <!-- ATR Trailing Stop -->
        <div class="indicator-card">
          <div class="indicator-header">
            <h4>ATR Trailing Stop</h4>
            <ProBadge />
          </div>
          <div class="indicator-body">
            <div class="row">
              <Field
                label="Period"
                id="atrt-per"
                type="number"
                bind:value={indicatorState.atrTrailingStop.period}
                min={2}
                max={100}
              />
              <Field
                label="Multiplier"
                id="atrt-mult"
                type="number"
                bind:value={indicatorState.atrTrailingStop.multiplier}
                step={0.1}
                min={0.1}
                max={20}
              />
            </div>
          </div>
          <ProOverlay />
        </div>
      </div>
    {/if}

    <!-- Volume & Misc -->
    {#if activeCategory === "volume"}
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
        <!-- OBV -->
        <div class="indicator-card">
          <div class="indicator-header">
            <h4>OBV</h4>
            <ProBadge />
          </div>
          <div class="indicator-body">
            <div class="row">
              <Field
                label="Smooth Len"
                id="obv-sm"
                type="number"
                bind:value={indicatorState.obv.smoothingLength}
                min={0}
                max={100}
              />
              <span
                class="text-[10px] text-[var(--text-secondary)] self-end mb-2 ml-2"
                >(0 = Disabled)</span
              >
            </div>
          </div>
          <ProOverlay />
        </div>

        <!-- VWAP -->
        <div class="indicator-card">
          <div class="indicator-header">
            <h4>VWAP</h4>
            <ProBadge />
          </div>
          <div class="indicator-body">
            <div class="row">
              <Field
                label="Length"
                id="vwap-len"
                type="number"
                bind:value={indicatorState.vwap.length}
                min={0}
                max={1000}
              />
              <span
                class="text-[10px] text-[var(--text-secondary)] self-end mb-2 ml-2"
                >(0 = Session)</span
              >
            </div>
          </div>
          <ProOverlay />
        </div>

        <!-- Volume Profile -->
        <div class="indicator-card">
          <div class="indicator-header">
            <h4>Volume Profile</h4>
            <ProBadge />
          </div>
          <div class="indicator-body">
            <div class="row">
              <Field
                label="Rows"
                id="vp-rows"
                type="number"
                bind:value={indicatorState.volumeProfile.rows}
                min={5}
                max={200}
              />
            </div>
          </div>
          <ProOverlay />
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .indicator-card {
    @apply p-4 border border-[var(--border-color)] rounded bg-[var(--bg-secondary)] flex flex-col gap-3 relative overflow-hidden;
  }
  .indicator-header {
    @apply flex justify-between items-center border-b border-[var(--border-color)] pb-2 mb-1;
  }
  .indicator-header h4 {
    @apply text-xs font-bold uppercase text-[var(--text-secondary)];
  }
  .indicator-body {
    @apply flex flex-col gap-2;
  }
  .row {
    @apply flex gap-4 items-center;
  }
  .row-between {
    @apply flex justify-between items-center;
  }
  .separator {
    @apply border-t border-[var(--border-color)] my-1;
  }
  .animate-fade-in {
    animation: fadeIn 0.2s ease-in-out;
  }
  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(2px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
