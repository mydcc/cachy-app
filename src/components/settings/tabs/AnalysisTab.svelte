<!--
  Copyright (C) 2026 MYDCT
-->

<script lang="ts">
    import { _ } from "../../../locales/i18n";
    import Toggle from "../../shared/Toggle.svelte";
    import { enhancedInput } from "../../../lib/actions/inputEnhancements";
    import TimeframeSelector from "../../shared/TimeframeSelector.svelte";
    import { settingsState } from "../../../stores/settings.svelte";
    import { indicatorState } from "../../../stores/indicator.svelte";
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
        { id: "general", label: "General & Setup" },
        { id: "oscillators", label: "Oscillators" },
        { id: "trend", label: "Trend & Direction" },
        { id: "volatility", label: "Volatility" },
        { id: "volume", label: "Volume & Signals" },
    ] as const;

    const pnlModes = [
        { value: "value", label: "Absolute Value" },
        { value: "percent", label: "Percentage %" },
        { value: "bar", label: "Visual Bar" },
    ];
</script>

<div
    class="analysis-tab flex flex-col h-full gap-4"
    role="tabpanel"
    id="tab-analysis"
>
    <!-- Sub-Navigation -->
    <div
        class="flex flex-wrap gap-2 border-b border-[var(--border-color)] pb-2"
    >
        {#each categories as category}
            <button
                class="category-btn {activeCategory === category.id
                    ? 'active'
                    : ''}"
                onclick={() => (activeCategory = category.id)}
            >
                {category.label}
            </button>
        {/each}
    </div>

    <div
        class="flex-1 overflow-y-auto pr-1 flex flex-col gap-6 custom-scrollbar"
    >
        {#if activeCategory === "general"}
            <section class="settings-section animate-fade-in">
                <h3 class="section-title">
                    {$_("settings.indicators.general") ||
                        "Calculation & Display Logic"}
                </h3>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <!-- Precision -->
                    <div class="setting-card">
                        <div class="flex justify-between items-center mb-2">
                            <label for="precision"
                                >{$_("settings.indicators.precision") ||
                                    "Data Precision"}</label
                            >
                            <input
                                id="precision"
                                type="number"
                                bind:value={indicatorState.precision}
                                min="0"
                                max="8"
                                class="field-input w-16 text-right"
                                use:enhancedInput={{ min: 0, max: 8 }}
                            />
                        </div>
                        <p class="description">
                            {$_("settings.indicators.precisionDesc") ||
                                "Decimal places for technical values"}
                        </p>
                    </div>

                    <!-- History Limit -->
                    <div class="setting-card">
                        <div class="flex justify-between items-center mb-2">
                            <label for="history-limit"
                                >{$_("settings.indicators.historyLimit") ||
                                    "History Scope"}</label
                            >
                            <input
                                id="history-limit"
                                type="number"
                                bind:value={indicatorState.historyLimit}
                                min="100"
                                max="10000"
                                step="100"
                                class="field-input w-20 text-right"
                                use:enhancedInput={{ min: 100, max: 10000 }}
                            />
                        </div>
                        <p class="description">
                            {$_("settings.indicators.historyDesc") ||
                                "Candles to load for indicator math"}
                        </p>
                    </div>

                    <!-- PnL View Mode -->
                    <div class="setting-card col-span-1 md:col-span-2">
                        <span class="mb-2 block text-sm font-semibold"
                            >{$_("settings.pnlViewMode") ||
                                "PnL Presentation"}</span
                        >
                        <div class="segmented-control">
                            {#each pnlModes as mode}
                                <button
                                    class="segmented-btn {settingsState.pnlViewMode ===
                                    mode.value
                                        ? 'active'
                                        : ''}"
                                    onclick={() =>
                                        (settingsState.pnlViewMode =
                                            mode.value as any)}
                                >
                                    {mode.label}
                                </button>
                            {/each}
                            <div
                                class="segmented-bg"
                                style="width: 33.33%; transform: translateX({settingsState.pnlViewMode ===
                                'value'
                                    ? '0%'
                                    : settingsState.pnlViewMode === 'percent'
                                      ? '100%'
                                      : '200%'})"
                            ></div>
                        </div>
                    </div>
                </div>

                <!-- RSI Sync Toggle -->
                <div
                    class="flex items-center justify-between p-4 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl mt-4"
                >
                    <div class="flex flex-col">
                        <span class="text-sm font-medium"
                            >{$_("settings.indicators.syncRsiTimeframe") ||
                                "Synchronize RSI"}</span
                        >
                        <span class="text-[10px] text-[var(--text-secondary)]"
                            >{$_("settings.indicators.syncRsiDesc") ||
                                "Always use the current chart timeframe for RSI calculations"}</span
                        >
                    </div>
                    <Toggle bind:checked={settingsState.syncRsiTimeframe} />
                </div>

                <!-- Global Favorites -->
                <div
                    class="p-4 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl mt-4"
                >
                    <span class="text-sm font-medium mb-3 block"
                        >{$_("settings.indicators.favoriteTimeframes") ||
                            "Preferred Analysis Timeframes"}</span
                    >
                    <TimeframeSelector
                        bind:selected={settingsState.favoriteTimeframes}
                        options={availableTimeframes}
                    />
                </div>
            </section>
        {/if}

        <!-- Indikator-Details (Original-Logik aber modernisiertes CSS) -->
        {#if activeCategory !== "general"}
            <div class="indicator-grid animate-fade-in">
                {#if activeCategory === "oscillators"}
                    <div class="indicator-card">
                        <div class="indicator-header">
                            <h4>RSI</h4>
                            
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
                                /><Select
                                    label="Source"
                                    id="rsi-src"
                                    bind:value={indicatorState.rsi.source}
                                    options={[
                                        "close",
                                        "open",
                                        "high",
                                        "low",
                                        "hl2",
                                        "hlc3",
                                    ]}
                                />
                            </div>
                            <div class="row-between mt-2">
                                <span class="text-xs">Signal Line</span><Toggle
                                    bind:checked={indicatorState.rsi.showSignal}
                                    
                                />
                            </div>
                            {#if indicatorState.rsi.showSignal}<div
                                    class="row mt-2"
                                >
                                    <Select
                                        label="Type"
                                        id="rsi-sig-type"
                                        bind:value={
                                            indicatorState.rsi.signalType
                                        }
                                        options={["sma", "ema"]}
                                    /><Field
                                        label="Len"
                                        id="rsi-sig-len"
                                        type="number"
                                        bind:value={
                                            indicatorState.rsi.signalLength
                                        }
                                        min={2}
                                        max={100}
                                    />
                                </div>{/if}
                        </div>
                        
                    </div>
                    <!-- Weitere Oszillatoren: Stoch RSI, Stochastic, CCI, Williams %R, MFI, Momentum, AO (Vom Original übernommen) -->
                    <div class="indicator-card">
                        <div class="indicator-header">
                            <h4>Stoch RSI</h4>
                            
                        </div>
                        <div class="indicator-body">
                            <div class="row">
                                <Field
                                    label="Len"
                                    id="srsi-len"
                                    type="number"
                                    bind:value={indicatorState.stochRsi.length}
                                    min={2}
                                /><Field
                                    label="RSI Len"
                                    id="srsi-rlen"
                                    type="number"
                                    bind:value={
                                        indicatorState.stochRsi.rsiLength
                                    }
                                    min={2}
                                />
                            </div>
                            <div class="row">
                                <Field
                                    label="%K"
                                    id="srsi-k"
                                    type="number"
                                    bind:value={indicatorState.stochRsi.kPeriod}
                                /><Field
                                    label="%D"
                                    id="srsi-d"
                                    type="number"
                                    bind:value={indicatorState.stochRsi.dPeriod}
                                />
                            </div>
                        </div>
                        
                    </div>
                    <div class="indicator-card">
                        <div class="indicator-header">
                            <h4>Stochastic</h4>
                            
                        </div>
                        <div class="indicator-body">
                            <div class="row">
                                <Field
                                    label="%K Len"
                                    id="stoch-k"
                                    type="number"
                                    bind:value={
                                        indicatorState.stochastic.kPeriod
                                    }
                                /><Field
                                    label="%K Smth"
                                    id="stoch-ks"
                                    type="number"
                                    bind:value={
                                        indicatorState.stochastic.kSmoothing
                                    }
                                />
                            </div>
                            <div class="row">
                                <Field
                                    label="%D Smth"
                                    id="stoch-ds"
                                    type="number"
                                    bind:value={
                                        indicatorState.stochastic.dPeriod
                                    }
                                />
                            </div>
                        </div>
                        
                    </div>
                    <div class="indicator-card">
                        <div class="indicator-header">
                            <h4>CCI</h4>
                            
                        </div>
                        <div class="indicator-body">
                            <div class="row">
                                <Field
                                    label="Length"
                                    id="cci-len"
                                    type="number"
                                    bind:value={indicatorState.cci.length}
                                /><Select
                                    label="Source"
                                    id="cci-src"
                                    bind:value={indicatorState.cci.source}
                                    options={[
                                        "close",
                                        "open",
                                        "high",
                                        "low",
                                        "hl2",
                                        "hlc3",
                                    ]}
                                />
                            </div>
                        </div>
                        
                    </div>

                    <!-- Williams %R -->
                    <div class="indicator-card">
                        <div class="indicator-header">
                            <h4>Williams %R</h4>
                            
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
                        
                    </div>

                    <!-- MFI -->
                    <div class="indicator-card">
                        <div class="indicator-header">
                            <h4>Money Flow Index</h4>
                            
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
                        
                    </div>

                    <!-- Momentum -->
                    <div class="indicator-card">
                        <div class="indicator-header">
                            <h4>Momentum</h4>
                            
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
                                /><Select
                                    label="Source"
                                    id="mom-src"
                                    bind:value={indicatorState.momentum.source}
                                    options={[
                                        "close",
                                        "open",
                                        "high",
                                        "low",
                                        "hl2",
                                        "hlc3",
                                    ]}
                                />
                            </div>
                        </div>
                        
                    </div>

                    <!-- Awesome Oscillator -->
                    <div class="indicator-card">
                        <div class="indicator-header">
                            <h4>Awesome Osc</h4>
                            
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
                                /><Field
                                    label="Slow Len"
                                    id="ao-slow"
                                    type="number"
                                    bind:value={indicatorState.ao.slowLength}
                                    min={1}
                                    max={100}
                                />
                            </div>
                        </div>
                        
                    </div>
                {/if}

                {#if activeCategory === "trend"}
                    <div class="indicator-card">
                        <div class="indicator-header">
                            <h4>MACD</h4>
                            
                        </div>
                        <div class="indicator-body">
                            <div class="row">
                                <Field
                                    label="Fast"
                                    id="macd-fast"
                                    type="number"
                                    bind:value={indicatorState.macd.fastLength}
                                /><Field
                                    label="Slow"
                                    id="macd-slow"
                                    type="number"
                                    bind:value={indicatorState.macd.slowLength}
                                /><Field
                                    label="Sig"
                                    id="macd-sig"
                                    type="number"
                                    bind:value={
                                        indicatorState.macd.signalLength
                                    }
                                />
                            </div>
                        </div>
                        
                    </div>
                    <!-- EMA Triple (Wide Card) -->
                    <div class="indicator-card col-span-1 md:col-span-2">
                        <div class="indicator-header">
                            <h4>EMA Triple</h4>
                            
                        </div>
                        <div class="indicator-body flex flex-col gap-3">
                            <Select
                                label="Common Source"
                                id="ema-src"
                                bind:value={indicatorState.ema.source}
                                options={[
                                    "close",
                                    "open",
                                    "high",
                                    "low",
                                    "hl2",
                                    "hlc3",
                                ]}
                            />
                            <div class="grid grid-cols-1 md:grid-cols-3 gap-2">
                                {#each [1, 2, 3] as i}
                                    <div
                                        class="p-2 bg-[var(--bg-primary)] rounded-lg border border-[var(--border-color)]"
                                    >
                                        <span
                                            class="text-[10px] uppercase font-bold text-[var(--text-secondary)]"
                                            >EMA {i}</span
                                        >
                                        <div
                                            class="grid grid-cols-2 gap-1 mt-1"
                                        >
                                            <Field
                                                label="Len"
                                                id="ema-{i}-len"
                                                type="number"
                                                bind:value={
                                                    (indicatorState.ema as any)[
                                                        `ema${i}`
                                                    ].length
                                                }
                                            />
                                            <Field
                                                label="Offs"
                                                id="ema-{i}-offset"
                                                type="number"
                                                bind:value={
                                                    (indicatorState.ema as any)[
                                                        `ema${i}`
                                                    ].offset
                                                }
                                            />
                                        </div>
                                    </div>
                                {/each}
                            </div>
                        </div>
                        
                    </div>
                    <div class="indicator-card">
                        <div class="indicator-header">
                            <h4>Ichimoku</h4>
                            
                        </div>
                        <div class="indicator-body">
                            <div class="grid grid-cols-2 gap-2">
                                <Field
                                    label="Conv"
                                    id="ichimoku-conv"
                                    type="number"
                                    bind:value={
                                        indicatorState.ichimoku.conversionPeriod
                                    }
                                />
                                <Field
                                    label="Base"
                                    id="ichimoku-base"
                                    type="number"
                                    bind:value={
                                        indicatorState.ichimoku.basePeriod
                                    }
                                />
                            </div>
                        </div>
                        
                    </div>

                    <!-- ADX -->
                    <div class="indicator-card">
                        <div class="indicator-header">
                            <h4>ADX</h4>
                            
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
                                /><Field
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
                        
                    </div>

                    <!-- SuperTrend -->
                    <div class="indicator-card">
                        <div class="indicator-header">
                            <h4>SuperTrend</h4>
                            
                        </div>
                        <div class="indicator-body">
                            <div class="row">
                                <Field
                                    label="Factor"
                                    id="st-fac"
                                    type="number"
                                    step={0.1}
                                    bind:value={
                                        indicatorState.superTrend.factor
                                    }
                                    min={0.1}
                                    max={20}
                                /><Field
                                    label="Period"
                                    id="st-per"
                                    type="number"
                                    bind:value={
                                        indicatorState.superTrend.period
                                    }
                                    min={2}
                                    max={100}
                                />
                            </div>
                        </div>
                        
                    </div>

                    <!-- Pivots -->
                    <div class="indicator-card">
                        <div class="indicator-header">
                            <h4>Pivots</h4>
                            
                        </div>
                        <div class="indicator-body">
                            <div class="row">
                                <Select
                                    label="Type"
                                    id="piv-type"
                                    bind:value={indicatorState.pivots.type}
                                    options={[
                                        "classic",
                                        "woodie",
                                        "camarilla",
                                        "fibonacci",
                                    ]}
                                /><Select
                                    label="Mode"
                                    id="piv-mode"
                                    bind:value={indicatorState.pivots.viewMode}
                                    options={[
                                        "integrated",
                                        "separated",
                                        "abstract",
                                    ]}
                                />
                            </div>
                        </div>
                        
                    </div>
                {/if}

                <!-- Volatility -->
                {#if activeCategory === "volatility"}
                    <!-- ATR -->
                    <div class="indicator-card">
                        <div class="indicator-header">
                            <h4>ATR</h4>
                            
                        </div>
                        <div class="indicator-body">
                            <div class="row">
                                <Field
                                    label="Length"
                                    id="atr-len"
                                    type="number"
                                    bind:value={indicatorState.atr.length}
                                    min={1}
                                    max={100}
                                />
                            </div>
                        </div>
                        
                    </div>

                    <!-- Bollinger Bands -->
                    <div class="indicator-card">
                        <div class="indicator-header">
                            <h4>Bollinger Bands</h4>
                            
                        </div>
                        <div class="indicator-body">
                            <div class="row">
                                <Field
                                    label="Length"
                                    id="bb-len"
                                    type="number"
                                    bind:value={
                                        indicatorState.bollingerBands.length
                                    }
                                    min={2}
                                    max={100}
                                /><Field
                                    label="Std Dev"
                                    id="bb-std"
                                    type="number"
                                    step={0.1}
                                    bind:value={
                                        indicatorState.bollingerBands.stdDev
                                    }
                                    min={0.1}
                                    max={10}
                                />
                            </div>
                            <div class="row mt-2">
                                <Select
                                    label="Source"
                                    id="bb-src"
                                    bind:value={
                                        indicatorState.bollingerBands.source
                                    }
                                    options={[
                                        "close",
                                        "open",
                                        "high",
                                        "low",
                                        "hl2",
                                        "hlc3",
                                    ]}
                                />
                            </div>
                        </div>
                        
                    </div>
                {/if}

                <!-- Volume -->
                {#if activeCategory === "volume"}
                    <!-- Volume MA -->
                    <div class="indicator-card">
                        <div class="indicator-header">
                            <h4>Volume MA</h4>
                            
                        </div>
                        <div class="indicator-body">
                            <div class="row">
                                <Field
                                    label="Length"
                                    id="vma-len"
                                    type="number"
                                    bind:value={indicatorState.volumeMa.length}
                                    min={1}
                                    max={200}
                                /><Select
                                    label="MA Type"
                                    id="vma-type"
                                    bind:value={indicatorState.volumeMa.maType}
                                    options={["sma", "ema", "wma"]}
                                />
                            </div>
                        </div>
                        
                    </div>

                    <!-- OBV -->
                    <div class="indicator-card">
                        <div class="indicator-header">
                            <h4>OBV (On-Balance Volume)</h4>
                            
                        </div>
                        <div class="indicator-body">
                            <p class="text-xs text-[var(--text-secondary)]">
                                No configuration needed. OBV is calculated
                                automatically.
                            </p>
                        </div>
                        
                    </div>
                {/if}

                <!-- Volatility & Volume areas follow same pattern but truncated here for brevity in the component itself -->
                <!-- In final version all sub-indicators would be fully included -->
            </div>
        {/if}
    </div>
</div>

<style>
    .analysis-tab {
        padding: 0.25rem;
    }

    .category-btn {
        padding: 0.5rem 1rem;
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--text-secondary);
        background: transparent;
        border: none;
        cursor: pointer;
        transition: all 0.2s ease;
        border-radius: 0.5rem;
    }

    .category-btn:hover {
        background: var(--bg-secondary);
        color: var(--text-primary);
    }
    .category-btn.active {
        background: var(--accent-color);
        color: var(--btn-accent-text);
    }

    .section-title {
        font-size: 0.875rem;
        font-weight: 700;
        color: var(--text-primary);
        margin-bottom: 1.25rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .setting-card {
        padding: 1rem;
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 0.75rem;
    }

    .setting-card label {
        font-size: 0.875rem;
        font-weight: 600;
    }

    .description {
        font-size: 10px;
        color: var(--text-secondary);
        opacity: 0.8;
    }

    .field-input {
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        border-radius: 0.4rem;
        padding: 0.25rem 0.5rem;
        font-size: 0.875rem;
        color: var(--text-primary);
        font-family: var(--font-mono);
    }

    /* Indicator Grid */
    .indicator-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 1.5rem;
    }

    @media (min-width: 768px) {
        .indicator-grid {
            grid-template-columns: repeat(2, 1fr);
        }
    }

    .indicator-card {
        position: relative;
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 1rem;
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }

    .indicator-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.75rem 1rem;
        background: var(--bg-tertiary);
        border-bottom: 1px solid var(--border-color);
    }

    .indicator-header h4 {
        margin: 0;
        font-size: 0.75rem;
        font-weight: 800;
        letter-spacing: 0.05em;
    }

    .indicator-body {
        padding: 1rem;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
    }

    .row {
        display: flex;
        gap: 0.75rem;
    }
    .row-between {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    /* Shared Segmented Control */
    .segmented-control {
        display: flex;
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        padding: 2px;
        border-radius: 0.5rem;
        position: relative;
        overflow: hidden;
    }

    .segmented-btn {
        flex: 1;
        z-index: 1;
        padding: 0.4rem;
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--text-secondary);
        border: none;
        background: transparent;
        cursor: pointer;
        transition: color 0.3s ease;
    }

    .segmented-btn.active {
        color: var(--btn-accent-text);
    }

    .segmented-bg {
        position: absolute;
        top: 2px;
        bottom: 2px;
        left: 2px;
        background: var(--accent-color);
        border-radius: 0.4rem;
        transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .custom-scrollbar::-webkit-scrollbar {
        width: 4px;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
        background: var(--border-color);
        border-radius: 10px;
    }
</style>
