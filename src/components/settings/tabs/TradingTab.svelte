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
            label: $_("settings.calculation.interval1s"),
            tooltip: $_("settings.calculation.interval1sTooltip"),
        },
        {
            value: 2000,
            label: $_("settings.calculation.interval2s"),
            tooltip: $_("settings.calculation.interval2sTooltip"),
        },
        {
            value: 5000,
            label: $_("settings.calculation.interval5s"),
            tooltip: $_("settings.calculation.interval5sTooltip"),
        },
        {
            value: 10000,
            label: $_("settings.calculation.interval10s"),
            tooltip: $_("settings.calculation.interval10sTooltip"),
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
                        ⚡ {$_("settings.trading.managePerformance")}
                    </button>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <!-- Chart History Limit -->
                    <div class="field-group">
                        <label for="history-limit">
                            {$_("settings.trading.historyLength")}
                            <span
                                class="text-[var(--accent-color)] font-mono ml-auto"
                                >{settingsState.chartHistoryLimit}</span
                            >
                        </label>
                        <input
                            id="history-limit"
                            type="range"
                            min="200"
                            max="20000"
                            step="100"
                            bind:value={settingsState.chartHistoryLimit}
                            class="w-full accent-[var(--accent-color)] cursor-pointer"
                        />
                        <p
                            class="text-[10px] text-[var(--text-secondary)] mt-1"
                        >
                            {$_("settings.trading.moreHistoryDesc")}
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
                                {$_("settings.trading.tileActionLinks")}
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
                                            <span class="text-xs">{$_("marketOverview.heatmap")}</span>
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
                                            <span class="text-xs">{$_("marketOverview.broker")}</span>
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
                                                    >{$_("settings.trading.heatmapAction")}</span
                                                >
                                                <select
                                                    bind:value={
                                                        settingsState.heatmapMode
                                                    }
                                                    class="input-field py-1.5 text-xs w-full"
                                                >
                                                    <option
                                                        value="coinglass_new_tab"
                                                        >{$_("settings.trading.coinglassNewTab")}</option
                                                    >
                                                    <option
                                                        value="coinglass_popup"
                                                        >{$_("settings.trading.coinglassPopup")}</option
                                                    >
                                                    <option
                                                        value="coinank_new_tab"
                                                        >{$_("settings.trading.coinankNewTab")}</option
                                                    >
                                                    <option
                                                        value="coinank_popup"
                                                        >{$_("settings.trading.coinankPopup")}</option
                                                    >
                                                </select>
                                                <p
                                                    class="text-[10px] text-[var(--text-secondary)] opacity-80"
                                                >
                                                    {#if settingsState.heatmapMode && settingsState.heatmapMode.includes("coinank")}
                                                        {$_("settings.trading.coinankDesc")}
                                                    {:else}
                                                        {$_("settings.trading.coinglassDesc")}
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
                                >{$_("settings.trading.marketSentiment")}</span
                            >
                            <span
                                class="text-[10px] text-[var(--text-secondary)]"
                                >{$_("settings.trading.showSentimentAnalysis")}</span
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
                                >{$_("settings.trading.showTechnicalAnalysis")}</span
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
                        </div>
                    {/if}

                    <!-- Automation & Advanced -->
                    <div class="border-t border-[var(--border-color)] pt-4 mt-4 mb-4">
                        <h4 class="text-xs font-bold text-[var(--text-secondary)] uppercase mb-2">
                             {$_("settings.trading.automationTitle") || "Automation & Advanced"}
                        </h4>

                        <label class="toggle-card mb-4">
                            <div class="flex flex-col">
                                <span class="text-sm font-medium">{$_("settings.trading.autoTrading")}</span>
                                <span class="text-[10px] text-[var(--text-secondary)]">{$_("settings.trading.autoTradingDesc")}</span>
                            </div>
                            <Toggle bind:checked={settingsState.autoTrading} />
                        </label>

                        <label class="toggle-card mb-4">
                            <div class="flex flex-col">
                                <span class="text-sm font-medium">{$_("settings.trading.multiAccount")}</span>
                                <span class="text-[10px] text-[var(--text-secondary)]">{$_("settings.trading.multiAccountDesc")}</span>
                            </div>
                            <Toggle bind:checked={settingsState.multiAccount} />
                        </label>
                    </div>

                    <!-- Granular Settings (Always Visible) -->
                    <div
                        class="border-t border-[var(--border-color)] pt-4 mt-4"
                    >
                        <h4
                            class="text-xs font-bold text-[var(--text-secondary)] uppercase mb-2"
                        >
                            {$_("settings.trading.indicatorConfiguration")}
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
                            >{$_("settings.hotkeys.safetyMode")}</option
                        >
                        <option value="mode1"
                            >{$_("settings.hotkeys.directMode")}</option
                        >
                        <option value="custom">{$_("settings.hotkeys.customConfig")}</option>
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
                            <strong>{$_("settings.hotkeys.activePreset")}</strong>
                            {settingsState.hotkeyMode === "mode1"
                                ? $_("settings.hotkeys.mode1Desc")
                                : $_("settings.hotkeys.mode2Desc")}
                        </p>
                        <button
                            class="text-xs text-[var(--accent-color)] underline"
                            onclick={() =>
                                (settingsState.hotkeyMode = "custom")}
                            >{$_("settings.hotkeys.switchToCustom")}</button
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
