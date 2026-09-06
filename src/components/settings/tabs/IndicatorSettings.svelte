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
    import { _ } from "../../../locales/i18n";
    import { indicatorState } from "../../../stores/indicator.svelte";
    import { settingsState, type PnlViewMode } from "../../../stores/settings.svelte";
    import type { IndicatorSettings } from "../../../types/indicators";
    import Toggle from "../../shared/Toggle.svelte";
    import Field from "./IndicatorField.svelte";
    import Select from "./IndicatorSelect.svelte";
    import TimeframeSelector from "../../shared/TimeframeSelector.svelte";
    import IndicatorCard from "./IndicatorCard.svelte";

    // Tabs
    const tabs = [
        { id: "general", label: $_("settings.technicals.tabs.general") },
        { id: "oscillators", label: $_("settings.technicals.tabs.oscillators") },
        { id: "trend", label: $_("settings.technicals.tabs.trend") },
        { id: "volatility", label: $_("settings.technicals.tabs.volatility") },
        { id: "volume", label: $_("settings.technicals.tabs.volume") },
        { id: "chart", label: $_("settings.technicals.tabs.chart") },
    ];
    let activeCategory = $state("general");

    const availableTimeframes = [
        "1m", "5m", "15m", "30m", "1h", "4h", "12h", "1d", "3d", "1w", "1M"
    ];

    // Options
    const sourceOptions = ["close", "open", "high", "low", "hl2", "hlc3"];
    const pivotTypes = [
        { value: "classic", label: $_("settings.technicals.pivotClassic") },
        { value: "woodie", label: $_("settings.technicals.pivotWoodie") },
        { value: "camarilla", label: $_("settings.technicals.pivotCamarilla") },
        { value: "fibonacci", label: $_("settings.technicals.pivotFibonacci") }
    ];
</script>

<div class="flex flex-col gap-3 sm:gap-4 md:gap-6 h-full bg-[var(--bg-primary)] text-[var(--text-primary)]">
    <!-- Tabs -->
    <div class="flex border-b border-[var(--border-color)] overflow-x-auto no-scrollbar bg-[var(--bg-tertiary)] pt-1 px-2">
        {#each tabs as tab}
            <button
                class="px-5 py-3 text-sm font-semibold whitespace-nowrap transition-all duration-200 relative {activeCategory === tab.id
                    ? 'text-[var(--accent-color)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] rounded-t-lg'}"
                onclick={() => (activeCategory = tab.id)}
            >
                {tab.label}
                {#if activeCategory === tab.id}
                    <div
                        class="absolute bottom-0 left-0 w-full h-0.5 bg-[var(--accent-color)] shadow-[0_-1px_4px_var(--accent-color)]"
                    ></div>
                {/if}
            </button>
        {/each}
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {#if activeCategory === "general"}
            <div class="space-y-6 max-w-5xl mx-auto">
                <!-- Panel Sections Visibility -->
                <section class="bg-[var(--bg-secondary)] rounded-xl p-5 border border-[var(--border-color)] shadow-sm">
                    <h4 class="text-sm font-semibold tracking-wide text-[var(--text-primary)] mb-4 pb-2 border-b border-[var(--border-color)] flex items-center justify-between">
                        <span>{$_("settings.technicals.panelConfiguration")}</span>
                        <span class="text-xs font-normal text-[var(--text-secondary)]">{$_("settings.technicals.toggleVisibility")}</span>
                    </h4>
                    <div class="space-y-3">
                        <div class="flex justify-between items-center">
                            <span class="text-sm">{$_("settings.technicals.summary")}</span>
                            <Toggle bind:checked={indicatorState.panelSections.summary} />
                        </div>
                        <div class="flex justify-between items-center">
                            <span class="text-sm">{$_("settings.technicals.oscillatorsTitle")}</span>
                            <Toggle bind:checked={indicatorState.panelSections.oscillators} />
                        </div>
                        <div class="flex justify-between items-center">
                            <span class="text-sm">{$_("settings.technicals.movingAveragesTitle")}</span>
                            <Toggle bind:checked={indicatorState.panelSections.movingAverages} />
                        </div>
                        <div class="flex justify-between items-center">
                            <span class="text-sm">{$_("settings.technicals.pivotsTitle")}</span>
                            <Toggle bind:checked={indicatorState.panelSections.pivots} />
                        </div>
                        <div class="flex justify-between items-center">
                            <span class="text-sm">{$_("settings.technicals.marketConfluence")}</span>
                            <Toggle bind:checked={indicatorState.panelSections.confluence} />
                        </div>
                        <div class="flex justify-between items-center">
                            <span class="text-sm">{$_("settings.technicals.tabs.volatility")}</span>
                            <Toggle bind:checked={indicatorState.panelSections.volatility} />
                        </div>
                        <div class="flex justify-between items-center">
                            <span class="text-sm">{$_("settings.technicals.advancedTitle")}</span>
                            <Toggle bind:checked={indicatorState.panelSections.advanced} />
                        </div>
                        <div class="flex justify-between items-center">
                            <span class="text-sm">{$_("settings.technicals.signals")}</span>
                            <Toggle bind:checked={indicatorState.panelSections.signals} />
                        </div>
                        <div class="flex justify-between items-center gap-3">
                            <span class="text-sm">{$_("settings.technicals.fullHeight")}</span>
                            <Toggle bind:checked={settingsState.technicalsFullHeight} />
                        </div>
                        <p class="text-xs text-[var(--text-secondary)] -mt-2">{$_("settings.technicals.fullHeightDesc")}</p>
                    </div>
                </section>

                <!-- Global Settings -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <section class="p-5 bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-color)] shadow-sm">
                        <h4 class="text-sm font-semibold tracking-wide text-[var(--text-primary)] mb-4 pb-2 border-b border-[var(--border-color)]">
                            {$_("settings.technicals.calculationEngine")}
                        </h4>
                        <div class="space-y-2">
                             <Field
                                id="hist-limit"
                                label={$_("settings.technicals.historyLimit")}
                                type="number"
                                bind:value={indicatorState.historyLimit}
                                step={50}
                            />
                            <div class="flex justify-between items-center pt-2">
                                <span class="text-sm">{$_("settings.technicals.optimization.autoOptimize")}</span>
                                <Toggle bind:checked={indicatorState.autoOptimize} />
                            </div>
                            <!-- Performance -->
                            <div class="flex flex-col gap-2 pt-2 border-t border-[var(--border-color)] mt-2">
                                <Select
                                    id="perf-engine"
                                    label={$_("settings.technicals.engine")}
                                    bind:value={indicatorState.preferredEngine}
                                    options={[{value: "auto", label: $_("settings.technicals.optimization.engines.auto")}, {value: "ts", label: $_("settings.technicals.optimization.engines.ts")}, {value: "wasm", label: $_("settings.technicals.optimization.engines.wasm")}, {value: "gpu", label: $_("settings.technicals.optimization.engines.gpu")}]}
                                />
                                <Select
                                    id="perf-mode"
                                    label={$_("settings.technicals.mode")}
                                    bind:value={indicatorState.performanceMode}
                                    options={[{value: "balanced", label: $_("settings.technicals.optimization.modes.balanced")}, {value: "quality", label: $_("settings.technicals.optimization.modes.quality")}, {value: "speed", label: $_("settings.technicals.optimization.modes.speed")}]}
                                />
                            </div>
                            <div class="flex justify-between items-center pt-2 border-t border-[var(--border-color)] mt-2">
                                <span class="text-sm">{$_("settings.technicals.syncRsi")}</span>
                                <Toggle bind:checked={settingsState.syncRsiTimeframe} />
                            </div>
                        </div>
                    </section>

                    <section class="p-5 bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-color)] shadow-sm">
                         <h4 class="text-sm font-semibold tracking-wide text-[var(--text-primary)] mb-4 pb-2 border-b border-[var(--border-color)]">
                            {$_("settings.technicals.displayPreferences")}
                        </h4>
                         <div class="space-y-2">
                             <Field
                                 id="precision"
                                 label={$_("settings.technicals.precision")}
                                 type="number"
                                 bind:value={indicatorState.precision}
                                 min={0}
                                 max={8}
                             />
                             <Field
                                 id="linewidth"
                                 label={$_("settings.technicals.lineWidth")}
                                 type="number"
                                 bind:value={indicatorState.lineWidth}
                                 min={1}
                                 max={4}
                             />
                            <div class="flex flex-col gap-2 mt-2">
                                <span class="text-xs text-[var(--text-secondary)]">{$_("settings.technicals.pnlMode")}</span>
                                <div class="flex bg-[var(--bg-tertiary)] rounded p-1">
                                    {#each [{ value: "value", label: $_("settings.technicals.pnlModes.absolute") }, { value: "percent", label: $_("settings.technicals.pnlModes.percent") }, { value: "bar", label: $_("settings.technicals.pnlModes.bar") }] as mode}
                                        <button
                                            class="flex-1 text-xs py-1 rounded transition-colors {settingsState.pnlViewMode === mode.value ? 'bg-[var(--accent-color)] text-[var(--btn-accent-text)]' : 'text-[var(--text-secondary)]'}"
                                            onclick={() => (settingsState.pnlViewMode = mode.value as PnlViewMode)}
                                        >
                                            {mode.label}
                                        </button>
                                    {/each}
                                </div>
                            </div>
                         </div>
                    </section>
                </div>

                <!-- Timeframes -->
                <section class="bg-[var(--bg-secondary)] rounded-xl p-5 border border-[var(--border-color)] shadow-sm">
                    <h4 class="text-sm font-semibold tracking-wide text-[var(--text-primary)] mb-4 pb-2 border-b border-[var(--border-color)]">
                        {$_("settings.technicals.favorites")}
                    </h4>
                    <TimeframeSelector
                        bind:selected={settingsState.favoriteTimeframes}
                        options={availableTimeframes}
                    />
                </section>
            </div>

        {:else if activeCategory === "oscillators"}
            <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 max-w-7xl mx-auto pb-8">
                <IndicatorCard title={$_("settings.technicals.rsi.title")} bind:enabled={indicatorState.rsi.enabled}>
                    <div class="grid grid-cols-2 gap-2">
                        <Field id="rsi-len" label={$_("settings.technicals.labels.length")} type="number" bind:value={indicatorState.rsi.length} min={2} />
                        <Select id="rsi-src" label={$_("settings.technicals.labels.source")} bind:value={indicatorState.rsi.source} options={sourceOptions} />
                        <Field id="rsi-ob" label={$_("settings.technicals.overbought")} type="number" bind:value={indicatorState.rsi.overbought} />
                        <Field id="rsi-os" label={$_("settings.technicals.oversold")} type="number" bind:value={indicatorState.rsi.oversold} />
                        <div class="col-span-2 flex justify-between items-center mt-1">
                            <span class="text-xs">{$_("settings.technicals.rsi.showSignal")}</span>
                            <Toggle bind:checked={indicatorState.rsi.showSignal} />
                        </div>
                    </div>
                </IndicatorCard>

                <IndicatorCard title={$_("settings.technicals.stochRsi.title")} bind:enabled={indicatorState.stochRsi.enabled}>
                    <div class="grid grid-cols-2 gap-2">
                        <Field id="srsi-len" label={$_("settings.technicals.labels.length")} type="number" bind:value={indicatorState.stochRsi.length} />
                        <Field id="srsi-rlen" label={$_("settings.technicals.stochRsi.rsiLen")} type="number" bind:value={indicatorState.stochRsi.rsiLength} />
                        <Field id="srsi-k" label={$_("settings.technicals.kPeriod")} type="number" bind:value={indicatorState.stochRsi.kPeriod} />
                        <Field id="srsi-d" label={$_("settings.technicals.dPeriod")} type="number" bind:value={indicatorState.stochRsi.dPeriod} />
                    </div>
                </IndicatorCard>

                <IndicatorCard title={$_("settings.technicals.stochasticTitle")} bind:enabled={indicatorState.stochastic.enabled}>
                    <div class="grid grid-cols-2 gap-2">
                        <Field id="stoch-k" label={$_("settings.technicals.kPeriod")} type="number" bind:value={indicatorState.stochastic.kPeriod} />
                        <Field id="stoch-d" label={$_("settings.technicals.dPeriod")} type="number" bind:value={indicatorState.stochastic.dPeriod} />
                        <Field id="stoch-s" label={$_("settings.technicals.smooth")} type="number" bind:value={indicatorState.stochastic.kSmoothing} />
                    </div>
                </IndicatorCard>

                <IndicatorCard title={$_("settings.technicals.williamsR")} bind:enabled={indicatorState.williamsR.enabled}>
                    <Field id="wr-len" label={$_("settings.technicals.labels.length")} type="number" bind:value={indicatorState.williamsR.length} />
                </IndicatorCard>

                <IndicatorCard title={$_("settings.technicals.cci")} bind:enabled={indicatorState.cci.enabled}>
                    <div class="grid grid-cols-2 gap-2">
                        <Field id="cci-len" label={$_("settings.technicals.labels.length")} type="number" bind:value={indicatorState.cci.length} />
                        <Select id="cci-src" label={$_("settings.technicals.labels.source")} bind:value={indicatorState.cci.source} options={sourceOptions} />
                    </div>
                </IndicatorCard>

                <IndicatorCard title={$_("settings.technicals.momentum")} bind:enabled={indicatorState.momentum.enabled}>
                    <div class="grid grid-cols-2 gap-2">
                        <Field id="mom-len" label={$_("settings.technicals.labels.length")} type="number" bind:value={indicatorState.momentum.length} />
                        <Select id="mom-src" label={$_("settings.technicals.labels.source")} bind:value={indicatorState.momentum.source} options={sourceOptions} />
                    </div>
                </IndicatorCard>

                <IndicatorCard title={$_("settings.technicals.awesomeOsc")} bind:enabled={indicatorState.ao.enabled}>
                    <div class="grid grid-cols-2 gap-2">
                        <Field id="ao-fast" label={$_("settings.technicals.labels.fast")} type="number" bind:value={indicatorState.ao.fastLength} />
                        <Field id="ao-slow" label={$_("settings.technicals.labels.slow")} type="number" bind:value={indicatorState.ao.slowLength} />
                    </div>
                </IndicatorCard>

                <IndicatorCard title={$_("settings.technicals.mfi")} bind:enabled={indicatorState.mfi.enabled}>
                    <Field id="mfi-len" label={$_("settings.technicals.labels.length")} type="number" bind:value={indicatorState.mfi.length} />
                </IndicatorCard>
            </div>

        {:else if activeCategory === "trend"}
             <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 max-w-7xl mx-auto pb-8">
                <IndicatorCard title={$_("settings.technicals.macd.title")} bind:enabled={indicatorState.macd.enabled}>
                    <div class="grid grid-cols-3 gap-2">
                        <Field id="macd-fast" label={$_("settings.technicals.labels.fast")} type="number" bind:value={indicatorState.macd.fastLength} />
                        <Field id="macd-slow" label={$_("settings.technicals.labels.slow")} type="number" bind:value={indicatorState.macd.slowLength} />
                        <Field id="macd-sig" label={$_("settings.technicals.labels.signal")} type="number" bind:value={indicatorState.macd.signalLength} />
                    </div>
                </IndicatorCard>

                <IndicatorCard title={$_("settings.technicals.adx")} bind:enabled={indicatorState.adx.enabled}>
                    <div class="grid grid-cols-2 gap-2">
                         <Field id="adx-len" label={$_("settings.technicals.diLength")} type="number" bind:value={indicatorState.adx.diLength} />
                         <Field id="adx-smooth" label={$_("settings.technicals.smoothing")} type="number" bind:value={indicatorState.adx.adxSmoothing} />
                         <Field id="adx-thr" label={$_("settings.technicals.threshold")} type="number" bind:value={indicatorState.adx.threshold} />
                    </div>
                </IndicatorCard>

                <IndicatorCard title={$_("settings.technicals.superTrend.title")} bind:enabled={indicatorState.superTrend.enabled}>
                    <div class="grid grid-cols-2 gap-2">
                        <Field id="st-per" label={$_("settings.technicals.labels.period")} type="number" bind:value={indicatorState.superTrend.period} />
                        <Field id="st-fac" label={$_("settings.technicals.labels.factor")} type="number" step={0.1} bind:value={indicatorState.superTrend.factor} />
                    </div>
                </IndicatorCard>

                <IndicatorCard title={$_("settings.technicals.ichimoku")} bind:enabled={indicatorState.ichimoku.enabled}>
                    <div class="grid grid-cols-2 gap-2">
                        <Field id="ichi-conv" label={$_("settings.technicals.conversion")} type="number" bind:value={indicatorState.ichimoku.conversionPeriod} />
                        <Field id="ichi-base" label={$_("settings.technicals.base")} type="number" bind:value={indicatorState.ichimoku.basePeriod} />
                        <Field id="ichi-spanb" label={$_("settings.technicals.spanB")} type="number" bind:value={indicatorState.ichimoku.spanBPeriod} />
                        <Field id="ichi-disp" label={$_("settings.technicals.displacement")} type="number" bind:value={indicatorState.ichimoku.displacement} />
                    </div>
                </IndicatorCard>

                <IndicatorCard title={$_("settings.technicals.parabolicSar")} bind:enabled={indicatorState.parabolicSar.enabled}>
                     <div class="grid grid-cols-3 gap-2">
                        <Field id="psar-start" label={$_("settings.technicals.start")} type="number" step={0.01} bind:value={indicatorState.parabolicSar.start} />
                        <Field id="psar-inc" label={$_("settings.technicals.inc")} type="number" step={0.01} bind:value={indicatorState.parabolicSar.increment} />
                        <Field id="psar-max" label={$_("settings.technicals.max")} type="number" step={0.01} bind:value={indicatorState.parabolicSar.max} />
                    </div>
                </IndicatorCard>

                <IndicatorCard title={$_("settings.technicals.pivotsTitle")} bind:enabled={indicatorState.pivots.enabled}>
                    <div class="grid grid-cols-1 gap-2">
                        <span class="text-xs text-[var(--text-secondary)]">{$_("settings.technicals.calculationMode")}</span>
                        <div class="grid grid-cols-2 gap-2">
                            {#each pivotTypes as pType}
                                <button
                                    class="text-xs py-1.5 rounded border border-[var(--border-color)] transition-colors {indicatorState.pivots.type === pType.value ? 'bg-[var(--accent-color)] text-[var(--btn-accent-text)] border-[var(--accent-color)]' : 'bg-[var(--bg-tertiary)] hover:bg-[var(--bg-primary)]'}"
                                    onclick={() => indicatorState.pivots.type = pType.value as IndicatorSettings['pivots']['type']}
                                >
                                    {pType.label}
                                </button>
                            {/each}
                        </div>
                    </div>
                </IndicatorCard>

                <IndicatorCard title={$_("settings.technicals.emaTitle")} bind:enabled={indicatorState.ema.enabled}>
                    <div class="flex flex-col gap-2">
                        <div class="grid grid-cols-3 gap-2">
                             <Field id="ema-1" label={$_("settings.technicals.ema1")} type="number" bind:value={indicatorState.ema.ema1.length} />
                             <Field id="ema-2" label={$_("settings.technicals.ema2")} type="number" bind:value={indicatorState.ema.ema2.length} />
                             <Field id="ema-3" label={$_("settings.technicals.ema3")} type="number" bind:value={indicatorState.ema.ema3.length} />
                        </div>
                        <Select id="ema-src" label={$_("settings.technicals.labels.source")} bind:value={indicatorState.ema.source} options={sourceOptions} />
                    </div>
                </IndicatorCard>

                <IndicatorCard title={$_("settings.technicals.smaTitle")} bind:enabled={indicatorState.sma.enabled}>
                    <div class="grid grid-cols-3 gap-2">
                            <Field id="sma-1" label={$_("settings.technicals.sma1")} type="number" bind:value={indicatorState.sma.sma1.length} />
                            <Field id="sma-2" label={$_("settings.technicals.sma2")} type="number" bind:value={indicatorState.sma.sma2.length} />
                            <Field id="sma-3" label={$_("settings.technicals.sma3")} type="number" bind:value={indicatorState.sma.sma3.length} />
                    </div>
                </IndicatorCard>

                <IndicatorCard title={$_("settings.technicals.wma")} bind:enabled={indicatorState.wma.enabled}>
                    <Field id="wma-len" label={$_("settings.technicals.labels.length")} type="number" bind:value={indicatorState.wma.length} />
                </IndicatorCard>
                <IndicatorCard title={$_("settings.technicals.vwma")} bind:enabled={indicatorState.vwma.enabled}>
                    <Field id="vwma-len" label={$_("settings.technicals.labels.length")} type="number" bind:value={indicatorState.vwma.length} />
                </IndicatorCard>
                <IndicatorCard title={$_("settings.technicals.hma")} bind:enabled={indicatorState.hma.enabled}>
                    <Field id="hma-len" label={$_("settings.technicals.labels.length")} type="number" bind:value={indicatorState.hma.length} />
                </IndicatorCard>
            </div>

        {:else if activeCategory === "volatility"}
            <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 max-w-7xl mx-auto pb-8">
                <IndicatorCard title={$_("settings.technicals.bollingerBands.title")} bind:enabled={indicatorState.bollingerBands.enabled}>
                    <div class="grid grid-cols-2 gap-2">
                        <Field id="bb-len" label={$_("settings.technicals.labels.length")} type="number" bind:value={indicatorState.bollingerBands.length} />
                        <Field id="bb-std" label={$_("settings.technicals.bollingerBands.stdDev")} type="number" step={0.1} bind:value={indicatorState.bollingerBands.stdDev} />
                    </div>
                </IndicatorCard>

                <IndicatorCard title={$_("settings.technicals.atr")} bind:enabled={indicatorState.atr.enabled}>
                    <Field id="atr-len" label={$_("settings.technicals.labels.length")} type="number" bind:value={indicatorState.atr.length} />
                </IndicatorCard>

                <IndicatorCard title={$_("settings.technicals.choppiness")} bind:enabled={indicatorState.choppiness.enabled}>
                    <Field id="chop-len" label={$_("settings.technicals.labels.length")} type="number" bind:value={indicatorState.choppiness.length} />
                </IndicatorCard>

                <IndicatorCard title={$_("settings.technicals.atrStop.title")} bind:enabled={indicatorState.atrTrailingStop.enabled}>
                     <div class="grid grid-cols-2 gap-2">
                        <Field id="ats-per" label={$_("settings.technicals.labels.period")} type="number" bind:value={indicatorState.atrTrailingStop.period} />
                        <Field id="ats-mult" label={$_("settings.technicals.multiplier")} type="number" step={0.1} bind:value={indicatorState.atrTrailingStop.multiplier} />
                    </div>
                </IndicatorCard>
            </div>

        {:else if activeCategory === "volume"}
            <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 max-w-7xl mx-auto pb-8">
                <IndicatorCard title={$_("settings.technicals.volume")} bind:enabled={indicatorState.volume.enabled}>
                    <div class="text-xs text-[var(--text-secondary)] italic">{$_("settings.technicals.volumeNoParams")}</div>
                </IndicatorCard>

                <IndicatorCard title={$_("settings.technicals.volumeMa.title")} bind:enabled={indicatorState.volumeMa.enabled}>
                     <div class="grid grid-cols-2 gap-2">
                        <Field id="vma-len" label={$_("settings.technicals.labels.length")} type="number" bind:value={indicatorState.volumeMa.length} />
                        <Select id="vma-type" label={$_("settings.technicals.labels.type")} bind:value={indicatorState.volumeMa.maType} options={[{value: "sma", label: $_("settings.technicals.maTypeSma")}, {value: "ema", label: $_("settings.technicals.maTypeEma")}, {value: "wma", label: $_("settings.technicals.maTypeWma")}]} />
                    </div>
                </IndicatorCard>

                <IndicatorCard title={$_("settings.technicals.obv")} bind:enabled={indicatorState.obv.enabled}>
                    <div class="text-xs text-[var(--text-secondary)] italic">{$_("settings.technicals.obvNoParams")}</div>
                </IndicatorCard>

                <IndicatorCard title={$_("settings.technicals.vwap")} bind:enabled={indicatorState.vwap.enabled}>
                     <div class="grid grid-cols-1 gap-2">
                         <Select id="vwap-anchor" label={$_("settings.technicals.anchor")} bind:value={indicatorState.vwap.anchor} options={[{value: "session", label: $_("settings.technicals.anchorSession")}, {value: "fixed", label: $_("settings.technicals.anchorFixed")}]} />
                    </div>
                </IndicatorCard>

                <IndicatorCard title={$_("settings.technicals.volumeProfile")} bind:enabled={indicatorState.volumeProfile.enabled}>
                     <Field id="vp-rows" label={$_("settings.technicals.rows")} type="number" bind:value={indicatorState.volumeProfile.rows} />
                </IndicatorCard>
            </div>

        {:else if activeCategory === "chart"}
            <div class="space-y-6 max-w-5xl mx-auto">
                <!-- Chart visibility: which indicators draw in the chart
                     window — grouped by the same categories as the other
                     tabs, two columns to save space. Independent of
                     `enabled` (Technicals panel + alarms): a hidden
                     indicator keeps calculating, it just is not drawn. -->
                <p class="text-xs text-[var(--text-secondary)]">
                    <span class="text-sm font-semibold text-[var(--text-primary)]">{$_("settings.technicals.chartPanes.title")}</span><br />
                    {$_("settings.technicals.chartPanes.description")}
                </p>
                <section class="bg-[var(--bg-secondary)] rounded-xl p-5 border border-[var(--border-color)] shadow-sm">
                    <h4 class="text-sm font-semibold tracking-wide text-[var(--text-primary)] mb-4 pb-2 border-b border-[var(--border-color)]">
                        <span>{$_("settings.technicals.tabs.oscillators")}</span>
                    </h4>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                        <div class="flex justify-between items-center gap-3">
                            <span class="text-sm">{$_("settings.technicals.rsi.title")}</span>
                            <Toggle bind:checked={indicatorState.rsi.showInChart} />
                        </div>
                        <div class="flex justify-between items-center gap-3">
                            <span class="text-sm">{$_("settings.technicals.stochRsi.title")}</span>
                            <Toggle bind:checked={indicatorState.stochRsi.showInChart} />
                        </div>
                        <div class="flex justify-between items-center gap-3">
                            <span class="text-sm">{$_("settings.technicals.stochasticTitle")}</span>
                            <Toggle bind:checked={indicatorState.stochastic.showInChart} />
                        </div>
                        <div class="flex justify-between items-center gap-3">
                            <span class="text-sm">{$_("settings.technicals.williamsR")}</span>
                            <Toggle bind:checked={indicatorState.williamsR.showInChart} />
                        </div>
                        <div class="flex justify-between items-center gap-3">
                            <span class="text-sm">{$_("settings.technicals.cci")}</span>
                            <Toggle bind:checked={indicatorState.cci.showInChart} />
                        </div>
                        <div class="flex justify-between items-center gap-3">
                            <span class="text-sm">{$_("settings.technicals.momentum")}</span>
                            <Toggle bind:checked={indicatorState.momentum.showInChart} />
                        </div>
                        <div class="flex justify-between items-center gap-3">
                            <span class="text-sm">{$_("settings.technicals.awesomeOsc")}</span>
                            <Toggle bind:checked={indicatorState.ao.showInChart} />
                        </div>
                        <div class="flex justify-between items-center gap-3">
                            <span class="text-sm">{$_("settings.technicals.mfi")}</span>
                            <Toggle bind:checked={indicatorState.mfi.showInChart} />
                        </div>
                    </div>
                </section>

                <section class="bg-[var(--bg-secondary)] rounded-xl p-5 border border-[var(--border-color)] shadow-sm">
                    <h4 class="text-sm font-semibold tracking-wide text-[var(--text-primary)] mb-4 pb-2 border-b border-[var(--border-color)]">
                        <span>{$_("settings.technicals.tabs.trend")}</span>
                    </h4>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                        <div class="flex justify-between items-center gap-3">
                            <span class="text-sm">{$_("settings.technicals.macd.title")}</span>
                            <Toggle bind:checked={indicatorState.macd.showInChart} />
                        </div>
                        <div class="flex justify-between items-center gap-3">
                            <span class="text-sm">{$_("settings.technicals.adx")}</span>
                            <Toggle bind:checked={indicatorState.adx.showInChart} />
                        </div>
                        <div class="flex justify-between items-center gap-3">
                            <span class="text-sm">{$_("settings.technicals.superTrend.title")}</span>
                            <Toggle bind:checked={indicatorState.superTrend.showInChart} />
                        </div>
                        <div class="flex justify-between items-center gap-3">
                            <span class="text-sm">{$_("settings.technicals.ichimoku")}</span>
                            <Toggle bind:checked={indicatorState.ichimoku.showInChart} />
                        </div>
                        <div class="flex justify-between items-center gap-3">
                            <span class="text-sm">{$_("settings.technicals.parabolicSar")}</span>
                            <Toggle bind:checked={indicatorState.parabolicSar.showInChart} />
                        </div>
                        <div class="flex justify-between items-center gap-3">
                            <span class="text-sm">{$_("settings.technicals.pivotsTitle")}</span>
                            <Toggle bind:checked={indicatorState.pivots.showInChart} />
                        </div>
                        <div class="flex justify-between items-center gap-3">
                            <span class="text-sm">{$_("settings.technicals.emaTitle")}</span>
                            <Toggle bind:checked={indicatorState.ema.showInChart} />
                        </div>
                        <div class="flex justify-between items-center gap-3">
                            <span class="text-sm">{$_("settings.technicals.smaTitle")}</span>
                            <Toggle bind:checked={indicatorState.sma.showInChart} />
                        </div>
                        <div class="flex justify-between items-center gap-3">
                            <span class="text-sm">{$_("settings.technicals.wma")}</span>
                            <Toggle bind:checked={indicatorState.wma.showInChart} />
                        </div>
                        <div class="flex justify-between items-center gap-3">
                            <span class="text-sm">{$_("settings.technicals.vwma")}</span>
                            <Toggle bind:checked={indicatorState.vwma.showInChart} />
                        </div>
                        <div class="flex justify-between items-center gap-3">
                            <span class="text-sm">{$_("settings.technicals.hma")}</span>
                            <Toggle bind:checked={indicatorState.hma.showInChart} />
                        </div>
                    </div>
                </section>

                <section class="bg-[var(--bg-secondary)] rounded-xl p-5 border border-[var(--border-color)] shadow-sm">
                    <h4 class="text-sm font-semibold tracking-wide text-[var(--text-primary)] mb-4 pb-2 border-b border-[var(--border-color)]">
                        <span>{$_("settings.technicals.tabs.volatility")}</span>
                    </h4>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                        <div class="flex justify-between items-center gap-3">
                            <span class="text-sm">{$_("settings.technicals.bollingerBands.title")}</span>
                            <Toggle bind:checked={indicatorState.bollingerBands.showInChart} />
                        </div>
                        <div class="flex justify-between items-center gap-3">
                            <span class="text-sm">{$_("settings.technicals.choppiness")}</span>
                            <Toggle bind:checked={indicatorState.choppiness.showInChart} />
                        </div>
                        <div class="flex justify-between items-center gap-3">
                            <span class="text-sm">{$_("settings.technicals.atrStop.title")}</span>
                            <Toggle bind:checked={indicatorState.atrTrailingStop.showInChart} />
                        </div>
                    </div>
                </section>

                <section class="bg-[var(--bg-secondary)] rounded-xl p-5 border border-[var(--border-color)] shadow-sm">
                    <h4 class="text-sm font-semibold tracking-wide text-[var(--text-primary)] mb-4 pb-2 border-b border-[var(--border-color)]">
                        <span>{$_("settings.technicals.tabs.volume")}</span>
                    </h4>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                        <div class="flex justify-between items-center gap-3">
                            <span class="text-sm">{$_("settings.technicals.volume")}</span>
                            <Toggle bind:checked={indicatorState.volume.showInChart} />
                        </div>
                        <div class="flex justify-between items-center gap-3">
                            <span class="text-sm">{$_("settings.technicals.obv")}</span>
                            <Toggle bind:checked={indicatorState.obv.showInChart} />
                        </div>
                        <div class="flex justify-between items-center gap-3">
                            <span class="text-sm">{$_("settings.technicals.vwap")}</span>
                            <Toggle bind:checked={indicatorState.vwap.showInChart} />
                        </div>
                    </div>
                </section>
            </div>
        {/if}
    </div>
</div>

<style>
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
    .no-scrollbar::-webkit-scrollbar {
        display: none;
    }
    .no-scrollbar {
        -ms-overflow-style: none;
        scrollbar-width: none;
    }
</style>
