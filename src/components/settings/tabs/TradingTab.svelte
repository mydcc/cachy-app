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
    import { settingsState } from "../../../stores/settings.svelte";
    import Toggle from "../../shared/Toggle.svelte";
    import HotkeySettings from "../HotkeySettings.svelte";
    import IndicatorSettings from "./IndicatorSettings.svelte";
    import { uiState } from "../../../stores/ui.svelte";

    const intervals = [
        {
            value: 1000,
            label: "1s (Ultra-Fast)",
            tooltip: "Best for scalping (<1min trades). High CPU usage.",
        },
        {
            value: 2000,
            label: "2s (Fast)",
            tooltip: "Great for intraday trading (1-15min). Moderate CPU.",
        },
        {
            value: 5000,
            label: "5s (Normal)",
            tooltip: "Good for day trading (15min+). Balanced.",
        },
        {
            value: 10000,
            label: "10s (Eco)",
            tooltip: "Ideal for swing trading (1h+). Low CPU.",
        },
    ];

    const activeSubTab = $derived(uiState.settingsTradingSubTab);

    const subTabs = [
        {
            id: "market",
            label:
                $_("settings.trading.executionTitle") || "Market & Execution",
        },
        {
            id: "chart",
            label: $_("settings.trading.chartTitle") || "Chart & Technicals",
        },
        { id: "hotkeys", label: $_("settings.tabs.hotkeys") || "Controls" },
    ];
</script>

<div class="trading-tab h-full flex flex-col" role="tabpanel" id="tab-trading">
    <!-- Sub-Navigation -->
    <div
        class="flex flex-wrap gap-2 border-b border-[var(--border-color)] pb-2 mb-4 shrink-0"
    >
        {#each subTabs as tab}
            <button
                class="px-4 py-2 text-xs font-black uppercase tracking-widest rounded-lg transition-all {activeSubTab ===
                tab.id
                    ? 'bg-[var(--accent-color)] text-[var(--btn-accent-text)] shadow-lg scale-105 z-10'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]'}"
                onclick={() => (uiState.settingsTradingSubTab = tab.id)}
            >
                {tab.label}
            </button>
        {/each}
    </div>

    <div class="flex-1 overflow-y-auto custom-scrollbar pr-2">
        <!-- Execution & Fees -->
        {#if activeSubTab === "market"}
            <section class="settings-section animate-fade-in">
                <h3 class="section-title mb-4">{$_("settings.trading.executionData")}</h3>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <!-- Fee Preference -->
                    <div class="field-group">
                        <label for="fee-pref"
                            >{$_("settings.feePreference")}</label
                        >
                        <div class="flex gap-2">
                            <button
                                class="flex-1 px-3 py-2 text-xs font-bold rounded-lg border transition-all {settingsState.feePreference ===
                                'maker'
                                    ? 'bg-[var(--accent-color)] text-[var(--btn-accent-text)] border-[var(--accent-color)] shadow-md'
                                    : 'bg-[var(--bg-secondary)] border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-color)]'}"
                                onclick={() =>
                                    (settingsState.feePreference = "maker")}
                            >
                                MAKER
                            </button>
                            <button
                                class="flex-1 px-3 py-2 text-xs font-bold rounded-lg border transition-all {settingsState.feePreference ===
                                'taker'
                                    ? 'bg-[var(--accent-color)] text-[var(--btn-accent-text)] border-[var(--accent-color)] shadow-md'
                                    : 'bg-[var(--bg-secondary)] border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-color)]'}"
                                onclick={() =>
                                    (settingsState.feePreference = "taker")}
                            >
                                TAKER
                            </button>
                        </div>
                        <p class="text-[10px] text-[var(--text-secondary)]">
                            {$_("settings.feePreferenceDesc")}
                        </p>
                    </div>

                    <!-- Market Interval -->
                    <div class="field-group">
                        <label for="market-interval">
                            {$_("settings.marketDataInterval")}
                            <span
                                class="help-icon"
                                title="How often market prices are updated"
                                >ℹ️</span
                            >
                        </label>
                        <select
                            id="market-interval"
                            bind:value={settingsState.marketDataInterval}
                            class="input-field w-full cursor-pointer transition-all hover:border-[var(--accent-color)]"
                        >
                            {#each intervals as interval}
                                <option
                                    value={interval.value}
                                    title={interval.tooltip}
                                    class="bg-[var(--bg-secondary)] text-[var(--text-primary)]"
                                    >{interval.label}</option
                                >
                            {/each}
                        </select>
                        <p
                            class="text-[10px] text-[var(--text-secondary)] mt-1.5 opacity-80"
                        >
                            {intervals.find(
                                (i) =>
                                    i.value ===
                                    settingsState.marketDataInterval,
                            )?.tooltip ||
                                "Controls data freshness vs CPU usage"}
                        </p>
                    </div>

                    <!-- Spin Buttons -->
                    <div class="field-group">
                        <label for="spin-btn"
                            >{$_("settings.showSpinButtons")}</label
                        >
                        <select
                            id="spin-btn"
                            bind:value={settingsState.showSpinButtons}
                            class="input-field w-full cursor-pointer transition-all hover:border-[var(--accent-color)]"
                        >
                            <option
                                value={true}
                                class="bg-[var(--bg-secondary)] text-[var(--text-primary)]"
                                >{$_("settings.trading.spinButtons.always")}</option
                            >
                            <option
                                value="hover"
                                class="bg-[var(--bg-secondary)] text-[var(--text-primary)]"
                                >{$_("settings.trading.spinButtons.hover")}</option
                            >
                            <option
                                value={false}
                                class="bg-[var(--bg-secondary)] text-[var(--text-primary)]"
                                >{$_("settings.trading.spinButtons.hidden")}</option
                            >
                        </select>
                    </div>

                    <!-- Auto Update Input -->
                    <label class="toggle-card self-end">
                        <div class="flex flex-col">
                            <span class="text-sm font-medium"
                                >{$_("settings.autoUpdatePriceInput")}</span
                            >
                            <span
                                class="text-[10px] text-[var(--text-secondary)]"
                                >{$_("settings.trading.syncPrice")}</span
                            >
                        </div>
                        <Toggle
                            bind:checked={settingsState.autoUpdatePriceInput}
                        />
                    </label>

                    <!-- Confirm Deletions -->
                    <label class="toggle-card">
                        <div class="flex flex-col">
                            <span class="text-sm font-medium"
                                >{$_("settings.trading.confirmDelete")}</span
                            >
                            <span
                                class="text-[10px] text-[var(--text-secondary)]"
                                >{$_("settings.trading.confirmDeleteDesc")}</span
                            >
                        </div>
                        <Toggle
                            bind:checked={settingsState.confirmTradeDeletion}
                        />
                    </label>

                    <label class="toggle-card">
                        <div class="flex flex-col">
                            <span class="text-sm font-medium"
                                >{$_("settings.trading.confirmBulkDelete")}</span
                            >
                            <span
                                class="text-[10px] text-[var(--text-secondary)]"
                                >{$_("settings.trading.confirmBulkDeleteDesc")}</span
                            >
                        </div>
                        <Toggle
                            bind:checked={settingsState.confirmBulkDeletion}
                        />
                    </label>
                </div>
            </section>
        {/if}

        <!-- Chart & Data -->
        {#if activeSubTab === "chart"}
            <section class="settings-section animate-fade-in">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="section-title mb-0">
                        {$_("settings.trading.chartTitle") || "Chart & Data"}
                    </h3>
                    <button
                        class="text-xs text-[var(--accent-color)] hover:underline flex items-center gap-1"
                        onclick={() => {
                            uiState.settingsTab = "system";
                            uiState.settingsSystemSubTab = "performance";
                        }}
                    >
                        ⚡ Manage Performance
                    </button>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <!-- Chart History Limit -->
                    <div class="field-group">
                        <label for="history-limit">
                            History Length (Candles)
                            <span
                                class="text-[var(--accent-color)] font-mono ml-auto"
                                >{settingsState.chartHistoryLimit}</span
                            >
                        </label>
                        <input
                            id="history-limit"
                            type="range"
                            min="200"
                            max="2000"
                            step="100"
                            bind:value={settingsState.chartHistoryLimit}
                            class="w-full accent-[var(--accent-color)] cursor-pointer"
                        />
                        <p
                            class="text-[10px] text-[var(--text-secondary)] mt-1"
                        >
                            More history = slower initial load. (Max: 2000)
                        </p>
                    </div>
                </div>

                <div class="mt-0">
                    <label class="toggle-card mb-4">
                        <div class="flex flex-col">
                            <span class="text-sm font-medium"
                                >{$_("settings.trading.marketTiles")}</span
                            >
                            <span
                                class="text-[10px] text-[var(--text-secondary)]"
                                >{$_("settings.trading.marketTilesDesc")}</span
                            >
                        </div>
                        <Toggle
                            bind:checked={settingsState.showMarketOverview}
                        />
                    </label>

                    <!-- Market Tile Links Configuration -->
                    {#if settingsState.showMarketOverview}
                        <div
                            class="p-4 bg-[var(--bg-secondary)] rounded-lg mb-4 border border-[var(--border-color)]"
                        >
                            <h4
                                class="text-xs font-bold text-[var(--text-secondary)] uppercase mb-3"
                            >
                                Tile Action Links
                            </h4>

                            <div class="flex flex-col gap-3">
                                <!-- Master Toggle -->
                                <label
                                    class="flex items-center justify-between cursor-pointer"
                                >
                                    <span class="text-sm"
                                        >{$_("settings.trading.showLinks")}</span
                                    >
                                    <Toggle
                                        bind:checked={
                                            settingsState.showMarketOverviewLinks
                                        }
                                    />
                                </label>

                                {#if settingsState.showMarketOverviewLinks}
                                    <hr
                                        class="border-[var(--border-color)] my-1"
                                    />

                                    <!-- Individual Link Toggles -->
                                    <div class="grid grid-cols-3 gap-2">
                                        <label
                                            class="flex items-center gap-2 cursor-pointer"
                                        >
                                            <input
                                                type="checkbox"
                                                bind:checked={
                                                    settingsState.showTvLink
                                                }
                                            />
                                            <span class="text-xs"
                                                >{$_("settings.trading.tradingView")}</span
                                            >
                                        </label>
                                        <label
                                            class="flex items-center gap-2 cursor-pointer"
                                        >
                                            <input
                                                type="checkbox"
                                                bind:checked={
                                                    settingsState.showCgHeatLink
                                                }
                                            />
                                            <span class="text-xs">Heatmap</span>
                                        </label>
                                        <label
                                            class="flex items-center gap-2 cursor-pointer"
                                        >
                                            <input
                                                type="checkbox"
                                                bind:checked={
                                                    settingsState.showBrokerLink
                                                }
                                            />
                                            <span class="text-xs">Broker</span>
                                        </label>
                                    </div>

                                    <!-- Heatmap Mode Selection -->
                                    {#if settingsState.showCgHeatLink}
                                        <div
                                            class="mt-2 pt-2 border-t border-[var(--border-color)] border-dashed"
                                        >
                                            <label
                                                class="flex flex-col gap-1.5"
                                            >
                                                <span
                                                    class="text-xs font-semibold text-[var(--text-secondary)]"
                                                    >Heatmap Action</span
                                                >
                                                <select
                                                    bind:value={
                                                        settingsState.heatmapMode
                                                    }
                                                    class="input-field py-1.5 text-xs w-full"
                                                >
                                                    <option
                                                        value="coinglass_new_tab"
                                                        >Coinglass (New Tab)</option
                                                    >
                                                    <option
                                                        value="coinglass_popup"
                                                        >Coinglass (Popup
                                                        Window)</option
                                                    >
                                                    <option
                                                        value="coinank_new_tab"
                                                        >Coinank (New Tab)</option
                                                    >
                                                    <option
                                                        value="coinank_popup"
                                                        >Coinank (ProChart
                                                        Popup)</option
                                                    >
                                                </select>
                                                <p
                                                    class="text-[10px] text-[var(--text-secondary)] opacity-80"
                                                >
                                                    {#if settingsState.heatmapMode && settingsState.heatmapMode.includes("coinank")}
                                                        Maps current timeframe
                                                        to Heatmap lookback
                                                        period.
                                                    {:else}
                                                        Opens Coinglass
                                                        liquidation heatmap.
                                                    {/if}
                                                </p>
                                            </label>
                                        </div>
                                    {/if}
                                {/if}
                            </div>
                        </div>
                    {/if}

                    <label class="toggle-card mb-4">
                        <div class="flex flex-col">
                            <span class="text-sm font-medium"
                                >Market Sentiment</span
                            >
                            <span
                                class="text-[10px] text-[var(--text-secondary)]"
                                >Show sentiment analysis panel</span
                            >
                        </div>
                        <Toggle
                            bind:checked={settingsState.showMarketSentiment}
                        />
                    </label>

                    <label class="toggle-card mb-4">
                        <div class="flex flex-col">
                            <span class="text-sm font-medium"
                                >{$_("settings.showTechnicals")}</span
                            >
                            <span
                                class="text-[10px] text-[var(--text-secondary)]"
                                >Show technical analysis panel</span
                            >
                        </div>
                        <Toggle bind:checked={settingsState.showTechnicals} />
                    </label>

                    {#if settingsState.showTechnicals}
                        <div
                            class="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-4 p-4 bg-[var(--bg-secondary)] rounded-lg"
                        >
                            <!-- Summary -->
                            <label class="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    bind:checked={settingsState.showTechnicalsSummary}
                                />
                                <span class="text-xs">
                                    {$_("settings.technicals.summaryAction") || "Summary"}
                                </span>
                            </label>

                            <!-- Oscillators -->
                            <label class="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    bind:checked={settingsState.showTechnicalsOscillators}
                                />
                                <span class="text-xs">
                                    {$_("settings.technicals.oscillators") || "Oscillators"}
                                </span>
                            </label>

                            <!-- Moving Averages -->
                            <label class="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    bind:checked={settingsState.showTechnicalsMAs}
                                />
                                <span class="text-xs">
                                    {$_("settings.technicals.movingAverages") || "Moving Avgs"}
                                </span>
                            </label>

                            <!-- Pivots (Syncs with Calculation) -->
                            <label class="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={settingsState.showTechnicalsPivots}
                                    onchange={(e) => {
                                        const val = e.currentTarget.checked;
                                        settingsState.showTechnicalsPivots = val;
                                        // Sync with calculation engine to ensure data exists
                                        settingsState.enabledIndicators.pivots = val;
                                    }}
                                />
                                <span class="text-xs">
                                    {$_("settings.technicals.pivots") || "Pivots"}
                                </span>
                            </label>
                        </div>
                    {/if}

                    <!-- Granular Settings (Always Visible) -->
                    <div
                        class="border-t border-[var(--border-color)] pt-4 mt-4"
                    >
                        <h4
                            class="text-xs font-bold text-[var(--text-secondary)] uppercase mb-2"
                        >
                            Indicator Configuration
                        </h4>
                        <IndicatorSettings />
                    </div>
                </div>
            </section>
        {/if}

        <!-- Hotkeys -->
        {#if activeSubTab === "hotkeys"}
            <section class="settings-section animate-fade-in">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="section-title mb-0">
                        {$_("settings.profile.hotkeysTitle") ||
                            "Keyboard Shortcuts"}
                    </h3>
                    <select
                        bind:value={settingsState.hotkeyMode}
                        class="input-field w-auto py-1 text-xs"
                    >
                        <option value="mode2"
                            >Safety Mode (Alt+ Required)</option
                        >
                        <option value="mode1"
                            >Direct Mode (Fast, No Modifier)</option
                        >
                        <option value="custom">Custom Configuration</option>
                    </select>
                </div>

                {#if settingsState.hotkeyMode === "custom"}
                    <div
                        class="p-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)]"
                    >
                        <HotkeySettings />
                    </div>
                {:else}
                    <div
                        class="p-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)]"
                    >
                        <p class="text-xs text-[var(--text-secondary)] mb-2">
                            <strong>Active Preset:</strong>
                            {settingsState.hotkeyMode === "mode1"
                                ? '⚡ Direct Mode - Press "L" for Long, "S" for Short (fastest)'
                                : '🛡️ Safety Mode - Press "Alt+L" for Long, "Alt+S" for Short (prevents accidents)'}
                        </p>
                        <button
                            class="text-xs text-[var(--accent-color)] underline"
                            onclick={() =>
                                (settingsState.hotkeyMode = "custom")}
                            >Switch to Custom Configuration</button
                        >
                    </div>
                {/if}
            </section>
        {/if}
    </div>
</div>

<style>
    /* Removed old section titles and icon-box as they are less needed in sub-tabs or should be minimal */
    .field-group {
        display: flex;
        flex-direction: column;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--text-secondary);
    }
    .field-group {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    .field-group label {
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--text-secondary);
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }
    .help-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 16px;
        height: 16px;
        font-size: 12px;
        cursor: help;
        opacity: 0.7;
        transition: opacity 0.2s;
    }
    .help-icon:hover {
        opacity: 1;
    }
    .input-field {
        background-color: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 0.5rem;
        padding: 0.5rem 0.75rem;
        font-size: 0.875rem;
        color: var(--text-primary);
        outline: none;
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
