<script lang="ts">
    import { _ } from "../../../locales/i18n";
    import { settingsState } from "../../../stores/settings.svelte";
    import Toggle from "../../shared/Toggle.svelte";
    import HotkeySettings from "../HotkeySettings.svelte";
    import IndicatorSettings from "./IndicatorSettings.svelte";

    const intervals = [
        { value: 1000, label: "1s (Ultra)" },
        { value: 2000, label: "2s (Fast)" },
        { value: 5000, label: "5s (Normal)" },
        { value: 10000, label: "10s (Eco)" },
    ];

    let activeSubTab = $state("market");

    const subTabs = [
        { id: "market", label: "Market & Execution" },
        { id: "chart", label: "Chart & Technicals" },
        { id: "hotkeys", label: "Controls" },
    ];
</script>

<div class="trading-tab h-full flex flex-col" role="tabpanel" id="tab-trading">
    <!-- Sub-Navigation -->
    <div
        class="flex flex-wrap gap-2 border-b border-[var(--border-color)] pb-2 mb-4 shrink-0"
    >
        {#each subTabs as tab}
            <button
                class="px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors {activeSubTab ===
                tab.id
                    ? 'bg-[var(--accent-color)] text-white'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'}"
                onclick={() => (activeSubTab = tab.id)}
            >
                {tab.label}
            </button>
        {/each}
    </div>

    <div class="flex-1 overflow-y-auto custom-scrollbar pr-2">
        <!-- Execution & Fees -->
        {#if activeSubTab === "market"}
            <section class="settings-section animate-fade-in">
                <h3 class="section-title mb-4">Execution & Data</h3>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <!-- Fee Preference -->
                    <div class="field-group">
                        <label for="fee-pref"
                            >{$_("settings.feePreference")}</label
                        >
                        <div class="flex gap-2">
                            <button
                                class="flex-1 px-3 py-2 text-xs rounded border transition-colors {settingsState.feePreference ===
                                'maker'
                                    ? 'bg-[var(--accent-color)] text-white border-[var(--accent-color)]'
                                    : 'bg-[var(--bg-secondary)] border-[var(--border-color)]'}"
                                onclick={() =>
                                    (settingsState.feePreference = "maker")}
                            >
                                MAKER
                            </button>
                            <button
                                class="flex-1 px-3 py-2 text-xs rounded border transition-colors {settingsState.feePreference ===
                                'taker'
                                    ? 'bg-[var(--accent-color)] text-white border-[var(--accent-color)]'
                                    : 'bg-[var(--bg-secondary)] border-[var(--border-color)]'}"
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
                        <label for="market-interval"
                            >{$_("settings.marketDataInterval")}</label
                        >
                        <select
                            id="market-interval"
                            bind:value={settingsState.marketDataInterval}
                            class="input-field"
                        >
                            {#each intervals as interval}
                                <option value={interval.value}
                                    >{interval.label}</option
                                >
                            {/each}
                        </select>
                    </div>

                    <!-- Spin Buttons -->
                    <div class="field-group">
                        <label for="spin-btn"
                            >{$_("settings.showSpinButtons")}</label
                        >
                        <select
                            id="spin-btn"
                            bind:value={settingsState.showSpinButtons}
                            class="input-field"
                        >
                            <option value={true}>Always Visible</option>
                            <option value="hover">On Hover</option>
                            <option value={false}>Hidden</option>
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
                                >Sync inputs with live price</span
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
                                >Confirm Trade Deletion</span
                            >
                            <span
                                class="text-[10px] text-[var(--text-secondary)]"
                                >Safety check before removing</span
                            >
                        </div>
                        <Toggle
                            bind:checked={settingsState.confirmTradeDeletion}
                        />
                    </label>

                    <label class="toggle-card">
                        <div class="flex flex-col">
                            <span class="text-sm font-medium"
                                >Confirm Bulk Deletion</span
                            >
                            <span
                                class="text-[10px] text-[var(--text-secondary)]"
                                >Safety check for 'Close All'</span
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
                <h3 class="section-title mb-4">
                    {$_("settings.trading.chartTitle") || "Chart & Data"}
                </h3>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4"></div>

                <div class="mt-0">
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
                            {#each [{ id: "showTechnicalsSummary", label: "Summary" }, { id: "showTechnicalsOscillators", label: "Oscillators" }, { id: "showTechnicalsMAs", label: "Moving Avgs" }, { id: "showTechnicalsPivots", label: "Pivots" }] as mod}
                                <label
                                    class="flex items-center gap-2 cursor-pointer"
                                >
                                    <input
                                        type="checkbox"
                                        checked={(settingsState as any)[mod.id]}
                                        onchange={(e) =>
                                            ((settingsState as any)[mod.id] =
                                                e.currentTarget.checked)}
                                    />
                                    <span class="text-xs">{mod.label}</span>
                                </label>
                            {/each}
                        </div>

                        <!-- Granular Settings -->
                        <div class="border-t border-[var(--border-color)] pt-4">
                            <IndicatorSettings />
                        </div>
                    {/if}
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
                        <option value="mode2">Safety Mode (Alt+)</option>
                        <option value="mode1">Direct Mode (Fast)</option>
                        <option value="custom">Custom</option>
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
                            Preset Mode Active: {settingsState.hotkeyMode ===
                            "mode1"
                                ? 'Direct keys (e.g. "L" for Long)'
                                : 'Safety keys (e.g. "Alt+L" for Long)'}
                        </p>
                        <button
                            class="text-xs text-[var(--accent-color)] underline"
                            onclick={() =>
                                (settingsState.hotkeyMode = "custom")}
                            >Customize Keys</button
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
