<script lang="ts">
    import { _ } from "../../../locales/i18n";
    import { indicatorState } from "../../../stores/indicator.svelte";
    import { settingsState } from "../../../stores/settings.svelte";
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
    ];
    let activeCategory = $state("general");

    const availableTimeframes = [
        "1m", "5m", "15m", "30m", "1h", "4h", "12h", "1d", "3d", "1w", "1M"
    ];

    // Options
    const sourceOptions = ["close", "open", "high", "low", "hl2", "hlc3"];
    const pivotTypes = [
        { value: "classic", label: "Classic" },
        { value: "woodie", label: "Woodie" },
        { value: "camarilla", label: "Camarilla" },
        { value: "fibonacci", label: "Fibonacci" }
    ];
</script>

<div class="flex flex-col h-full bg-[var(--bg-primary)] text-[var(--text-primary)]">
    <!-- Tabs -->
    <div class="flex border-b border-[var(--border-color)] overflow-x-auto no-scrollbar">
        {#each tabs as tab}
            <button
                class="px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors relative {activeCategory ===
                tab.id
                    ? 'text-[var(--accent-color)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}"
                onclick={() => (activeCategory = tab.id)}
            >
                {tab.label}
                {#if activeCategory === tab.id}
                    <div
                        class="absolute bottom-0 left-0 w-full h-0.5 bg-[var(--accent-color)]"
                    ></div>
                {/if}
            </button>
        {/each}
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {#if activeCategory === "general"}
            <section class="space-y-6">
                <!-- Panel Sections Visibility -->
                <div class="bg-[var(--bg-secondary)] rounded-lg p-4 border border-[var(--border-color)]">
                    <h4 class="text-xs font-bold uppercase text-[var(--text-secondary)] mb-3">
                        Panel Sections
                    </h4>
                    <div class="space-y-3">
                        <div class="flex justify-between items-center">
                            <span class="text-sm">Summary</span>
                            <Toggle bind:checked={indicatorState.panelSections.summary} />
                        </div>
                        <div class="flex justify-between items-center">
                            <span class="text-sm">Oscillators</span>
                            <Toggle bind:checked={indicatorState.panelSections.oscillators} />
                        </div>
                        <div class="flex justify-between items-center">
                            <span class="text-sm">Moving Averages</span>
                            <Toggle bind:checked={indicatorState.panelSections.movingAverages} />
                        </div>
                        <div class="flex justify-between items-center">
                            <span class="text-sm">Pivots</span>
                            <Toggle bind:checked={indicatorState.panelSections.pivots} />
                        </div>
                    </div>
                </div>

                <!-- Global Settings -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="p-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)]">
                        <h4 class="text-xs font-bold uppercase mb-2">Calculation</h4>
                        <div class="space-y-2">
                             <Field
                                id="hist-limit"
                                label="History Limit"
                                type="number"
                                bind:value={indicatorState.historyLimit}
                                step={50}
                            />
                            <div class="flex justify-between items-center pt-2">
                                <span class="text-sm">Auto Optimize</span>
                                <Toggle bind:checked={indicatorState.autoOptimize} />
                            </div>
                        </div>
                    </div>

                    <div class="p-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)]">
                         <h4 class="text-xs font-bold uppercase mb-2">Display</h4>
                         <div class="space-y-2">
                            <Field
                                id="precision"
                                label="Precision"
                                type="number"
                                bind:value={indicatorState.precision}
                                min={0}
                                max={8}
                            />
                            <div class="flex flex-col gap-2 mt-2">
                                <span class="text-xs text-[var(--text-secondary)]">PnL Display Mode</span>
                                <div class="flex bg-[var(--bg-tertiary)] rounded p-1">
                                    {#each [{ value: "value", label: "Value" }, { value: "percent", label: "%" }, { value: "bar", label: "Bar" }] as mode}
                                        <button
                                            class="flex-1 text-xs py-1 rounded transition-colors {settingsState.pnlViewMode === mode.value ? 'bg-[var(--accent-color)] text-white' : 'text-[var(--text-secondary)]'}"
                                            onclick={() => (settingsState.pnlViewMode = mode.value as any)}
                                        >
                                            {mode.label}
                                        </button>
                                    {/each}
                                </div>
                            </div>
                         </div>
                    </div>
                </div>

                <!-- Timeframes -->
                <div class="bg-[var(--bg-secondary)] rounded-lg p-4 border border-[var(--border-color)]">
                    <h4 class="text-xs font-bold uppercase mb-2">Favorite Timeframes</h4>
                    <TimeframeSelector
                        bind:selected={settingsState.favoriteTimeframes}
                        options={availableTimeframes}
                    />
                </div>
            </section>

        {:else if activeCategory === "oscillators"}
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <IndicatorCard title="RSI" bind:enabled={indicatorState.rsi.enabled}>
                    <div class="grid grid-cols-2 gap-2">
                        <Field id="rsi-len" label="Length" type="number" bind:value={indicatorState.rsi.length} min={2} />
                        <Select id="rsi-src" label="Source" bind:value={indicatorState.rsi.source} options={sourceOptions} />
                        <Field id="rsi-ob" label="Overbought" type="number" bind:value={indicatorState.rsi.overbought} />
                        <Field id="rsi-os" label="Oversold" type="number" bind:value={indicatorState.rsi.oversold} />
                        <div class="col-span-2 flex justify-between items-center mt-1">
                            <span class="text-xs">Show Signal (MA)</span>
                            <Toggle bind:checked={indicatorState.rsi.showSignal} />
                        </div>
                    </div>
                </IndicatorCard>

                <IndicatorCard title="Stoch RSI" bind:enabled={indicatorState.stochRsi.enabled}>
                    <div class="grid grid-cols-2 gap-2">
                        <Field id="srsi-len" label="Length" type="number" bind:value={indicatorState.stochRsi.length} />
                        <Field id="srsi-rlen" label="RSI Len" type="number" bind:value={indicatorState.stochRsi.rsiLength} />
                        <Field id="srsi-k" label="%K" type="number" bind:value={indicatorState.stochRsi.kPeriod} />
                        <Field id="srsi-d" label="%D" type="number" bind:value={indicatorState.stochRsi.dPeriod} />
                    </div>
                </IndicatorCard>

                <IndicatorCard title="Stochastic" bind:enabled={indicatorState.stochastic.enabled}>
                    <div class="grid grid-cols-2 gap-2">
                        <Field id="stoch-k" label="%K" type="number" bind:value={indicatorState.stochastic.kPeriod} />
                        <Field id="stoch-d" label="%D" type="number" bind:value={indicatorState.stochastic.dPeriod} />
                        <Field id="stoch-s" label="Smooth" type="number" bind:value={indicatorState.stochastic.kSmoothing} />
                    </div>
                </IndicatorCard>

                <IndicatorCard title="Williams %R" bind:enabled={indicatorState.williamsR.enabled}>
                    <Field id="wr-len" label="Length" type="number" bind:value={indicatorState.williamsR.length} />
                </IndicatorCard>

                <IndicatorCard title="CCI" bind:enabled={indicatorState.cci.enabled}>
                    <div class="grid grid-cols-2 gap-2">
                        <Field id="cci-len" label="Length" type="number" bind:value={indicatorState.cci.length} />
                        <Select id="cci-src" label="Source" bind:value={indicatorState.cci.source} options={sourceOptions} />
                    </div>
                </IndicatorCard>

                <IndicatorCard title="Momentum" bind:enabled={indicatorState.momentum.enabled}>
                    <div class="grid grid-cols-2 gap-2">
                        <Field id="mom-len" label="Length" type="number" bind:value={indicatorState.momentum.length} />
                        <Select id="mom-src" label="Source" bind:value={indicatorState.momentum.source} options={sourceOptions} />
                    </div>
                </IndicatorCard>

                <IndicatorCard title="Awesome Osc." bind:enabled={indicatorState.ao.enabled}>
                    <div class="grid grid-cols-2 gap-2">
                        <Field id="ao-fast" label="Fast" type="number" bind:value={indicatorState.ao.fastLength} />
                        <Field id="ao-slow" label="Slow" type="number" bind:value={indicatorState.ao.slowLength} />
                    </div>
                </IndicatorCard>

                <IndicatorCard title="MFI" bind:enabled={indicatorState.mfi.enabled}>
                    <Field id="mfi-len" label="Length" type="number" bind:value={indicatorState.mfi.length} />
                </IndicatorCard>
            </div>

        {:else if activeCategory === "trend"}
             <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <IndicatorCard title="MACD" bind:enabled={indicatorState.macd.enabled}>
                    <div class="grid grid-cols-3 gap-2">
                        <Field id="macd-fast" label="Fast" type="number" bind:value={indicatorState.macd.fastLength} />
                        <Field id="macd-slow" label="Slow" type="number" bind:value={indicatorState.macd.slowLength} />
                        <Field id="macd-sig" label="Signal" type="number" bind:value={indicatorState.macd.signalLength} />
                    </div>
                </IndicatorCard>

                <IndicatorCard title="ADX" bind:enabled={indicatorState.adx.enabled}>
                    <div class="grid grid-cols-2 gap-2">
                         <Field id="adx-len" label="DI Length" type="number" bind:value={indicatorState.adx.diLength} />
                         <Field id="adx-smooth" label="Smoothing" type="number" bind:value={indicatorState.adx.adxSmoothing} />
                         <Field id="adx-thr" label="Threshold" type="number" bind:value={indicatorState.adx.threshold} />
                    </div>
                </IndicatorCard>

                <IndicatorCard title="SuperTrend" bind:enabled={indicatorState.superTrend.enabled}>
                    <div class="grid grid-cols-2 gap-2">
                        <Field id="st-per" label="Period" type="number" bind:value={indicatorState.superTrend.period} />
                        <Field id="st-fac" label="Factor" type="number" step={0.1} bind:value={indicatorState.superTrend.factor} />
                    </div>
                </IndicatorCard>

                <IndicatorCard title="Ichimoku" bind:enabled={indicatorState.ichimoku.enabled}>
                    <div class="grid grid-cols-2 gap-2">
                        <Field id="ichi-conv" label="Conversion" type="number" bind:value={indicatorState.ichimoku.conversionPeriod} />
                        <Field id="ichi-base" label="Base" type="number" bind:value={indicatorState.ichimoku.basePeriod} />
                        <Field id="ichi-spanb" label="Span B" type="number" bind:value={indicatorState.ichimoku.spanBPeriod} />
                        <Field id="ichi-disp" label="Displacement" type="number" bind:value={indicatorState.ichimoku.displacement} />
                    </div>
                </IndicatorCard>

                <IndicatorCard title="Parabolic SAR" bind:enabled={indicatorState.parabolicSar.enabled}>
                     <div class="grid grid-cols-3 gap-2">
                        <Field id="psar-start" label="Start" type="number" step={0.01} bind:value={indicatorState.parabolicSar.start} />
                        <Field id="psar-inc" label="Inc" type="number" step={0.01} bind:value={indicatorState.parabolicSar.increment} />
                        <Field id="psar-max" label="Max" type="number" step={0.01} bind:value={indicatorState.parabolicSar.max} />
                    </div>
                </IndicatorCard>

                <IndicatorCard title="Pivot Points" bind:enabled={indicatorState.pivots.enabled}>
                    <div class="grid grid-cols-1 gap-2">
                        <span class="text-xs text-[var(--text-secondary)]">Calculation Mode</span>
                        <div class="grid grid-cols-2 gap-2">
                            {#each pivotTypes as pType}
                                <button
                                    class="text-xs py-1.5 rounded border border-[var(--border-color)] transition-colors {indicatorState.pivots.type === pType.value ? 'bg-[var(--accent-color)] text-white border-[var(--accent-color)]' : 'bg-[var(--bg-tertiary)] hover:bg-[var(--bg-primary)]'}"
                                    onclick={() => indicatorState.pivots.type = pType.value as any}
                                >
                                    {pType.label}
                                </button>
                            {/each}
                        </div>
                    </div>
                </IndicatorCard>

                <IndicatorCard title="EMA" bind:enabled={indicatorState.ema.enabled}>
                    <div class="flex flex-col gap-2">
                        <div class="grid grid-cols-3 gap-2">
                             <Field id="ema-1" label="EMA 1" type="number" bind:value={indicatorState.ema.ema1.length} />
                             <Field id="ema-2" label="EMA 2" type="number" bind:value={indicatorState.ema.ema2.length} />
                             <Field id="ema-3" label="EMA 3" type="number" bind:value={indicatorState.ema.ema3.length} />
                        </div>
                        <Select id="ema-src" label="Source" bind:value={indicatorState.ema.source} options={sourceOptions} />
                    </div>
                </IndicatorCard>

                <IndicatorCard title="SMA" bind:enabled={indicatorState.sma.enabled}>
                    <div class="grid grid-cols-3 gap-2">
                            <Field id="sma-1" label="SMA 1" type="number" bind:value={indicatorState.sma.sma1.length} />
                            <Field id="sma-2" label="SMA 2" type="number" bind:value={indicatorState.sma.sma2.length} />
                            <Field id="sma-3" label="SMA 3" type="number" bind:value={indicatorState.sma.sma3.length} />
                    </div>
                </IndicatorCard>

                <IndicatorCard title="WMA" bind:enabled={indicatorState.wma.enabled}>
                    <Field id="wma-len" label="Length" type="number" bind:value={indicatorState.wma.length} />
                </IndicatorCard>
                <IndicatorCard title="VWMA" bind:enabled={indicatorState.vwma.enabled}>
                    <Field id="vwma-len" label="Length" type="number" bind:value={indicatorState.vwma.length} />
                </IndicatorCard>
                <IndicatorCard title="HMA" bind:enabled={indicatorState.hma.enabled}>
                    <Field id="hma-len" label="Length" type="number" bind:value={indicatorState.hma.length} />
                </IndicatorCard>
            </div>

        {:else if activeCategory === "volatility"}
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <IndicatorCard title="Bollinger Bands" bind:enabled={indicatorState.bollingerBands.enabled}>
                    <div class="grid grid-cols-2 gap-2">
                        <Field id="bb-len" label="Length" type="number" bind:value={indicatorState.bollingerBands.length} />
                        <Field id="bb-std" label="Std Dev" type="number" step={0.1} bind:value={indicatorState.bollingerBands.stdDev} />
                    </div>
                </IndicatorCard>

                <IndicatorCard title="ATR" bind:enabled={indicatorState.atr.enabled}>
                    <Field id="atr-len" label="Length" type="number" bind:value={indicatorState.atr.length} />
                </IndicatorCard>

                <IndicatorCard title="Choppiness Idx" bind:enabled={indicatorState.choppiness.enabled}>
                    <Field id="chop-len" label="Length" type="number" bind:value={indicatorState.choppiness.length} />
                </IndicatorCard>

                <IndicatorCard title="ATR Trailing Stop" bind:enabled={indicatorState.atrTrailingStop.enabled}>
                     <div class="grid grid-cols-2 gap-2">
                        <Field id="ats-per" label="Period" type="number" bind:value={indicatorState.atrTrailingStop.period} />
                        <Field id="ats-mult" label="Multiplier" type="number" step={0.1} bind:value={indicatorState.atrTrailingStop.multiplier} />
                    </div>
                </IndicatorCard>
            </div>

        {:else if activeCategory === "volume"}
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <IndicatorCard title="Volume MA" bind:enabled={indicatorState.volumeMa.enabled}>
                     <div class="grid grid-cols-2 gap-2">
                        <Field id="vma-len" label="Length" type="number" bind:value={indicatorState.volumeMa.length} />
                        <Select id="vma-type" label="Type" bind:value={indicatorState.volumeMa.maType} options={["sma", "ema", "wma"]} />
                    </div>
                </IndicatorCard>

                <IndicatorCard title="OBV" bind:enabled={indicatorState.obv.enabled}>
                    <div class="text-xs text-[var(--text-secondary)] italic">On Balance Volume has no configurable parameters.</div>
                </IndicatorCard>

                <IndicatorCard title="VWAP" bind:enabled={indicatorState.vwap.enabled}>
                     <div class="grid grid-cols-1 gap-2">
                         <Select id="vwap-anchor" label="Anchor" bind:value={indicatorState.vwap.anchor} options={["session", "fixed"]} />
                    </div>
                </IndicatorCard>

                <IndicatorCard title="Volume Profile" bind:enabled={indicatorState.volumeProfile.enabled}>
                     <Field id="vp-rows" label="Rows" type="number" bind:value={indicatorState.volumeProfile.rows} />
                </IndicatorCard>
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
