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
        {
            id: "oscillators",
            label: $_("settings.technicals.oscillators"),
        },
        { id: "trend", label: $_("settings.indicators.trend") },
        {
            id: "volatility",
            label: $_("settings.indicators.volatility"),
        },
        { id: "volume", label: $_("settings.indicators.volume") },
    ] as const;

    const pnlModes = [
        { value: "value", label: $_("settings.technicals.pnlModes.absolute") },
        { value: "percent", label: $_("settings.technicals.pnlModes.percent") },
        { value: "bar", label: $_("settings.technicals.pnlModes.bar") },
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

                <label class="toggle-card mt-2">
                    <div class="flex flex-col">
                        <span class="text-sm font-medium"
                            >{$_("settings.technicals.pivots")}</span
                        >
                        <span class="text-[10px] text-[var(--text-secondary)]"
                            >{$_("settings.technicals.pivotsDesc")}</span
                        >
                    </div>
                    <Toggle
                        bind:checked={settingsState.enabledIndicators.pivots}
                    />
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
            <div class="grid grid-cols-1 gap-4">
                <!-- RSI -->
                <div
                    class="p-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)]"
                >
                    <h4 class="text-xs font-bold uppercase mb-2">{$_("settings.technicals.rsi.title")}</h4>
                    <div class="grid grid-cols-2 gap-2">
                        <Field
                            id="rsi-len"
                            label={$_("settings.technicals.labels.length")}
                            type="number"
                            bind:value={indicatorState.rsi.length}
                            min={2}
                        />
                        <Select
                            id="rsi-src"
                            label={$_("settings.technicals.labels.source")}
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
                        <span class="text-xs">{$_("settings.technicals.rsi.showSignal")}</span>
                        <Toggle bind:checked={indicatorState.rsi.showSignal} />
                    </div>
                </div>
                <!-- Stoch RSI -->
                <div
                    class="p-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)]"
                >
                    <h4 class="text-xs font-bold uppercase mb-2">{$_("settings.technicals.stochRsi.title")}</h4>
                    <div class="grid grid-cols-2 gap-2">
                        <Field
                            id="srsi-len"
                            label={$_("settings.technicals.stochRsi.len")}
                            type="number"
                            bind:value={indicatorState.stochRsi.length}
                            min={2}
                        />
                        <Field
                            id="srsi-rlen"
                            label={$_("settings.technicals.stochRsi.rsiLen")}
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
                    <h4 class="text-xs font-bold uppercase mb-2">{$_("settings.technicals.macd.title")}</h4>
                    <div class="grid grid-cols-3 gap-2">
                        <Field
                            id="macd-fast"
                            label={$_("settings.technicals.labels.fast")}
                            type="number"
                            bind:value={indicatorState.macd.fastLength}
                        />
                        <Field
                            id="macd-slow"
                            label={$_("settings.technicals.labels.slow")}
                            type="number"
                            bind:value={indicatorState.macd.slowLength}
                        />
                        <Field
                            id="macd-sig"
                            label={$_("settings.technicals.labels.signal")}
                            type="number"
                            bind:value={indicatorState.macd.signalLength}
                        />
                    </div>
                </div>
                <!-- SuperTrend -->
                <div
                    class="p-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)]"
                >
                    <h4 class="text-xs font-bold uppercase mb-2">{$_("settings.technicals.superTrend.title")}</h4>
                    <div class="grid grid-cols-2 gap-2">
                        <Field
                            id="st-fac"
                            label={$_("settings.technicals.labels.factor")}
                            type="number"
                            step={0.1}
                            bind:value={indicatorState.superTrend.factor}
                        />
                        <Field
                            id="st-per"
                            label={$_("settings.technicals.labels.period")}
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
                        {$_("settings.technicals.bollingerBands.title")}
                    </h4>
                    <div class="grid grid-cols-2 gap-2">
                        <Field
                            id="bb-len"
                            label={$_("settings.technicals.labels.length")}
                            type="number"
                            bind:value={indicatorState.bollingerBands.length}
                        />
                        <Field
                            id="bb-std"
                            label={$_("settings.technicals.bollingerBands.stdDev")}
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
                    <h4 class="text-xs font-bold uppercase mb-2">{$_("settings.technicals.atr")}</h4>
                    <Field
                        id="atr-len"
                        label={$_("settings.technicals.labels.length")}
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
                    <h4 class="text-xs font-bold uppercase mb-2">{$_("settings.technicals.volumeMa.title")}</h4>
                    <div class="grid grid-cols-2 gap-2">
                        <Field
                            id="vma-len"
                            label={$_("settings.technicals.labels.length")}
                            type="number"
                            bind:value={indicatorState.volumeMa.length}
                        />
                        <Select
                            id="vma-type"
                            label={$_("settings.technicals.labels.type")}
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
