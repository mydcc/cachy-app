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
    import { uiState } from "../../../stores/ui.svelte";
    import CalculationSettings from "../CalculationSettings.svelte";
    import CalculationDashboard from "../../shared/CalculationDashboard.svelte";
    import PerformanceMonitor from "../../shared/PerformanceMonitor.svelte";
    import DataMaintenance from "../DataMaintenance.svelte";

    let { onBackup, onRestore, onReset } = $props<{
        onBackup: () => void;
        onRestore: (e: Event) => void;
        onReset: () => void;
    }>();

    function clearAppCache() {
        localStorage.removeItem("cachy_news_cache");
        localStorage.removeItem("cachy_market_cache"); // Hypothetical
        alert($_("settings.system.cacheCleared") || "Cache cleared.");
    }

    function reloadApp() {
        window.location.reload();
    }

    const activeSubTab = $derived(uiState.settingsSystemSubTab);

    const subTabs = [
        {
            id: "performance",
            label: $_("settings.system.performance") || "Performance",
        },
        {
            id: "dashboard",
            label: $_("settings.system.dashboard") || "Dashboard",
        },
        { id: "data", label: $_("settings.tabs.data") || "Data & Backup" },
        {
            id: "maintenance",
            label: $_("settings.tabs.maintenance") || "Maintenance",
        },
    ];
</script>

<div class="system-tab h-full flex flex-col" role="tabpanel" id="tab-system">
    <!-- Sub-Navigation -->
    <div
        class="flex flex-wrap gap-2 border-b border-[var(--border-color)] pb-2 mb-4 shrink-0"
    >
        {#each subTabs as tab}
            <button
                class="px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors {activeSubTab ===
                tab.id
                    ? 'bg-[var(--accent-color)] text-[var(--btn-accent-text)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'}"
                onclick={() => (uiState.settingsSystemSubTab = tab.id)}
            >
                {tab.label}
            </button>
        {/each}
    </div>

    <div class="flex-1 overflow-y-auto custom-scrollbar pr-2">
        <!-- Performance & Resources -->
        {#if activeSubTab === "performance"}
            <section class="settings-section animate-fade-in">
                <h3 class="section-title mb-4">
                    {$_("settings.system.performance") || "Performance"}
                </h3>

                <!-- Calculation Settings Component -->
                <CalculationSettings />

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                    <!-- Network Logs -->
                    <div
                        class="action-card flex items-center justify-between p-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)]"
                    >
                        <div>
                            <div class="font-bold text-sm">
                                {$_("settings.system.networkLogs") ||
                                    "Network Logging"}
                            </div>
                            <div
                                class="text-[10px] text-[var(--text-secondary)]"
                            >
                                {$_("settings.system.networkLogsDesc") ||
                                    "Show API traffic in console."}
                            </div>
                        </div>
                        <Toggle
                            bind:checked={settingsState.enableNetworkLogs}
                        />
                    </div>

                    <!-- Debug Mode -->
                    <div
                        class="action-card flex items-center justify-between p-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)]"
                    >
                        <div>
                            <div class="font-bold text-sm">
                                {$_("settings.system.debugMode") ||
                                    "Debug Mode"}
                            </div>
                            <div
                                class="text-[10px] text-[var(--text-secondary)]"
                            >
                                {$_("settings.system.debugModeDesc") ||
                                    "Show detailed logs and hidden features."}
                            </div>
                        </div>
                        <Toggle bind:checked={settingsState.debugMode} />
                    </div>
                </div>

                <!-- Quick Actions -->
                <h4
                    class="text-xs font-bold text-[var(--text-secondary)] uppercase mt-6 mb-2"
                >
                    {$_("settings.system.quickActions")}
                </h4>
                <div class="grid grid-cols-2 gap-4">
                    <button
                        class="btn-secondary text-xs py-2 flex items-center justify-center gap-2"
                        onclick={clearAppCache}
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            ><path d="M3 6h18" /><path
                                d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"
                            /><path
                                d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"
                            /><path
                                d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"
                            /></svg
                        >
                        {$_("settings.system.clearCache") || "Clear Cache"}
                    </button>
                    <button
                        class="btn-secondary text-xs py-2 flex items-center justify-center gap-2"
                        onclick={reloadApp}
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            ><path
                                d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"
                            /><path d="M3 3v5h5" /></svg
                        >
                        {$_("settings.system.reloadApp") || "Reload App"}
                    </button>
                </div>

                <label class="toggle-card mt-4">
                    <div class="flex flex-col">
                        <span class="text-sm font-medium"
                            >{$_("settings.system.englishTechnicalTerms")}</span
                        >
                        <span class="text-[10px] text-[var(--text-secondary)]"
                            >{$_("settings.system.avoidTranslating")}</span
                        >
                    </div>
                    <Toggle
                        bind:checked={settingsState.forceEnglishTechnicalTerms}
                    />
                </label>
            </section>
        {/if}

        <!-- Dashboard Tab -->
        {#if activeSubTab === "dashboard"}
            <section class="settings-section animate-fade-in">
                <PerformanceMonitor />
                <div class="mt-6">
                    <CalculationDashboard />
                </div>
            </section>
        {/if}

        <!-- Data Health & Backup -->
        {#if activeSubTab === "data"}
            <section class="settings-section animate-fade-in">
                <h3 class="section-title mb-4">
                    {$_("settings.system.dataMaintenance") || "Data & Backup"}
                </h3>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button
                        class="flex items-center gap-3 p-4 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors text-left group"
                        onclick={onBackup}
                    >
                        <div
                            class="p-2 rounded-md bg-blue-500/10 text-blue-500 group-hover:bg-blue-500 group-hover:text-white transition-colors"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="18"
                                height="18"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                ><path
                                    d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
                                /><polyline points="17 8 12 3 7 8" /><line
                                    x1="12"
                                    x2="12"
                                    y1="3"
                                    y2="15"
                                /></svg
                            >
                        </div>
                        <div>
                            <div class="font-bold text-sm">
                                {$_("settings.system.backup") ||
                                    "Create Backup"}
                            </div>
                            <div
                                class="text-[10px] text-[var(--text-secondary)]"
                            >
                                {$_("settings.system.backupDesc") ||
                                    "Save your settings & data."}
                            </div>
                        </div>
                    </button>

                    <label
                        class="flex items-center gap-3 p-4 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors text-left cursor-pointer group"
                    >
                        <div
                            class="p-2 rounded-md bg-emerald-500/10 text-emerald-500 group-hover:bg-emerald-500 group-hover:text-white transition-colors"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="18"
                                height="18"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                ><path
                                    d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
                                /><polyline points="7 10 12 15 17 10" /><line
                                    x1="12"
                                    x2="12"
                                    y1="15"
                                    y2="3"
                                /></svg
                            >
                        </div>
                        <div>
                            <div class="font-bold text-sm">
                                {$_("settings.system.restore") ||
                                    "Restore Backup"}
                            </div>
                            <div
                                class="text-[10px] text-[var(--text-secondary)]"
                            >
                                {$_("settings.system.restoreDesc") ||
                                    "Import from file."}
                            </div>
                        </div>
                        <input
                            type="file"
                            accept=".json"
                            onchange={onRestore}
                            class="hidden"
                        />
                    </label>
                </div>

                <div class="mt-8">
                    <DataMaintenance />
                </div>
            </section>
        {/if}

        <!-- Danger Zone -->
        {#if activeSubTab === "maintenance"}
            <section class="settings-section animate-fade-in">
                <h3 class="section-title text-red-500 mb-4">
                    {$_("settings.system.dangerZone") || "Danger Zone"}
                </h3>

                <div
                    class="p-4 border border-red-500/30 bg-red-500/5 rounded-lg flex items-center justify-between"
                >
                    <div>
                        <div class="font-bold text-sm text-red-500">
                            {$_("settings.system.factoryReset") ||
                                "Factory Reset"}
                        </div>
                        <div class="text-[10px] text-[var(--text-secondary)]">
                            {$_("settings.system.factoryResetDesc") ||
                                "Wipe all data and start fresh. Irreversible."}
                        </div>
                    </div>
                    <button
                        class="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-md text-xs font-bold transition-colors"
                        onclick={onReset}
                    >
                        {$_("settings.system.resetNow") || "Reset Now"}
                    </button>
                </div>
            </section>
        {/if}
    </div>
</div>

<style>
    .settings-section {
        margin-bottom: 0;
    }
    .section-title {
        font-size: 0.875rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--text-secondary);
    }
    .btn-secondary {
        background: var(--bg-tertiary);
        border: 1px solid var(--border-color);
        color: var(--text-primary);
        border-radius: 6px;
        transition: all 0.2s;
    }
    .btn-secondary:hover {
        background: var(--bg-secondary);
        border-color: var(--accent-color);
    }
</style>
