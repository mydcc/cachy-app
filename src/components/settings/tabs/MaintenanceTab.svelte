<!--
  Copyright (C) 2026 MYDCT
-->

<script lang="ts">
    import { _ } from "../../../locales/i18n";
    import { settingsState } from "../../../stores/settings.svelte";
    import { dataRepairService } from "../../../services/dataRepairService";

    interface Props {
        onBackup: () => void;
        onRestore: (e: Event) => void;
        onReset: () => void;
    }

    let { onBackup, onRestore, onReset }: Props = $props();

    // Data Repair State
    let missingAtrCount = $state(0);
    let missingMfeMaeCount = $state(0);
    let invalidSymbolCount = $state(0);
    let isScanning = $state(false);
    let isRepairing = $state(false);
    let progress = $state(0);
    let totalToRepair = $state(0);
    let statusMessage = $state("");

    function scanIssues() {
        isScanning = true;
        try {
            missingAtrCount = dataRepairService.scanForMissingAtr();
            missingMfeMaeCount = dataRepairService.scanForMissingMfeMae();
            invalidSymbolCount = dataRepairService.scanForInvalidSymbols();
            const total =
                missingAtrCount + missingMfeMaeCount + invalidSymbolCount;
            statusMessage =
                total === 0
                    ? "All data is healthy."
                    : `${total} issues detected.`;
        } finally {
            isScanning = false;
        }
    }

    async function performRepair(type: "atr" | "mfemae" | "symbols") {
        isRepairing = true;
        progress = 0;
        try {
            if (type === "atr") {
                totalToRepair = missingAtrCount;
                await dataRepairService.repairMissingAtr((curr, total, msg) => {
                    progress = curr;
                    statusMessage = msg;
                });
            } else if (type === "mfemae") {
                totalToRepair = missingMfeMaeCount;
                await dataRepairService.repairMfeMae((curr, total, msg) => {
                    progress = curr;
                    statusMessage = msg;
                });
            } else if (type === "symbols") {
                totalToRepair = invalidSymbolCount;
                await dataRepairService.repairSymbols((curr, total, msg) => {
                    progress = curr;
                    statusMessage = msg;
                });
            }
            scanIssues();
        } finally {
            isRepairing = false;
        }
    }
    function clearAppCache() {
        if (
            !confirm(
                "Alle temporären Daten (News, Sentiment, Chart-Cache) löschen?",
            )
        )
            return;

        // Clear specific caches
        localStorage.removeItem("cachy_news_cache");
        localStorage.removeItem("cachy_sentiment_cache");

        // Clear any other temp keys if needed
        statusMessage = "Cache geleert.";
        setTimeout(() => (statusMessage = ""), 3000);
    }

    function reloadApp() {
        if (!confirm("App neu laden um Arbeitsspeicher freizugeben?")) return;
        window.location.reload();
    }
</script>

<div
    class="maintenance-tab flex flex-col gap-6"
    role="tabpanel"
    id="tab-maintenance"
>
    <!-- Backup & Synchronization -->
    <section class="settings-section">
        <h3 class="section-title">
            {$_("settings.maintenance.backupTitle") || "Backup & Preservation"}
        </h3>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="action-card">
                <div class="icon bg-blue-500/10 text-blue-500">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
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
                <div class="content">
                    <span class="title">{$_("settings.backup")}</span>
                    <span class="desc"
                        >Export all journal data and settings to JSON.</span
                    >
                </div>
                <button class="card-btn" onclick={onBackup}>
                    {$_("app.backupButtonAriaLabel") || "Backup Now"}
                </button>
            </div>

            <div class="action-card">
                <div class="icon bg-emerald-500/10 text-emerald-500">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
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
                <div class="content">
                    <span class="title">{$_("settings.restore")}</span>
                    <span class="desc"
                        >Overwrite current local data with a backup file.</span
                    >
                </div>
                <label class="card-btn cursor-pointer text-center">
                    {$_("app.restoreButtonAriaLabel") || "Restore File"}
                    <input
                        type="file"
                        accept=".json"
                        class="hidden"
                        onchange={onRestore}
                    />
                </label>
            </div>
        </div>
    </section>

    <!-- Data Repair & Health -->
    <section
        class="settings-section border-t border-[var(--border-color)] pt-6"
    >
        <div class="flex justify-between items-center mb-4">
            <h3 class="section-title mb-0">
                {$_("settings.maintenance.healthTitle") ||
                    "Intelligence & Data Health"}
            </h3>
            <button
                class="text-xs font-bold text-[var(--accent-color)] hover:underline"
                onclick={scanIssues}
                disabled={isScanning || isRepairing}
            >
                {isScanning ? "Scanning..." : "Audit Database"}
            </button>
        </div>

        <div class="flex flex-col gap-3">
            <!-- ATR Repair -->
            <div class="repair-item">
                <div class="flex flex-col">
                    <span class="text-sm font-semibold"
                        >Volatility Matrix (ATR)</span
                    >
                    <span class="text-[10px] text-[var(--text-secondary)]"
                        >Retroactively calculate ATR for journal entries.</span
                    >
                </div>
                <div class="flex items-center gap-3">
                    {#if missingAtrCount > 0}
                        <button
                            class="repair-btn"
                            onclick={() => performRepair("atr")}
                            >Repair {missingAtrCount}</button
                        >
                    {:else}
                        <span class="status-badge success">Healthy</span>
                    {/if}
                </div>
            </div>

            <!-- MFE/MAE Repair -->
            <div class="repair-item">
                <div class="flex flex-col">
                    <span class="text-sm font-semibold"
                        >Execution Metrics (MFE/MAE)</span
                    >
                    <span class="text-[10px] text-[var(--text-secondary)]"
                        >Heal missing Max Excursion data.</span
                    >
                </div>
                <div class="flex items-center gap-3">
                    {#if missingMfeMaeCount > 0}
                        <button
                            class="repair-btn"
                            onclick={() => performRepair("mfemae")}
                            >Repair {missingMfeMaeCount}</button
                        >
                    {:else}
                        <span class="status-badge success">Healthy</span>
                    {/if}
                </div>
            </div>

            <!-- Symbol Normalization -->
            <div class="repair-item">
                <div class="flex flex-col">
                    <span class="text-sm font-semibold"
                        >Symbol Normalization</span
                    >
                    <span class="text-[10px] text-[var(--text-secondary)]"
                        >Standardize symbol names (e.g. btc/usdt -> BTCUSDT).</span
                    >
                </div>
                <div class="flex items-center gap-3">
                    {#if invalidSymbolCount > 0}
                        <button
                            class="repair-btn"
                            onclick={() => performRepair("symbols")}
                            >Repair {invalidSymbolCount}</button
                        >
                    {:else}
                        <span class="status-badge success">Healthy</span>
                    {/if}
                </div>
            </div>
        </div>

        {#if isRepairing}
            <div
                class="w-full bg-[var(--bg-tertiary)] rounded-full h-1.5 mt-4 overflow-hidden"
            >
                <div
                    class="bg-[var(--accent-color)] h-full transition-all duration-300"
                    style="width: {(progress / totalToRepair) * 100}%"
                ></div>
            </div>
        {/if}

        {#if statusMessage}
            <p class="text-[10px] mt-2 text-[var(--text-secondary)] italic">
                {statusMessage}
            </p>
        {/if}
    </section>

    <!-- Extended Logs -->
    <section
        class="settings-section border-t border-[var(--border-color)] pt-6"
    >
        <h3 class="section-title">Log Levels & Filtering</h3>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div
                class="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-color)] col-span-full"
            >
                <div class="flex flex-col gap-3">
                    <p class="text-[11px] text-[var(--text-secondary)] mb-2">
                        Control which information is printed to the browser
                        console.
                    </p>

                    {#if settingsState.logSettings}
                        {@const logs = settingsState.logSettings}
                        <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
                            <!-- Helper for Toggles -->
                            {#snippet logToggle(label: string, key: string)}
                                <label
                                    class="flex items-center justify-between p-2 rounded bg-[var(--bg-tertiary)] cursor-pointer hover:bg-[var(--bg-primary)] transition-colors border border-[var(--border-color)]"
                                >
                                    <span class="text-xs font-semibold"
                                        >{label}</span
                                    >
                                    <input
                                        type="checkbox"
                                        class="accent-[var(--accent-color)]"
                                        checked={logs?.[
                                            key as keyof typeof logs
                                        ] ?? false}
                                        onchange={(e) => {
                                            (logs as any)[key] =
                                                e.currentTarget.checked;
                                        }}
                                    />
                                </label>
                            {/snippet}

                            {@render logToggle("General", "general")}
                            {@render logToggle("AI Logic", "ai")}
                            {@render logToggle("Market Data", "market")}
                            {@render logToggle("Governance", "governance")}

                            <!-- Technicals Special Case -->
                            <div
                                class="flex flex-col gap-1 p-2 rounded bg-[var(--bg-tertiary)] border border-[var(--border-color)]"
                            >
                                <label
                                    class="flex items-center justify-between cursor-pointer"
                                >
                                    <span class="text-xs font-semibold"
                                        >Technicals</span
                                    >
                                    <input
                                        type="checkbox"
                                        class="accent-[var(--accent-color)]"
                                        checked={logs.technicals}
                                        onchange={(e) => {
                                            logs.technicals =
                                                e.currentTarget.checked;
                                        }}
                                    />
                                </label>
                                {#if logs.technicals}
                                    <label
                                        class="flex items-center justify-between mt-1 pt-1 border-t border-[var(--border-color)] cursor-pointer"
                                    >
                                        <span
                                            class="text-[10px] text-[var(--text-secondary)]"
                                            >Show Values (Verbose)</span
                                        >
                                        <input
                                            type="checkbox"
                                            class="w-3 h-3 accent-[var(--accent-color)]"
                                            checked={logs.technicalsVerbose}
                                            onchange={(e) => {
                                                logs.technicalsVerbose =
                                                    e.currentTarget.checked;
                                            }}
                                        />
                                    </label>
                                {/if}
                            </div>

                            {@render logToggle("Network", "network")}
                        </div>
                    {/if}
                </div>
            </div>
        </div>
    </section>

    <!-- System & Performance -->
    <section
        class="settings-section border-t border-[var(--border-color)] pt-6"
    >
        <h3 class="section-title">System & Performance</h3>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="action-card">
                <div class="icon bg-orange-500/10 text-orange-500">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        ><path
                            d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"
                        /><path d="M3 3v5h5" /><path
                            d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"
                        /><path d="M16 21h5v-5" /></svg
                    >
                </div>
                <div class="content">
                    <span class="title">Cache leeren</span>
                    <span class="desc"
                        >Löscht temporäre News & Analysedaten.</span
                    >
                </div>
                <button class="card-btn" onclick={clearAppCache}>
                    Bereinigen
                </button>
            </div>

            <div class="action-card">
                <div class="icon bg-purple-500/10 text-purple-500">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        ><path d="M12 2v4" /><path d="m16.2 7.8 2.9-2.9" /><path
                            d="M18 12h4"
                        /><path d="m16.2 16.2 2.9 2.9" /><path
                            d="M12 18v4"
                        /><path d="m4.9 19.1 2.9-2.9" /><path
                            d="M2 12h4"
                        /><path d="m4.9 4.9 2.9 2.9" /></svg
                    >
                </div>
                <div class="content">
                    <span class="title">RAM freigeben</span>
                    <span class="desc"
                        >Lädt die App neu, um Speicher freizugeben.</span
                    >
                </div>
                <button class="card-btn" onclick={reloadApp}> Neustart </button>
            </div>
        </div>
    </section>

    <!-- Developer & Danger -->
    <section
        class="settings-section border-t border-[var(--border-color)] pt-6"
    >
        <h3 class="section-title">
            {$_("settings.maintenance.dangerTitle") || "Operations & Recovery"}
        </h3>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div
                class="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-color)]"
            >
                <div class="flex justify-between items-center mb-4">
                    <span class="text-xs font-bold block uppercase opacity-50"
                        >{$_("settings.maintenance.networkLogsTitle")}</span
                    >
                    <button
                        class="toggle-container {settingsState.enableNetworkLogs
                            ? 'active'
                            : ''}"
                        onclick={() =>
                            (settingsState.enableNetworkLogs =
                                !settingsState.enableNetworkLogs)}
                        aria-label="Toggle Server Logs"
                    >
                        <div class="toggle-thumb"></div>
                    </button>
                </div>
                <button
                    class="w-full py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg text-sm transition-colors"
                    onclick={() => fetch("/api/test-log", { method: "POST" })}
                >
                    Check Browser Connectivity
                </button>
                <p
                    class="text-[9px] text-[var(--text-secondary)] mt-2 italic px-1"
                >
                    {$_("settings.maintenance.networkLogsDesc")}
                </p>
            </div>

            <div class="p-4 rounded-xl bg-red-500/5 border border-red-500/20">
                <span
                    class="text-xs font-bold block mb-2 uppercase text-red-500/70"
                    >Wipe Database</span
                >
                <button
                    class="w-full py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-bold transition-colors"
                    onclick={onReset}
                >
                    {$_("settings.reset") || "Factory Reset"}
                </button>
            </div>
        </div>
    </section>
</div>

<style>
    .maintenance-tab {
        padding: 0.5rem;
    }

    .section-title {
        font-size: 0.875rem;
        font-weight: 700;
        color: var(--text-primary);
        margin-bottom: 1.25rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .action-card {
        display: flex;
        flex-direction: column;
        padding: 1.25rem;
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 1rem;
        position: relative;
        transition: all 0.2s ease;
    }
    .action-card:hover {
        border-color: var(--accent-color);
    }

    .action-card .icon {
        width: 40px;
        height: 40px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 1rem;
    }

    .action-card .title {
        font-size: 0.875rem;
        font-weight: 700;
        color: var(--text-primary);
        display: block;
    }
    .action-card .desc {
        font-size: 11px;
        color: var(--text-secondary);
        display: block;
        margin-top: 0.25rem;
        margin-bottom: 1.25rem;
    }

    .card-btn {
        margin-top: auto;
        background: var(--bg-tertiary);
        border: 1px solid var(--border-color);
        border-radius: 0.5rem;
        padding: 0.5rem;
        font-size: 0.75rem;
        font-weight: 600;
        transition: all 0.2s ease;
    }
    .card-btn:hover:not(:disabled) {
        background: var(--accent-color);
        color: var(--btn-accent-text);
        border-color: var(--accent-color);
    }

    /* Repair Items */
    .repair-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.75rem 1rem;
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 0.75rem;
    }

    .repair-btn {
        padding: 0.4rem 0.75rem;
        background: var(--warning-color);
        color: black;
        border: none;
        border-radius: 0.4rem;
        font-size: 0.7rem;
        font-weight: 800;
        cursor: pointer;
        transition: transform 0.2s ease;
    }
    .repair-btn:hover {
        transform: scale(1.05);
    }

    .status-badge {
        padding: 0.2rem 0.6rem;
        border-radius: 1rem;
        font-size: 0.65rem;
        font-weight: 700;
        text-transform: uppercase;
    }
    .active .toggle-thumb {
        transform: translateX(16px);
    }

    /* Toggle (Shared) */
    .toggle-container {
        width: 36px;
        height: 20px;
        background-color: var(--bg-tertiary);
        border-radius: 20px;
        position: relative;
        transition: all 0.3s ease;
        border: 1px solid var(--border-color);
        cursor: pointer;
    }
    .toggle-container.active {
        background-color: var(--accent-color);
        border-color: var(--accent-color);
    }
    .toggle-thumb {
        width: 14px;
        height: 14px;
        background-color: white;
        border-radius: 50%;
        position: absolute;
        top: 2px;
        left: 2px;
        transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
</style>
