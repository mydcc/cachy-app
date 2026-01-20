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
                <span class="text-xs font-bold block mb-2 uppercase opacity-50"
                    >System Logs</span
                >
                <button
                    class="w-full py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg text-sm transition-colors"
                    onclick={() => fetch("/api/test-log", { method: "POST" })}
                >
                    Check Browser Connectivity
                </button>
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
    .status-badge.success {
        background: var(--success-color);
        color: white;
        opacity: 0.8;
    }
</style>
