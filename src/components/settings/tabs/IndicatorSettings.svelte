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
    import { _ } from "../../../locales/i18n";
    import Toggle from "../../shared/Toggle.svelte";
    import { enhancedInput } from "../../../lib/actions/inputEnhancements";
    import TimeframeSelector from "../../shared/TimeframeSelector.svelte";
    import { settingsState } from "../../../stores/settings.svelte";
    import { indicatorState } from "../../../stores/indicator.svelte";
    import { uiState } from "../../../stores/ui.svelte";
    import Field from "./IndicatorField.svelte";
    import Select from "./IndicatorSelect.svelte";

    // Re-use logic from AnalysisTab
    export const availableTimeframes = [
        "1m",
        "3m",
        "5m",
        "15m",
        "30m",
        "1h",
        "2h",
        "4h",
        "6h",
        "8h",
        "12h",
        "1d",
        "3d",
        "1w",
        "1M",
    ];

    const activeCategory = $derived(uiState.settingsIndicatorCategory);

    const categories = [
        { id: "general", label: $_("settings.tabs.general") },
        { id: "oscillators", label: $_("settings.technicals.oscillators") },
        { id: "trend", label: $_("settings.indicators.trend") },
        { id: "volatility", label: $_("settings.indicators.volatility") },
        { id: "volume", label: $_("settings.indicators.volume") },
    ] as const;

    const pnlModes = [
        { value: "value", label: $_("settings.technicals.pnlModes.absolute") },
        { value: "percent", label: $_("settings.technicals.pnlModes.percent") },
        { value: "bar", label: $_("settings.technicals.pnlModes.bar") },
    ];

    const pivotModes = [
        { value: "classic", label: "Classic" },
        { value: "woodie", label: "Woodie" },
        { value: "camarilla", label: "Camarilla" },
        { value: "fibonacci", label: "Fibonacci" },
    ];
</script>

<div class="indicator-settings flex flex-col gap-4">
    <!-- Sub-Navigation -->
    <div
        class="flex flex-wrap gap-2 border-b border-[var(--border-color)] pb-2 mb-2"
    >
        {#each categories as category}
            <button
                class="category-btn px-4 py-2 text-xs font-black uppercase tracking-widest rounded-lg transition-all {activeCategory ===
                category.id
                    ? 'bg-[var(--accent-color)] text-[var(--btn-accent-text)] shadow-lg scale-105 z-10'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]'}"
                onclick={() =>
                    (uiState.settingsIndicatorCategory = category.id)}
            >
                {category.label}
            </button>
        {/each}
    </div>

    <!-- Content -->
    <div class="flex flex-col gap-6">
        {#if activeCategory === "general"}
            <section class="settings-section">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <!-- Precision -->
                    <div class="field-group">
                        <label for="precision">{$_("settings.technicals.precision")}</label>
                        <input
                            id="precision"
                            type="number"
                            bind:value={indicatorState.precision}
                            min="0"
                            max="8"
                            class="input-field"
                        />
                    </div>
                    <!-- History Limit -->
                    <div class="field-group">
                        <label for="history-limit"
                            >{$_("settings.technicals.historyLimit")}</label
                        >
                        <input
                            id="history-limit"
                            type="number"
                            bind:value={indicatorState.historyLimit}
                            min="100"
                            max="10000"
                            step="100"
                            class="input-field"
                        />
                    </div>
                    
                    <!-- Performance Optimization -->
                    <div class="mt-6 p-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)]">
                        <h4 class="text-xs font-bold uppercase mb-3 text-[var(--text-primary)]">
                            {$_("settings.technicals.optimization.title")}
                        </h4>
                        
                        <label class="toggle-card mb-3">
                            <div class="flex flex-col">
                                <span class="text-sm font-medium">{$_("settings.technicals.optimization.autoOptimize")}</span>
                                <span class="text-[10px] text-[var(--text-secondary)]">
                                    {$_("settings.technicals.optimization.autoOptimizeDesc")}
                                </span>
                            </div>
                            <Toggle bind:checked={indicatorState.autoOptimize} />
                        </label>
                        
                        <div class="grid grid-cols-2 gap-3">
                            <div class="field-group">
                                <label for="preferred-engine" class="text-xs font-semibold mb-1 block">
                                    {$_("settings.technicals.optimization.preferredEngine")}
                                </label>
                                <select 
                                    id="preferred-engine"
                                    bind:value={indicatorState.preferredEngine}
                                    class="input-field"
                                >
                                    <option value="auto">{$_("settings.technicals.optimization.engines.auto")}</option>
                                    <option value="ts">{$_("settings.technicals.optimization.engines.ts")}</option>
                                    <option value="wasm">{$_("settings.technicals.optimization.engines.wasm")}</option>
                                    <option value="gpu">{$_("settings.technicals.optimization.engines.gpu")}</option>
                                </select>
                            </div>
                            
                            <div class="field-group">
                                <label for="performance-mode" class="text-xs font-semibold mb-1 block">
                                    {$_("settings.technicals.optimization.performanceMode")}
                                </label>
                                <select 
                                    id="performance-mode"
                                    bind:value={indicatorState.performanceMode}
                                    class="input-field"
                                >
                                    <option value="speed">{$_("settings.technicals.optimization.modes.speed")}</option>
                                    <option value="balanced">{$_("settings.technicals.optimization.modes.balanced")}</option>
                                    <option value="quality">{$_("settings.technicals.optimization.modes.quality")}</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>

                <label class="toggle-card mt-4">
                    <div class="flex flex-col">
                        <span class="text-sm font-medium"
                            >{$_("settings.technicals.syncRsi")}</span
                        >
                        <span class="text-[10px] text-[var(--text-secondary)]"
                            >{$_("settings.technicals.syncRsiDesc")}</span
                        >
                    </div>
                    <Toggle bind:checked={settingsState.syncRsiTimeframe} />
                </label>

                <!-- PnL Mode -->
                <div class="field-group mt-4">
                    <span
                        class="text-xs font-semibold text-[var(--text-secondary)] mb-2"
                        >{$_("settings.technicals.pnlMode")}</span
                    >
                    <div class="flex gap-2">
                        {#each pnlModes as mode}
                            <button
                                class="flex-1 px-3 py-2 text-xs font-bold rounded-lg border transition-all {settingsState.pnlViewMode ===
                                mode.value
                                    ? 'bg-[var(--accent-color)] text-[var(--btn-accent-text)] border-[var(--accent-color)] shadow-md'
                                    : 'bg-[var(--bg-secondary)] border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-color)]'}"
                                onclick={() =>
                                    (settingsState.pnlViewMode =
                                        mode.value as any)}
                            >
                                {mode.label}
                            </button>
                        {/each}
                    </div>
                </div>

                <!-- Timeframes -->
                <div class="mt-4">
                    <span
                        class="text-xs font-semibold text-[var(--text-secondary)] mb-2 block"
                        >{$_("settings.technicals.favorites")}</span
                    >
                    <TimeframeSelector
                        bind:selected={settingsState.favoriteTimeframes}
                        options={availableTimeframes}
                    />
                </div>
            </section>
        {:else if activeCategory === "oscillators"}
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <!-- RSI -->
                <div class="p-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)]">
                    <div class="flex justify-between items-center mb-2">
                        <h4 class="text-xs font-bold uppercase">{$_("settings.technicals.rsi.title")}</h4>
                        <Toggle bind:checked={settingsState.enabledIndicators.rsi} />
                    </div>
                    <div class="grid grid-cols-2 gap-2">
                        <Field id="rsi-len" label={$_("settings.technicals.labels.length")} type="number" bind:value={indicatorState.rsi.length} min={2} />
                        <Select id="rsi-src" label={$_("settings.technicals.labels.source")} bind:value={indicatorState.rsi.source} options={["close", "open", "high", "low", "hl2", "hlc3"]} />
                        <Field id="rsi-sm-len" label="Sm. Length" type="number" bind:value={indicatorState.rsi.signalLength} min={1} />
                        <Select id="rsi-sm-type" label="Smoothing" bind:value={indicatorState.rsi.signalType} options={["sma", "ema"]} />
                        <Field id="rsi-ob" label="Overbought" type="number" bind:value={indicatorState.rsi.overbought} min={50} max={100} />
                        <Field id="rsi-os" label="Oversold" type="number" bind:value={indicatorState.rsi.oversold} min={0} max={50} />
                    </div>
                </div>

                <!-- Stoch RSI -->
                <div class="p-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)]">
                    <div class="flex justify-between items-center mb-2">
                        <h4 class="text-xs font-bold uppercase">{$_("settings.technicals.stochRsi.title")}</h4>
                        <Toggle bind:checked={settingsState.enabledIndicators.stochRsi} />
                    </div>
                    <div class="grid grid-cols-2 gap-2">
                        <Field id="srsi-len" label="Stoch Len" type="number" bind:value={indicatorState.stochRsi.length} min={2} />
                        <Field id="srsi-rlen" label="RSI Len" type="number" bind:value={indicatorState.stochRsi.rsiLength} min={2} />
                        <Field id="srsi-k" label="%K Period" type="number" bind:value={indicatorState.stochRsi.kPeriod} />
                        <Field id="srsi-d" label="%D Period" type="number" bind:value={indicatorState.stochRsi.dPeriod} />
                        <Select id="srsi-src" label="RSI Source" bind:value={indicatorState.stochRsi.source} options={["close"]} />
                    </div>
                </div>

                <!-- Stochastic -->
                <div class="p-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)]">
                    <div class="flex justify-between items-center mb-2">
                        <h4 class="text-xs font-bold uppercase">STOCHASTIC</h4>
                        <Toggle bind:checked={settingsState.enabledIndicators.stochastic} />
                    </div>
                    <div class="grid grid-cols-2 gap-2">
                        <Field id="stoch-k" label="%K Period" type="number" bind:value={indicatorState.stochastic.kPeriod} />
                        <Field id="stoch-ks" label="%K Smooth" type="number" bind:value={indicatorState.stochastic.kSmoothing} />
                        <Field id="stoch-d" label="%D Period" type="number" bind:value={indicatorState.stochastic.dPeriod} />
                    </div>
                </div>

                <!-- Williams %R -->
                <div class="p-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)]">
                    <div class="flex justify-between items-center mb-2">
                        <h4 class="text-xs font-bold uppercase">WILLIAMS %R</h4>
                        <Toggle bind:checked={settingsState.enabledIndicators.williamsR} />
                    </div>
                    <div class="grid grid-cols-2 gap-2">
                        <Field id="wr-len" label="Length" type="number" bind:value={indicatorState.williamsR.length} />
                        <!-- Assuming source is fixed or configurable if needed -->
                    </div>
                </div>

                <!-- CCI -->
                <div class="p-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)]">
                    <div class="flex justify-between items-center mb-2">
                        <h4 class="text-xs font-bold uppercase">CCI</h4>
                        <Toggle bind:checked={settingsState.enabledIndicators.cci} />
                    </div>
                    <div class="grid grid-cols-2 gap-2">
                        <Field id="cci-len" label="Length" type="number" bind:value={indicatorState.cci.length} />
                        <Select id="cci-src" label="Source" bind:value={indicatorState.cci.source} options={["close", "hlc3", "hl2"]} />
                        <Field id="cci-thr" label="Threshold" type="number" bind:value={indicatorState.cci.threshold} />
                        <Select id="cci-sm" label="Smoothing" bind:value={indicatorState.cci.smoothingType} options={["sma", "ema"]} />
                        <Field id="cci-sml" label="Sm. Length" type="number" bind:value={indicatorState.cci.smoothingLength} />
                    </div>
                </div>

                <!-- Awesome Osc -->
                <div class="p-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)]">
                    <div class="flex justify-between items-center mb-2">
                        <h4 class="text-xs font-bold uppercase">AWESOME OSC.</h4>
                        <Toggle bind:checked={settingsState.enabledIndicators.ao} />
                    </div>
                    <div class="grid grid-cols-2 gap-2">
                        <Field id="ao-fast" label="Fast" type="number" bind:value={indicatorState.ao.fastLength} />
                        <Field id="ao-slow" label="Slow" type="number" bind:value={indicatorState.ao.slowLength} />
                    </div>
                </div>

                 <!-- Divergences -->
                 <div class="p-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)] col-span-1 md:col-span-2">
                    <div class="flex justify-between items-center mb-2">
                        <h4 class="text-xs font-bold uppercase">Divergences</h4>
                        <Toggle bind:checked={settingsState.enabledIndicators.divergences} />
                    </div>
                    <div class="text-[10px] text-[var(--text-secondary)]">
                        RSI, MACD, CCI, Stoch divergences. Shown in Signals panel section.
                    </div>
                </div>
            </div>
        {:else if activeCategory === "trend"}
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <!-- MACD -->
                <div class="p-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)]">
                    <div class="flex justify-between items-center mb-2">
                        <h4 class="text-xs font-bold uppercase">{$_("settings.technicals.macd.title")}</h4>
                        <Toggle bind:checked={settingsState.enabledIndicators.macd} />
                    </div>
                    <div class="grid grid-cols-3 gap-2">
                        <Field id="macd-fast" label={$_("settings.technicals.labels.fast")} type="number" bind:value={indicatorState.macd.fastLength} />
                        <Field id="macd-slow" label={$_("settings.technicals.labels.slow")} type="number" bind:value={indicatorState.macd.slowLength} />
                        <Field id="macd-sig" label={$_("settings.technicals.labels.signal")} type="number" bind:value={indicatorState.macd.signalLength} />
                    </div>
                </div>

                <!-- SuperTrend -->
                <div class="p-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)]">
                    <div class="flex justify-between items-center mb-2">
                        <h4 class="text-xs font-bold uppercase">{$_("settings.technicals.superTrend.title")}</h4>
                        <Toggle bind:checked={settingsState.enabledIndicators.superTrend} />
                    </div>
                    <div class="grid grid-cols-2 gap-2">
                        <Field id="st-fac" label={$_("settings.technicals.labels.factor")} type="number" step={0.1} bind:value={indicatorState.superTrend.factor} />
                        <Field id="st-per" label={$_("settings.technicals.labels.period")} type="number" bind:value={indicatorState.superTrend.period} />
                    </div>
                </div>

                <!-- Parabolic SAR -->
                <div class="p-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)]">
                    <div class="flex justify-between items-center mb-2">
                        <h4 class="text-xs font-bold uppercase">Parabolic SAR</h4>
                        <Toggle bind:checked={settingsState.enabledIndicators.parabolicSar} />
                    </div>
                    <div class="grid grid-cols-2 gap-2">
                        <Field id="psar-start" label="Start" type="number" step={0.01} bind:value={indicatorState.parabolicSar.start} />
                        <Field id="psar-inc" label="Increment" type="number" step={0.01} bind:value={indicatorState.parabolicSar.increment} />
                        <Field id="psar-max" label="Max" type="number" step={0.01} bind:value={indicatorState.parabolicSar.max} />
                    </div>
                </div>

                <!-- Ichimoku -->
                <div class="p-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)]">
                    <div class="flex justify-between items-center mb-2">
                        <h4 class="text-xs font-bold uppercase">Ichimoku</h4>
                        <Toggle bind:checked={settingsState.enabledIndicators.ichimoku} />
                    </div>
                    <div class="grid grid-cols-2 gap-2">
                        <Field id="ichi-conv" label="Conversion" type="number" bind:value={indicatorState.ichimoku.conversionPeriod} />
                        <Field id="ichi-base" label="Base" type="number" bind:value={indicatorState.ichimoku.basePeriod} />
                        <Field id="ichi-spanb" label="Span B" type="number" bind:value={indicatorState.ichimoku.spanBPeriod} />
                        <Field id="ichi-disp" label="Displacement" type="number" bind:value={indicatorState.ichimoku.displacement} />
                    </div>
                </div>

                <!-- ADX -->
                <div class="p-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)]">
                    <div class="flex justify-between items-center mb-2">
                        <h4 class="text-xs font-bold uppercase">ADX</h4>
                        <Toggle bind:checked={settingsState.enabledIndicators.adx} />
                    </div>
                    <div class="grid grid-cols-2 gap-2">
                        <Field id="adx-sm" label="Smoothing" type="number" bind:value={indicatorState.adx.adxSmoothing} />
                        <Field id="adx-di" label="DI Length" type="number" bind:value={indicatorState.adx.diLength} />
                        <Field id="adx-thr" label="Threshold" type="number" bind:value={indicatorState.adx.threshold} />
                    </div>
                </div>

                <!-- Moving Averages Group (New) -->
                <div class="p-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)] col-span-1 md:col-span-2">
                    <div class="flex justify-between items-center mb-2">
                        <h4 class="text-xs font-bold uppercase">Moving Averages</h4>
                    </div>
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div class="flex flex-col gap-2">
                            <div class="flex justify-between items-center"><span class="text-xs font-semibold">SMA</span><Toggle bind:checked={settingsState.enabledIndicators.sma} /></div>
                            <Field id="sma1" label="Len 1" type="number" bind:value={indicatorState.sma.sma1.length} />
                            <Field id="sma2" label="Len 2" type="number" bind:value={indicatorState.sma.sma2.length} />
                            <Field id="sma3" label="Len 3" type="number" bind:value={indicatorState.sma.sma3.length} />
                        </div>
                        <div class="flex flex-col gap-2">
                            <div class="flex justify-between items-center"><span class="text-xs font-semibold">EMA</span><Toggle bind:checked={settingsState.enabledIndicators.ema} /></div>
                            <Field id="ema1" label="Len 1" type="number" bind:value={indicatorState.ema.ema1.length} />
                            <Field id="ema2" label="Len 2" type="number" bind:value={indicatorState.ema.ema2.length} />
                            <Field id="ema3" label="Len 3" type="number" bind:value={indicatorState.ema.ema3.length} />
                        </div>
                        <div class="flex flex-col gap-2">
                            <div class="flex justify-between items-center"><span class="text-xs font-semibold">WMA</span><Toggle bind:checked={settingsState.enabledIndicators.wma} /></div>
                            <Field id="wma" label="Length" type="number" bind:value={indicatorState.wma.length} />
                        </div>
                        <div class="flex flex-col gap-2">
                            <div class="flex justify-between items-center"><span class="text-xs font-semibold">VWMA</span><Toggle bind:checked={settingsState.enabledIndicators.vwma} /></div>
                            <Field id="vwma" label="Length" type="number" bind:value={indicatorState.vwma.length} />
                            <div class="flex justify-between items-center mt-2"><span class="text-xs font-semibold">HMA</span><Toggle bind:checked={settingsState.enabledIndicators.hma} /></div>
                            <Field id="hma" label="Length" type="number" bind:value={indicatorState.hma.length} />
                        </div>
                    </div>
                </div>

                <!-- Pivot Points Card -->
                <div class="p-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)] col-span-1 md:col-span-2">
                    <div class="flex justify-between items-center mb-4">
                        <h4 class="text-xs font-bold uppercase">{$_("settings.technicals.pivots")}</h4>
                        <Toggle bind:checked={settingsState.enabledIndicators.pivots} />
                    </div>
                    <div class="flex flex-col gap-2">
                        <span class="text-xs text-[var(--text-secondary)] uppercase font-semibold">Mode</span>
                        <div class="flex rounded-md overflow-hidden border border-[var(--border-color)]">
                            {#each pivotModes as mode}
                                <button
                                    class="flex-1 py-2 text-xs font-medium transition-colors
                                    {indicatorState.pivots.type === mode.value ? 'bg-[var(--accent-color)] text-[var(--btn-accent-text)]' : 'bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'}"
                                    onclick={() => indicatorState.pivots.type = mode.value as any}
                                >
                                    {mode.label}
                                </button>
                            {/each}
                        </div>
                        {#if indicatorState.pivots.type === 'fibonacci'}
                            <span class="text-[10px] text-[var(--text-tertiary)] mt-1">Fibonacci ratios: 38.2% · 61.8% · 100%</span>
                        {/if}
                    </div>
                </div>

                <!-- Market Structure -->
                <div class="p-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)] col-span-1 md:col-span-2">
                    <div class="flex justify-between items-center mb-2">
                        <h4 class="text-xs font-bold uppercase">Market Structure</h4>
                        <Toggle bind:checked={settingsState.enabledIndicators.marketStructure} />
                    </div>
                    <div class="text-[10px] text-[var(--text-secondary)]">
                        HH/HL/LH/LL swing detection. Shown in Signals panel section.
                    </div>
                </div>
            </div>
        {:else if activeCategory === "volatility"}
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <!-- Bollinger -->
                <div class="p-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)]">
                    <div class="flex justify-between items-center mb-2">
                        <h4 class="text-xs font-bold uppercase">{$_("settings.technicals.bollingerBands.title")}</h4>
                        <Toggle bind:checked={settingsState.enabledIndicators.bollingerBands} />
                    </div>
                    <div class="grid grid-cols-2 gap-2">
                        <Field id="bb-len" label={$_("settings.technicals.labels.length")} type="number" bind:value={indicatorState.bollingerBands.length} />
                        <Field id="bb-std" label={$_("settings.technicals.bollingerBands.stdDev")} type="number" step={0.1} bind:value={indicatorState.bollingerBands.stdDev} />
                        <Select id="bb-src" label="Source" bind:value={indicatorState.bollingerBands.source} options={["close", "open", "high", "low", "hl2", "hlc3"]} />
                    </div>
                </div>
                <!-- ATR -->
                <div class="p-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)]">
                    <div class="flex justify-between items-center mb-2">
                        <h4 class="text-xs font-bold uppercase">{$_("settings.technicals.atr")}</h4>
                        <Toggle bind:checked={settingsState.enabledIndicators.atr} />
                    </div>
                    <div class="grid grid-cols-2 gap-2">
                        <Field id="atr-len" label={$_("settings.technicals.labels.length")} type="number" bind:value={indicatorState.atr.length} />
                    </div>
                </div>
                <!-- Choppiness -->
                <div class="p-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)]">
                    <div class="flex justify-between items-center mb-2">
                        <h4 class="text-xs font-bold uppercase">Choppiness Index</h4>
                        <!-- No toggle for choppiness in basic enabledIndicators? Assuming always active or bundled -->
                        <!-- Actually it is just calculated if in Advanced section usually. Adding toggle if it exists. -->
                    </div>
                    <div class="grid grid-cols-2 gap-2">
                        <Field id="chop-len" label="Length" type="number" bind:value={indicatorState.choppiness.length} />
                    </div>
                </div>
            </div>
        {:else if activeCategory === "volume"}
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <!-- Volume MA -->
                <div class="p-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)]">
                    <div class="flex justify-between items-center mb-2">
                        <h4 class="text-xs font-bold uppercase">{$_("settings.technicals.volumeMa.title")}</h4>
                        <Toggle bind:checked={settingsState.enabledIndicators.volumeMa} />
                    </div>
                    <div class="grid grid-cols-2 gap-2">
                        <Field id="vma-len" label={$_("settings.technicals.labels.length")} type="number" bind:value={indicatorState.volumeMa.length} />
                        <Select id="vma-type" label={$_("settings.technicals.labels.type")} bind:value={indicatorState.volumeMa.maType} options={["sma", "ema", "wma"]} />
                    </div>
                </div>

                <!-- Volume Profile -->
                <div class="p-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)]">
                    <div class="flex justify-between items-center mb-2">
                        <h4 class="text-xs font-bold uppercase">Volume Profile</h4>
                        <Toggle bind:checked={settingsState.enabledIndicators.volumeProfile} />
                    </div>
                    <div class="grid grid-cols-2 gap-2">
                        <Field id="vp-rows" label="Rows" type="number" bind:value={indicatorState.volumeProfile.rows} />
                    </div>
                </div>
            </div>
        {/if}
    </div>
</div>

<style>
    .input-field {
        background-color: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 0.5rem;
        padding: 0.5rem 0.75rem;
        font-size: 0.875rem;
        color: var(--text-primary);
        outline: none;
        width: 100%;
    }
    .toggle-card {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 1rem;
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 0.75rem;
        cursor: pointer;
    }
</style>
