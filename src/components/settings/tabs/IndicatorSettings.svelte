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
    import TimeframeSelector from "../../shared/TimeframeSelector.svelte";
    import { settingsState } from "../../../stores/settings.svelte";
    import { indicatorState } from "../../../stores/indicator.svelte";
    import { uiState } from "../../../stores/ui.svelte";
    import Field from "./IndicatorField.svelte";
    import Select from "./IndicatorSelect.svelte";

    export const availableTimeframes = [
        "1m","3m","5m","15m","30m","1h","2h","4h","6h","8h","12h","1d","3d","1w","1M",
    ];

    const activeCategory = $derived(uiState.settingsIndicatorCategory);

    const categories = $derived([
        { id: "general",     label: $_(("settings.tabs.general") as any)            || "General" },
        { id: "oscillators", label: $_(("settings.technicals.oscillators") as any)  || "Oscillators" },
        { id: "trend",       label: $_(("settings.indicators.trend") as any)        || "Trend" },
        { id: "volatility",  label: $_(("settings.indicators.volatility") as any)   || "Volatility" },
        { id: "volume",      label: $_(("settings.indicators.volume") as any)       || "Volume" },
        { id: "signals",     label: $_(("settings.indicators.signals") as any)      || "Signals" },
    ]);

    const pnlModes = [
        { value: "value",   label: $_(("settings.technicals.pnlModes.absolute") as any) || "Absolute" },
        { value: "percent", label: $_(("settings.technicals.pnlModes.percent") as any)  || "Percent %" },
        { value: "bar",     label: $_(("settings.technicals.pnlModes.bar") as any)      || "Visual Bar" },
    ];

    const pivotTypes = [
        { value: "classic",    label: "Classic" },
        { value: "woodie",     label: "Woodie" },
        { value: "camarilla",  label: "Camarilla" },
        { value: "fibonacci",  label: "Fibonacci" },
    ];

    function isEnabled(key: keyof typeof settingsState.enabledIndicators): boolean {
        return settingsState.enabledIndicators[key];
    }
</script>

<div class="indicator-settings flex flex-col gap-4">
    <!-- Sub-Navigation -->
    <div class="flex flex-wrap gap-1.5 border-b border-[var(--border-color)] pb-2 mb-1">
        {#each categories as category}
            <button
                class="category-btn px-3 py-1.5 text-xs font-black uppercase tracking-widest rounded-lg transition-all {activeCategory === category.id
                    ? 'bg-[var(--accent-color)] text-[var(--btn-accent-text)] shadow-lg scale-105 z-10'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]'}"
                onclick={() => (uiState.settingsIndicatorCategory = category.id)}
            >
                {category.label}
            </button>
        {/each}
    </div>

    <div class="flex flex-col gap-4">

        <!-- ═══════════════════════════════════════════ GENERAL ═══ -->
        {#if activeCategory === "general"}
            <section class="flex flex-col gap-4">
                <div class="grid grid-cols-2 gap-3">
                    <div class="field-group">
                        <label for="precision">Precision</label>
                        <input id="precision" type="number" bind:value={indicatorState.precision} min="0" max="8" class="input-field" />
                    </div>
                    <div class="field-group">
                        <label for="history-limit">History Limit</label>
                        <input id="history-limit" type="number" bind:value={indicatorState.historyLimit} min="100" max="10000" step="100" class="input-field" />
                    </div>
                </div>

                <!-- Engine settings -->
                <div class="p-3 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)] flex flex-col gap-3">
                    <label class="flex items-center justify-between">
                        <div class="flex flex-col">
                            <span class="text-xs font-bold">Auto-Optimize</span>
                            <span class="text-[10px] text-[var(--text-secondary)]">Only calculate enabled indicators</span>
                        </div>
                        <Toggle bind:checked={indicatorState.autoOptimize} />
                    </label>
                    <div class="grid grid-cols-2 gap-2">
                        <div class="field-group">
                            <label for="preferred-engine">Engine</label>
                            <select id="preferred-engine" bind:value={indicatorState.preferredEngine} class="input-field">
                                <option value="auto">Auto</option>
                                <option value="ts">TypeScript</option>
                                <option value="wasm">WASM</option>
                                <option value="gpu">GPU</option>
                            </select>
                        </div>
                        <div class="field-group">
                            <label for="performance-mode">Perf. Mode</label>
                            <select id="performance-mode" bind:value={indicatorState.performanceMode} class="input-field">
                                <option value="speed">Speed</option>
                                <option value="balanced">Balanced</option>
                                <option value="quality">Quality</option>
                            </select>
                        </div>
                    </div>
                </div>

                <!-- RSI Sync (affects MarketOverview tiles) -->
                <label class="toggle-card">
                    <div class="flex flex-col">
                        <span class="text-sm font-medium">{$_("settings.technicals.syncRsi") || "Synchronize RSI Timeframe"}</span>
                        <span class="text-[10px] text-[var(--text-secondary)]">{$_("settings.technicals.syncRsiDesc") || "Use chart timeframe in MarketOverview tiles"}</span>
                    </div>
                    <Toggle bind:checked={settingsState.syncRsiTimeframe} />
                </label>

                <!-- PnL Mode -->
                <div class="field-group">
                    <span class="text-xs font-semibold text-[var(--text-secondary)] mb-1 block">PnL Display Mode</span>
                    <div class="flex gap-2">
                        {#each pnlModes as mode}
                            <button
                                class="flex-1 px-2 py-1.5 text-xs font-bold rounded border transition-all {settingsState.pnlViewMode === mode.value
                                    ? 'bg-[var(--accent-color)] text-[var(--btn-accent-text)] border-[var(--accent-color)]'
                                    : 'bg-[var(--bg-secondary)] border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-color)]'}"
                                onclick={() => (settingsState.pnlViewMode = mode.value as any)}
                            >
                                {mode.label}
                            </button>
                        {/each}
                    </div>
                </div>

                <!-- Favorite Timeframes -->
                <div>
                    <span class="text-xs font-semibold text-[var(--text-secondary)] mb-2 block">Favorite Timeframes</span>
                    <TimeframeSelector bind:selected={settingsState.favoriteTimeframes} options={availableTimeframes} />
                </div>
            </section>

        <!-- ═══════════════════════════════════════════ OSCILLATORS ═══ -->
        {:else if activeCategory === "oscillators"}
            <div class="tile-grid">

                <!-- RSI -->
                <div class="indicator-tile" class:tile-active={isEnabled("rsi")} class:tile-inactive={!isEnabled("rsi")}>
                    <div class="tile-header">
                        <span class="tile-name">RSI</span>
                        <Toggle bind:checked={settingsState.enabledIndicators.rsi} />
                    </div>
                    <div class="tile-params">
                        <Field id="rsi-len" label="Length" type="number" bind:value={indicatorState.rsi.length} min={2} />
                        <Select id="rsi-src" label="Source" bind:value={indicatorState.rsi.source} options={["close","open","high","low","hl2","hlc3"]} />
                        <Select id="rsi-sm-type" label="Smoothing" bind:value={indicatorState.rsi.smoothingType} options={["none","sma","ema","smma","wma","vwma","sma_bb"]} />
                        {#if indicatorState.rsi.smoothingType !== "none"}
                            <Field id="rsi-sm-len" label="Sm. Length" type="number" bind:value={indicatorState.rsi.smoothingLength} min={1} />
                        {/if}
                        {#if indicatorState.rsi.smoothingType === "sma_bb"}
                            <Field id="rsi-sm-bb" label="BB StdDev" type="number" bind:value={indicatorState.rsi.bbStdDev} min={0.1} step={0.1} />
                        {/if}
                        <Field id="rsi-ob" label="Overbought" type="number" bind:value={indicatorState.rsi.overbought} />
                        <Field id="rsi-os" label="Oversold" type="number" bind:value={indicatorState.rsi.oversold} />
                    </div>
                </div>

                <!-- Stoch RSI -->
                <div class="indicator-tile" class:tile-active={isEnabled("stochRsi")} class:tile-inactive={!isEnabled("stochRsi")}>
                    <div class="tile-header">
                        <span class="tile-name">Stoch RSI</span>
                        <Toggle bind:checked={settingsState.enabledIndicators.stochRsi} />
                    </div>
                    <div class="tile-params">
                        <Field id="srsi-len" label="Stoch Len" type="number" bind:value={indicatorState.stochRsi.length} min={2} />
                        <Field id="srsi-rlen" label="RSI Len" type="number" bind:value={indicatorState.stochRsi.rsiLength} min={2} />
                        <Field id="srsi-k" label="%K Period" type="number" bind:value={indicatorState.stochRsi.kPeriod} />
                        <Field id="srsi-d" label="%D Period" type="number" bind:value={indicatorState.stochRsi.dPeriod} />
                        <Select id="srsi-src" label="RSI Source" bind:value={indicatorState.stochRsi.source} options={["close","open","high","low","hl2","hlc3", "ohlc4"]} />
                    </div>
                </div>

                <!-- Stochastic -->
                <div class="indicator-tile" class:tile-active={isEnabled("stochastic")} class:tile-inactive={!isEnabled("stochastic")}>
                    <div class="tile-header">
                        <span class="tile-name">Stochastic</span>
                        <Toggle bind:checked={settingsState.enabledIndicators.stochastic} />
                    </div>
                    <div class="tile-params">
                        <Field id="sto-k" label="%K Period" type="number" bind:value={indicatorState.stochastic.kPeriod} />
                        <Field id="sto-ks" label="%K Smooth" type="number" bind:value={indicatorState.stochastic.kSmoothing} />
                        <Field id="sto-d" label="%D Period" type="number" bind:value={indicatorState.stochastic.dPeriod} />
                    </div>
                </div>

                <!-- Williams %R -->
                <div class="indicator-tile" class:tile-active={isEnabled("williamsR")} class:tile-inactive={!isEnabled("williamsR")}>
                    <div class="tile-header">
                        <span class="tile-name">Williams %R</span>
                        <Toggle bind:checked={settingsState.enabledIndicators.williamsR} />
                    </div>
                    <div class="tile-params">
                        <Field id="wr-len" label="Length" type="number" bind:value={indicatorState.williamsR.length} min={2} />
                        <Select id="wr-src" label="Source" bind:value={indicatorState.williamsR.source} options={["close","open","high","low","hl2","hlc3", "ohlc4"]} />
                    </div>
                </div>

                <!-- CCI -->
                <div class="indicator-tile" class:tile-active={isEnabled("cci")} class:tile-inactive={!isEnabled("cci")}>
                    <div class="tile-header">
                        <span class="tile-name">CCI</span>
                        <Toggle bind:checked={settingsState.enabledIndicators.cci} />
                    </div>
                    <div class="tile-params">
                        <Field id="cci-len" label="Length" type="number" bind:value={indicatorState.cci.length} min={2} />
                        <Select id="cci-src" label="Source" bind:value={indicatorState.cci.source} options={["close","open","high","low","hl2","hlc3"]} />
                        <Field id="cci-thr" label="Threshold" type="number" bind:value={indicatorState.cci.threshold} />
                        <Select id="cci-sm-type" label="Smoothing" bind:value={indicatorState.cci.smoothingType} options={["none","sma","ema","smma","wma","vwma","sma_bb"]} />
                        {#if indicatorState.cci.smoothingType !== "none"}
                            <Field id="cci-sm-len" label="Sm. Length" type="number" bind:value={indicatorState.cci.smoothingLength} min={1} />
                        {/if}
                    </div>
                </div>

                <!-- Awesome Oscillator -->
                <div class="indicator-tile" class:tile-active={isEnabled("ao")} class:tile-inactive={!isEnabled("ao")}>
                    <div class="tile-header">
                        <span class="tile-name">Awesome Osc.</span>
                        <Toggle bind:checked={settingsState.enabledIndicators.ao} />
                    </div>
                    <div class="tile-params">
                        <Field id="ao-fast" label="Fast" type="number" bind:value={indicatorState.ao.fastLength} min={1} />
                        <Field id="ao-slow" label="Slow" type="number" bind:value={indicatorState.ao.slowLength} min={1} />
                    </div>
                </div>

                <!-- Momentum -->
                <div class="indicator-tile" class:tile-active={isEnabled("momentum")} class:tile-inactive={!isEnabled("momentum")}>
                    <div class="tile-header">
                        <span class="tile-name">Momentum</span>
                        <Toggle bind:checked={settingsState.enabledIndicators.momentum} />
                    </div>
                    <div class="tile-params">
                        <Field id="mom-len" label="Length" type="number" bind:value={indicatorState.momentum.length} min={1} />
                        <Select id="mom-src" label="Source" bind:value={indicatorState.momentum.source} options={["close","open","high","low","hl2","hlc3"]} />
                    </div>
                </div>
            </div>

        <!-- ═══════════════════════════════════════════ TREND ═══ -->
        {:else if activeCategory === "trend"}
            <div class="tile-grid">

                <!-- MACD -->
                <div class="indicator-tile" class:tile-active={isEnabled("macd")} class:tile-inactive={!isEnabled("macd")}>
                    <div class="tile-header">
                        <span class="tile-name">MACD</span>
                        <Toggle bind:checked={settingsState.enabledIndicators.macd} />
                    </div>
                    <div class="tile-params">
                        <Field id="macd-fast" label="Fast" type="number" bind:value={indicatorState.macd.fastLength} />
                        <Field id="macd-slow" label="Slow" type="number" bind:value={indicatorState.macd.slowLength} />
                        <Field id="macd-sig" label="Signal" type="number" bind:value={indicatorState.macd.signalLength} />
                        <Select id="macd-src" label="Source" bind:value={indicatorState.macd.source} options={["close","open","high","low","hl2","hlc3","ohlc4","hlcc4"]} />
                        <Select id="macd-osc-type" label="Osc. MA Type" bind:value={indicatorState.macd.oscillatorMaType} options={["ema","sma"]} />
                        <Select id="macd-sig-type" label="Signal Type" bind:value={indicatorState.macd.signalMaType} options={["ema","sma"]} />
                    </div>
                </div>

                <!-- EMA -->
                <div class="indicator-tile" class:tile-active={isEnabled("ema")} class:tile-inactive={!isEnabled("ema")}>
                    <div class="tile-header">
                        <span class="tile-name">EMA (3 Lines)</span>
                        <Toggle bind:checked={settingsState.enabledIndicators.ema} />
                    </div>
                    <div class="tile-params">
                        <Field id="ema1" label="EMA 1" type="number" bind:value={indicatorState.ema.ema1.length} min={1} />
                        <Field id="ema2" label="EMA 2" type="number" bind:value={indicatorState.ema.ema2.length} min={1} />
                        <Field id="ema3" label="EMA 3" type="number" bind:value={indicatorState.ema.ema3.length} min={1} />
                        
                        <div class="col-span-2 border-t border-[var(--border-color)] pt-2 mt-1">
                            <span class="text-[10px] text-[var(--text-secondary)] uppercase font-bold px-1">Smoothing (All lines)</span>
                        </div>

                        <Select id="ema-sm-type" label="Smoothing" bind:value={indicatorState.ema.smoothingType} options={["none","sma","ema","smma","wma","vwma","sma_bb"]} />
                        {#if indicatorState.ema.smoothingType !== "none"}
                            <Field id="ema-sm-len" label="Sm. Length" type="number" bind:value={indicatorState.ema.smoothingLength} min={1} />
                        {/if}
                        {#if indicatorState.ema.smoothingType === "sma_bb"}
                            <Field id="ema-sm-bb" label="BB StdDev" type="number" bind:value={indicatorState.ema.bbStdDev} min={0.1} step={0.1} />
                        {/if}

                        <Select id="ema-src" label="Source" bind:value={indicatorState.ema.source} options={["close","open","high","low","hl2","hlc3"]} />
                    </div>
                </div>

                <!-- SMA -->
                <div class="indicator-tile" class:tile-active={isEnabled("sma")} class:tile-inactive={!isEnabled("sma")}>
                    <div class="tile-header">
                        <span class="tile-name">SMA (3 Lines)</span>
                        <Toggle bind:checked={settingsState.enabledIndicators.sma} />
                    </div>
                    <div class="tile-params">
                        <Field id="sma1" label="SMA 1" type="number" bind:value={indicatorState.sma.sma1.length} min={1} />
                        <Field id="sma2" label="SMA 2" type="number" bind:value={indicatorState.sma.sma2.length} min={1} />
                        <Field id="sma3" label="SMA 3" type="number" bind:value={indicatorState.sma.sma3.length} min={1} />
                    </div>
                </div>

                <!-- ADX -->
                <div class="indicator-tile" class:tile-active={isEnabled("adx")} class:tile-inactive={!isEnabled("adx")}>
                    <div class="tile-header">
                        <span class="tile-name">ADX</span>
                        <Toggle bind:checked={settingsState.enabledIndicators.adx} />
                    </div>
                    <div class="tile-params">
                        <Field id="adx-smooth" label="Smoothing" type="number" bind:value={indicatorState.adx.adxSmoothing} min={1} />
                        <Field id="adx-di" label="DI Length" type="number" bind:value={indicatorState.adx.diLength} min={1} />
                        <Field id="adx-thr" label="Threshold" type="number" bind:value={indicatorState.adx.threshold} />
                    </div>
                </div>

                <!-- SuperTrend -->
                <div class="indicator-tile" class:tile-active={isEnabled("superTrend")} class:tile-inactive={!isEnabled("superTrend")}>
                    <div class="tile-header">
                        <span class="tile-name">SuperTrend</span>
                        <Toggle bind:checked={settingsState.enabledIndicators.superTrend} />
                    </div>
                    <div class="tile-params">
                        <Field id="st-fac" label="Factor" type="number" step={0.1} bind:value={indicatorState.superTrend.factor} />
                        <Field id="st-per" label="Period" type="number" bind:value={indicatorState.superTrend.period} />
                    </div>
                </div>

                <!-- Ichimoku -->
                <div class="indicator-tile" class:tile-active={isEnabled("ichimoku")} class:tile-inactive={!isEnabled("ichimoku")}>
                    <div class="tile-header">
                        <span class="tile-name">Ichimoku</span>
                        <Toggle bind:checked={settingsState.enabledIndicators.ichimoku} />
                    </div>
                    <div class="tile-params">
                        <Field id="ich-conv" label="Conversion" type="number" bind:value={indicatorState.ichimoku.conversionPeriod} />
                        <Field id="ich-base" label="Base" type="number" bind:value={indicatorState.ichimoku.basePeriod} />
                        <Field id="ich-spanb" label="Span B" type="number" bind:value={indicatorState.ichimoku.spanBPeriod} />
                        <Field id="ich-disp" label="Displace" type="number" bind:value={indicatorState.ichimoku.displacement} />
                    </div>
                </div>

                <!-- Parabolic SAR -->
                <div class="indicator-tile" class:tile-active={isEnabled("parabolicSar")} class:tile-inactive={!isEnabled("parabolicSar")}>
                    <div class="tile-header">
                        <span class="tile-name">Parabolic SAR</span>
                        <Toggle bind:checked={settingsState.enabledIndicators.parabolicSar} />
                    </div>
                    <div class="tile-params">
                        <Field id="psar-start" label="Start" type="number" step={0.01} bind:value={indicatorState.parabolicSar.start} />
                        <Field id="psar-inc" label="Increment" type="number" step={0.01} bind:value={indicatorState.parabolicSar.increment} />
                        <Field id="psar-max" label="Max" type="number" step={0.01} bind:value={indicatorState.parabolicSar.max} />
                    </div>
                </div>
            </div>

        <!-- ═══════════════════════════════════════════ VOLATILITY ═══ -->
        {:else if activeCategory === "volatility"}
            <div class="tile-grid">

                <!-- Bollinger Bands -->
                <div class="indicator-tile" class:tile-active={isEnabled("bollingerBands")} class:tile-inactive={!isEnabled("bollingerBands")}>
                    <div class="tile-header">
                        <span class="tile-name">Bollinger Bands</span>
                        <Toggle bind:checked={settingsState.enabledIndicators.bollingerBands} />
                    </div>
                    <div class="tile-params">
                        <Field id="bb-len" label="Length" type="number" bind:value={indicatorState.bollingerBands.length} />
                        <Field id="bb-std" label="StdDev" type="number" step={0.1} bind:value={indicatorState.bollingerBands.stdDev} />
                        <Select id="bb-src" label="Source" bind:value={indicatorState.bollingerBands.source} options={["close","open","high","low","hl2","hlc3"]} />
                    </div>
                </div>

                <!-- ATR -->
                <div class="indicator-tile" class:tile-active={isEnabled("atr")} class:tile-inactive={!isEnabled("atr")}>
                    <div class="tile-header">
                        <span class="tile-name">ATR</span>
                        <Toggle bind:checked={settingsState.enabledIndicators.atr} />
                    </div>
                    <div class="tile-params">
                        <Field id="atr-len" label="Length" type="number" bind:value={indicatorState.atr.length} />
                    </div>
                </div>
            </div>

        <!-- ═══════════════════════════════════════════ VOLUME ═══ -->
        {:else if activeCategory === "volume"}
            <div class="tile-grid">

                <!-- VWAP -->
                <div class="indicator-tile" class:tile-active={isEnabled("vwap")} class:tile-inactive={!isEnabled("vwap")}>
                    <div class="tile-header">
                        <span class="tile-name">VWAP</span>
                        <Toggle bind:checked={settingsState.enabledIndicators.vwap} />
                    </div>
                    <div class="tile-params">
                        <Select id="vwap-anchor" label="Anchor" bind:value={indicatorState.vwap.anchor} options={["session","fixed"]} />
                    </div>
                </div>

                <!-- MFI -->
                <div class="indicator-tile" class:tile-active={isEnabled("mfi")} class:tile-inactive={!isEnabled("mfi")}>
                    <div class="tile-header">
                        <span class="tile-name">MFI</span>
                        <Toggle bind:checked={settingsState.enabledIndicators.mfi} />
                    </div>
                    <div class="tile-params">
                        <Field id="mfi-len" label="Length" type="number" bind:value={indicatorState.mfi.length} min={1} />
                    </div>
                </div>

                <!-- Volume MA -->
                <div class="indicator-tile" class:tile-active={isEnabled("volumeMa")} class:tile-inactive={!isEnabled("volumeMa")}>
                    <div class="tile-header">
                        <span class="tile-name">Volume MA</span>
                        <Toggle bind:checked={settingsState.enabledIndicators.volumeMa} />
                    </div>
                    <div class="tile-params">
                        <Field id="vma-len" label="Length" type="number" bind:value={indicatorState.volumeMa.length} />
                        <Select id="vma-type" label="Type" bind:value={indicatorState.volumeMa.maType} options={["sma","ema","wma"]} />
                    </div>
                </div>

                <!-- Volume Profile -->
                <div class="indicator-tile" class:tile-active={isEnabled("volumeProfile")} class:tile-inactive={!isEnabled("volumeProfile")}>
                    <div class="tile-header">
                        <span class="tile-name">Volume Profile</span>
                        <Toggle bind:checked={settingsState.enabledIndicators.volumeProfile} />
                    </div>
                    <div class="tile-params">
                        <Field id="vp-rows" label="Rows" type="number" bind:value={indicatorState.volumeProfile.rows} min={4} max={100} />
                    </div>
                </div>
            </div>

        <!-- ═══════════════════════════════════════════ SIGNALS ═══ -->
        {:else if activeCategory === "signals"}
            <div class="tile-grid">

                <!-- Pivot Points — 4 modes -->
                <div class="indicator-tile tile-wide" class:tile-active={isEnabled("pivots")} class:tile-inactive={!isEnabled("pivots")}>
                    <div class="tile-header">
                        <span class="tile-name">Pivot Points</span>
                        <Toggle
                            checked={isEnabled("pivots")}
                            onchange={(e: Event) => {
                                const val = (e.currentTarget as HTMLInputElement).checked;
                                settingsState.enabledIndicators.pivots = val;
                                settingsState.showTechnicalsPivots = val;
                            }}
                        />
                    </div>
                    <div class="tile-params">
                        <div class="col-span-full flex flex-col gap-1.5">
                            <span class="text-[10px] font-semibold text-[var(--text-secondary)] uppercase">Mode</span>
                            <div class="grid grid-cols-4 gap-1">
                                {#each pivotTypes as pt}
                                    <button
                                        class="py-1.5 text-xs font-bold rounded border transition-all {indicatorState.pivots.type === pt.value
                                            ? 'bg-[var(--accent-color)] text-[var(--btn-accent-text)] border-[var(--accent-color)]'
                                            : 'bg-[var(--bg-tertiary)] border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-color)]'}"
                                        onclick={() => (indicatorState.pivots = { ...indicatorState.pivots, type: pt.value as any })}
                                    >
                                        {pt.label}
                                    </button>
                                {/each}
                            </div>
                            <p class="text-[10px] text-[var(--text-secondary)] mt-0.5">
                                {#if indicatorState.pivots.type === "fibonacci"}
                                    Fibonacci ratios: 38.2% · 61.8% · 100%
                                {:else if indicatorState.pivots.type === "woodie"}
                                    Close-weighted: P = (H+L+2C)/4
                                {:else if indicatorState.pivots.type === "camarilla"}
                                    Tight S/R levels based on ATR range
                                {:else}
                                    Standard: P = (H+L+C)/3 with R1/R2/R3 · S1/S2/S3
                                {/if}
                            </p>
                        </div>
                    </div>
                </div>

                <!-- Divergences — displayed in Signals section of panel -->
                <div class="indicator-tile" class:tile-active={isEnabled("divergences")} class:tile-inactive={!isEnabled("divergences")}>
                    <div class="tile-header">
                        <span class="tile-name">Divergences</span>
                        <Toggle bind:checked={settingsState.enabledIndicators.divergences} />
                    </div>
                    <div class="tile-params">
                        <p class="text-[10px] text-[var(--text-secondary)] col-span-full leading-relaxed">
                            RSI, MACD, CCI, Stoch divergences.<br/>
                            Shown in <strong>Signals</strong> panel section.
                        </p>
                    </div>
                </div>

                <!-- Market Structure -->
                <div class="indicator-tile" class:tile-active={isEnabled("marketStructure")} class:tile-inactive={!isEnabled("marketStructure")}>
                    <div class="tile-header">
                        <span class="tile-name">Market Structure</span>
                        <Toggle bind:checked={settingsState.enabledIndicators.marketStructure} />
                    </div>
                    <div class="tile-params">
                        <p class="text-[10px] text-[var(--text-secondary)] col-span-full">
                            HH/HL/LH/LL swing detection. <br/>
                            Shown in <strong>Signals</strong> panel section.
                        </p>
                    </div>
                </div>
            </div>
        {/if}
    </div>
</div>

<style>
    .input-field {
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 0.5rem;
        padding: 0.4rem 0.6rem;
        font-size: 0.8rem;
        color: var(--text-primary);
        outline: none;
        width: 100%;
        transition: border-color 0.15s;
    }
    .input-field:focus { border-color: var(--accent-color); }

    .toggle-card {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.75rem 1rem;
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 0.75rem;
        cursor: pointer;
        transition: border-color 0.15s;
    }
    .toggle-card:hover { border-color: var(--accent-color); }

    .field-group {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
    }
    .field-group label {
        font-size: 0.65rem;
        font-weight: 700;
        color: var(--text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.04em;
    }

    /* Tile Grid */
    .tile-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.5rem;
    }
    .indicator-tile {
        border-radius: 0.75rem;
        border: 1px solid var(--border-color);
        padding: 0.625rem;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        transition: border-color 0.2s, opacity 0.2s, background 0.2s;
    }
    .tile-wide {
        grid-column: span 2;
    }
    .tile-active {
        background: var(--bg-secondary);
        border-color: var(--accent-color);
        opacity: 1;
    }
    .tile-inactive {
        background: var(--bg-primary);
        border-color: var(--border-color);
        opacity: 0.55;
    }
    .tile-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }
    .tile-name {
        font-size: 0.65rem;
        font-weight: 900;
        text-transform: uppercase;
        letter-spacing: 0.07em;
        color: var(--text-primary);
    }
    .tile-params {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.35rem 0.45rem;
    }

    @media (max-width: 480px) {
        .tile-grid { grid-template-columns: 1fr; }
        .tile-wide { grid-column: span 1; }
    }
</style>
