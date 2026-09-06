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
    import { numberInput } from "../../../utils/inputUtils";
    import Toggle from "../../shared/Toggle.svelte";
    import RiskLimitsSettings from "../RiskLimitsSettings.svelte";
    import ConfirmationSettings from "../ConfirmationSettings.svelte";
    import NotificationSettings from "../NotificationSettings.svelte";
    import PaperTradingSettings from "../PaperTradingSettings.svelte";
    import OrderAuditSettings from "../OrderAuditSettings.svelte";
    import SettingsGrid from "../shared/SettingsGrid.svelte";
    import { uiState } from "../../../stores/ui.svelte";

    // "hotkeys" lived here until it moved to System → Controls; unknown
    // persisted values fall back to "market" so the tab never renders blank.
    const validSubTabs = ["market", "chart", "risk", "paper", "audit"];
    const activeSubTab = $derived(
        validSubTabs.includes(uiState.settingsTradingSubTab)
            ? uiState.settingsTradingSubTab
            : "market",
    );

    const exchange = $derived(settingsState.apiProvider);
    const venueName = $derived(
        exchange.charAt(0).toUpperCase() + exchange.slice(1),
    );

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
        {
            id: "risk",
            label: $_("settings.risk.subTab") || "Risk & Kill Switch",
        },
        {
            id: "paper",
            label: $_("settings.paper.subTab") || "Paper Trading",
        },
        {
            id: "audit",
            label: $_("settings.audit.subTab") || "Order Log",
        },
    ];
</script>

<div class="trading-tab flex flex-col gap-3 sm:gap-4 md:gap-6" role="tabpanel" id="tab-trading">
    <!-- Sub-Navigation -->
    <div
        class="flex gap-2 overflow-x-auto border-b border-[var(--border-color)] pb-2 shrink-0 custom-scrollbar"
    >
        {#each subTabs as tab}
            <button
                class="px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 {activeSubTab ===
                tab.id
                    ? 'bg-[var(--accent-color)] text-[var(--btn-accent-text)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]'}"
                onclick={() => (uiState.settingsTradingSubTab = tab.id)}
            >
                {tab.label}
            </button>
        {/each}
    </div>

    <div class="min-w-0">
        <!-- Execution & Fees -->
        {#if activeSubTab === "market"}
            <section class="settings-section animate-fade-in">
                <h3 class="section-title mb-4">{$_("settings.trading.executionData")}</h3>

                <SettingsGrid gap="gap-4">
                    <!-- Fees: preference + per-venue rates belong together -->
                    <div class="col-span-full flex flex-col gap-4">
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

                    <!--
                        FEAT-0253 — personal per-venue fee rates. Source of
                        truth for the simulated calculation; the user enters
                        what their broker level actually charges. Defaults are
                        prefilled from VENUE_DEFAULT_FEE_RATES.
                    -->
                    <div class="field-group border-t border-[var(--border-color)] pt-4">
                        <label for="fee-rate-maker"
                            >{$_("settings.feeRates", {
                                values: { venue: venueName },
                            })}</label
                        >
                        <div class="flex gap-3">
                            <div class="relative flex-1 min-w-0">
                                <input
                                    id="fee-rate-maker"
                                    name="fee-rate-maker"
                                    type="text"
                                    inputmode="decimal"
                                    data-track-id="input-fee-rate-maker"
                                    aria-label={$_("settings.feeRatesMaker")}
                                    use:numberInput={{ maxDecimalPlaces: 4 }}
                                    value={settingsState.feeRates[exchange].maker}
                                    oninput={(e) => {
                                        settingsState.feeRates[exchange].maker = (
                                            e.target as HTMLInputElement
                                        ).value;
                                    }}
                                    class="input-field w-full pr-8"
                                />
                                <span
                                    class="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] uppercase text-[var(--text-secondary)]"
                                    >{$_("settings.feeRatesMaker")}</span
                                >
                            </div>
                            <div class="relative flex-1 min-w-0">
                                <input
                                    id="fee-rate-taker"
                                    name="fee-rate-taker"
                                    type="text"
                                    inputmode="decimal"
                                    data-track-id="input-fee-rate-taker"
                                    aria-label={$_("settings.feeRatesTaker")}
                                    use:numberInput={{ maxDecimalPlaces: 4 }}
                                    value={settingsState.feeRates[exchange].taker}
                                    oninput={(e) => {
                                        settingsState.feeRates[exchange].taker = (
                                            e.target as HTMLInputElement
                                        ).value;
                                    }}
                                    class="input-field w-full pr-8"
                                />
                                <span
                                    class="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] uppercase text-[var(--text-secondary)]"
                                    >{$_("settings.feeRatesTaker")}</span
                                >
                            </div>
                        </div>
                        <p class="text-[10px] text-[var(--text-secondary)]">
                            {$_("settings.feeRatesDesc")}
                        </p>
                    </div>
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

                    <!-- Save paper trades to the journal -->
                    <label class="toggle-card gap-3">
                        <div class="flex flex-col min-w-0 flex-1">
                            <span class="text-sm font-medium"
                                >{$_("settings.trading.journalPaperTrades")}</span
                            >
                            <span
                                class="text-[10px] text-[var(--text-secondary)]"
                                >{$_(
                                    "settings.trading.journalPaperTradesDesc",
                                )}</span
                            >
                        </div>
                        <Toggle
                            bind:checked={settingsState.journalPaperTrades}
                        />
                    </label>

                    <!-- Auto Update Input -->
                    <label class="toggle-card self-end gap-3">
                        <div class="flex flex-col min-w-0 flex-1">
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
                    <label class="toggle-card gap-3">
                        <div class="flex flex-col min-w-0 flex-1">
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

                    <label class="toggle-card gap-3">
                        <div class="flex flex-col min-w-0 flex-1">
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

                    <!-- Automation & Advanced (moved from Chart & Data; execution behaviour lives with execution) -->
                    <div class="border-t border-[var(--border-color)] pt-4 mt-4 mb-4 col-span-full">
                        <h4 class="text-xs font-bold text-[var(--text-secondary)] uppercase mb-2">
                             {$_("settings.trading.automationTitle") || "Automation & Advanced"}
                        </h4>

                        <label class="toggle-card mb-4 gap-3">
                            <div class="flex flex-col min-w-0 flex-1">
                                <span class="text-sm font-medium">{$_("settings.trading.autoTrading")}</span>
                                <span class="text-[10px] text-[var(--text-secondary)]">{$_("settings.trading.autoTradingDesc")}</span>
                            </div>
                            <Toggle bind:checked={settingsState.autoTrading} />
                        </label>

                        <label class="toggle-card gap-3">
                            <div class="flex flex-col min-w-0 flex-1">
                                <span class="text-sm font-medium">{$_("settings.trading.multiAccount")}</span>
                                <span class="text-[10px] text-[var(--text-secondary)]">{$_("settings.trading.multiAccountDesc")}</span>
                            </div>
                            <Toggle bind:checked={settingsState.multiAccount} />
                        </label>
                    </div>
                </SettingsGrid>
            </section>
        {/if}

        <!-- Chart & Data -->
        {#if activeSubTab === "chart"}
            <section class="settings-section animate-fade-in">
                <div class="flex justify-between items-center gap-2 mb-4">
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

                <SettingsGrid gap="gap-4">
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

                    <!-- Chart Render Update Interval -->
                    <div class="field-group">
                        <label for="render-interval">
                            {$_("settings.trading.chartUpdateInterval") || "Kerzenchart Aktualisierungsrate"}
                        </label>
                        <select
                            id="render-interval"
                            bind:value={settingsState.chartRenderIntervalMs}
                            class="input-field w-full cursor-pointer transition-all hover:border-[var(--accent-color)]"
                        >
                            <option value={0}>{$_("settings.trading.renderRealtime")}</option>
                            <option value={20}>{$_("settings.trading.renderUltra")}</option>
                            <option value={50}>{$_("settings.trading.renderVeryFast")}</option>
                            <option value={100}>{$_("settings.trading.renderFast")}</option>
                            <option value={200}>{$_("settings.trading.renderNormal")}</option>
                            <option value={500}>{$_("settings.trading.renderEco")}</option>
                        </select>
                        <p class="text-[10px] text-[var(--text-secondary)] mt-1">
                            {$_("settings.trading.chartUpdateIntervalDesc") || "Steuert wie oft Kerzen-Echtzeitkurse neu gezeichnet werden."}
                        </p>
                    </div>
                </SettingsGrid>

                <SettingsGrid>
                    <label class="toggle-card mb-4 gap-3 col-span-full">
                        <div class="flex flex-col min-w-0 flex-1">
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
                            class="p-4 bg-[var(--bg-secondary)] rounded-lg mb-4 border border-[var(--border-color)] col-span-full"
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
                                    <SettingsGrid cols={3} gap="gap-2">
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
                                    </SettingsGrid>

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

                    <label class="toggle-card mb-4 gap-3">
                        <div class="flex flex-col min-w-0 flex-1">
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

                    <label class="toggle-card mb-4 gap-3">
                        <div class="flex flex-col min-w-0 flex-1">
                            <span class="text-sm font-medium"
                                >{$_("dashboard.marketActivity")}</span
                            >
                            <span
                                class="text-[10px] text-[var(--text-secondary)]"
                                >{$_("settings.showSidebarActivity")}</span
                            >
                        </div>
                        <Toggle
                            bind:checked={settingsState.showSidebarActivity}
                        />
                    </label>

                    <label class="toggle-card mb-4 gap-3">
                        <div class="flex flex-col min-w-0 flex-1">
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
                        <SettingsGrid
                            gap="gap-2"
                            extraClass="col-span-full mb-4 p-4 bg-[var(--bg-secondary)] rounded-lg"
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
                                    }}
                                />
                                <span class="text-xs">
                                    {$_("settings.technicals.pivots") || "Pivots"}
                                </span>
                            </label>
                        </SettingsGrid>
                    {/if}

                    <!-- Granular Settings (moved to the Chart tab; single home for all indicator settings) -->
                </SettingsGrid>
            </section>
        {/if}

        <!-- Risk & Kill Switch -->
        {#if activeSubTab === "risk"}
            <section class="animate-fade-in space-y-6">
                <RiskLimitsSettings />
                <!--
                  FEAT-0024 sits under the risk limits rather than in a tab of
                  its own. Both answer the same question — what stops money
                  going out by accident — and someone here to set a limit is
                  the same person who wants to say which actions ask first.
                -->
                <ConfirmationSettings />
                <!--
                  FEAT-0025 joins the same sub-tab. Confirmations ask before an
                  action; notifications report after one. Both answer what the
                  app does without being watched, which is why they read as one
                  screen rather than two.
                -->
                <NotificationSettings />
            </section>
        {/if}

        {#if activeSubTab === "paper"}
            <section class="animate-fade-in">
                <PaperTradingSettings />
            </section>
        {/if}

        {#if activeSubTab === "audit"}
            <section class="animate-fade-in">
                <OrderAuditSettings />
            </section>
        {/if}

    </div>
</div>

<style>
    /* Removed old section titles and icon-box as they are less needed in sub-tabs or should be minimal */
    .field-group {
        display: flex;
        flex-direction: column;
        font-weight: var(--font-bold);
        color: var(--text-secondary);
    }
    .field-group {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    .field-group label {
        font-size: var(--text-xs);
        font-weight: var(--font-semibold);
        color: var(--text-secondary);
        display: flex;
        align-items: center;
        gap: 0.5rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .input-field {
        background-color: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-lg);
        padding: var(--space-2) var(--space-3);
        font-size: var(--text-sm);
        color: var(--text-primary);
        outline: none;
    }
    .toggle-card {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: var(--space-4);
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-xl);
        cursor: pointer;
    }
</style>
