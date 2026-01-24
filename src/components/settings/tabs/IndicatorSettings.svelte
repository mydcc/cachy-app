<script lang="ts">
    import { _ } from "../../../locales/i18n";
    import Toggle from "../../shared/Toggle.svelte";
    import { enhancedInput } from "../../../lib/actions/inputEnhancements";
    import TimeframeSelector from "../../shared/TimeframeSelector.svelte";
    import { settingsState } from "../../../stores/settings.svelte";
    import { indicatorState } from "../../../stores/indicator.svelte";
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

    let activeCategory = $state<
        "general" | "oscillators" | "trend" | "volatility" | "volume"
    >("general");

    const categories = [
        { id: "general", label: "General" },
        { id: "oscillators", label: "Oscillators" },
        { id: "trend", label: "Trend" },
        { id: "volatility", label: "Volatility" },
        { id: "volume", label: "Volume" },
    ] as const;

    const pnlModes = [
        { value: "value", label: "Absolute" },
        { value: "percent", label: "Percent %" },
        { value: "bar", label: "Visual Bar" },
    ];
</script>

<div class="indicator-settings flex flex-col gap-4">
    <!-- Sub-Navigation -->
    <div
        class="flex flex-wrap gap-2 border-b border-[var(--border-color)] pb-2 mb-2"
    >
        {#each categories as category}
            <button
                class="category-btn px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors {activeCategory ===
                category.id
                    ? 'bg-[var(--accent-color)] text-white'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'}"
                onclick={() => (activeCategory = category.id)}
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
                        <label for="precision">Data Precision</label>
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
                            >History Scope (Candles)</label
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
                </div>

                <label class="toggle-card mt-4">
                    <div class="flex flex-col">
                        <span class="text-sm font-medium"
                            >Synchronize RSI Timeframe</span
                        >
                        <span class="text-[10px] text-[var(--text-secondary)]"
                            >Use chart timeframe for RSI</span
                        >
                    </div>
                    <Toggle bind:checked={settingsState.syncRsiTimeframe} />
                </label>

                <!-- PnL Mode -->
                <div class="field-group mt-4">
                    <span
                        class="text-xs font-semibold text-[var(--text-secondary)] mb-2"
                        >PnL Display Mode</span
                    >
                    <div class="flex gap-2">
                        {#each pnlModes as mode}
                            <button
                                class="px-3 py-2 text-xs rounded border transition-colors {settingsState.pnlViewMode ===
                                mode.value
                                    ? 'bg-[var(--accent-color)] text-white border-[var(--accent-color)]'
                                    : 'bg-[var(--bg-secondary)] border-[var(--border-color)]'}"
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
                        >Favorite Timeframes</span
                    >
                    <TimeframeSelector
                        bind:selected={settingsState.favoriteTimeframes}
                        options={availableTimeframes}
                    />
                </div>
            </section>
        {:else if activeCategory === "oscillators"}
            <div class="grid grid-cols-1 gap-4">
                <!-- RSI -->
                <div
                    class="p-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)]"
                >
                    <h4 class="text-xs font-bold uppercase mb-2">RSI</h4>
                    <div class="grid grid-cols-2 gap-2">
                        <Field
                            id="rsi-len"
                            label="Length"
                            type="number"
                            bind:value={indicatorState.rsi.length}
                            min={2}
                        />
                        <Select
                            id="rsi-src"
                            label="Source"
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
                    <div class="flex items-center justify-between mt-2">
                        <span class="text-xs">Show Signal Line</span>
                        <Toggle bind:checked={indicatorState.rsi.showSignal} />
                    </div>
                </div>
                <!-- Stoch RSI -->
                <div
                    class="p-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)]"
                >
                    <h4 class="text-xs font-bold uppercase mb-2">Stoch RSI</h4>
                    <div class="grid grid-cols-2 gap-2">
                        <Field
                            id="srsi-len"
                            label="Len"
                            type="number"
                            bind:value={indicatorState.stochRsi.length}
                            min={2}
                        />
                        <Field
                            id="srsi-rlen"
                            label="RSI Len"
                            type="number"
                            bind:value={indicatorState.stochRsi.rsiLength}
                            min={2}
                        />
                        <Field
                            id="srsi-k"
                            label="%K"
                            type="number"
                            bind:value={indicatorState.stochRsi.kPeriod}
                        />
                        <Field
                            id="srsi-d"
                            label="%D"
                            type="number"
                            bind:value={indicatorState.stochRsi.dPeriod}
                        />
                    </div>
                </div>
            </div>
        {:else if activeCategory === "trend"}
            <div class="grid grid-cols-1 gap-4">
                <!-- MACD -->
                <div
                    class="p-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)]"
                >
                    <h4 class="text-xs font-bold uppercase mb-2">MACD</h4>
                    <div class="grid grid-cols-3 gap-2">
                        <Field
                            id="macd-fast"
                            label="Fast"
                            type="number"
                            bind:value={indicatorState.macd.fastLength}
                        />
                        <Field
                            id="macd-slow"
                            label="Slow"
                            type="number"
                            bind:value={indicatorState.macd.slowLength}
                        />
                        <Field
                            id="macd-sig"
                            label="Signal"
                            type="number"
                            bind:value={indicatorState.macd.signalLength}
                        />
                    </div>
                </div>
                <!-- SuperTrend -->
                <div
                    class="p-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)]"
                >
                    <h4 class="text-xs font-bold uppercase mb-2">SuperTrend</h4>
                    <div class="grid grid-cols-2 gap-2">
                        <Field
                            id="st-fac"
                            label="Factor"
                            type="number"
                            step={0.1}
                            bind:value={indicatorState.superTrend.factor}
                        />
                        <Field
                            id="st-per"
                            label="Period"
                            type="number"
                            bind:value={indicatorState.superTrend.period}
                        />
                    </div>
                </div>
            </div>
        {:else if activeCategory === "volatility"}
            <div class="grid grid-cols-1 gap-4">
                <!-- Bollinger -->
                <div
                    class="p-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)]"
                >
                    <h4 class="text-xs font-bold uppercase mb-2">
                        Bollinger Bands
                    </h4>
                    <div class="grid grid-cols-2 gap-2">
                        <Field
                            id="bb-len"
                            label="Length"
                            type="number"
                            bind:value={indicatorState.bollingerBands.length}
                        />
                        <Field
                            id="bb-std"
                            label="StdDev"
                            type="number"
                            step={0.1}
                            bind:value={indicatorState.bollingerBands.stdDev}
                        />
                    </div>
                </div>
                <!-- ATR -->
                <div
                    class="p-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)]"
                >
                    <h4 class="text-xs font-bold uppercase mb-2">ATR</h4>
                    <Field
                        id="atr-len"
                        label="Length"
                        type="number"
                        bind:value={indicatorState.atr.length}
                    />
                </div>
            </div>
        {:else if activeCategory === "volume"}
            <div class="grid grid-cols-1 gap-4">
                <div
                    class="p-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)]"
                >
                    <h4 class="text-xs font-bold uppercase mb-2">Volume MA</h4>
                    <div class="grid grid-cols-2 gap-2">
                        <Field
                            id="vma-len"
                            label="Length"
                            type="number"
                            bind:value={indicatorState.volumeMa.length}
                        />
                        <Select
                            id="vma-type"
                            label="Type"
                            bind:value={indicatorState.volumeMa.maType}
                            options={["sma", "ema", "wma"]}
                        />
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
