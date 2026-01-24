<script lang="ts">
    import { _ } from "../../../locales/i18n";
    import { settingsState } from "../../../stores/settings.svelte";
    import Toggle from "../../shared/Toggle.svelte";
    import { modalState } from "../../../stores/modal.svelte";
    import { uiState } from "../../../stores/ui.svelte";

    let { onBackup, onRestore, onReset } = $props<{
        onBackup: () => void;
        onRestore: (e: Event) => void;
        onReset: () => void;
    }>();

    function clearAppCache() {
        localStorage.removeItem("cachy_news_cache");
        localStorage.removeItem("cachy_market_cache"); // Hypothetical
        uiState.showToast(
            $_("settings.system.cacheCleared") || "Cache cleared.",
        );
    }

    function reloadApp() {
        window.location.reload();
    }
</script>

<div class="system-tab flex flex-col gap-8" role="tabpanel" id="tab-system">
    <!-- Performance & Resources -->
    <section class="settings-section">
        <div class="flex items-center gap-2 mb-4">
            <div class="icon-box bg-blue-500/10 text-blue-500">
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
                    /><path d="m16.2 16.2 2.9 2.9" /><path d="M12 18v4" /><path
                        d="m4.9 19.1 2.9-2.9"
                    /><path d="M2 12h4" /><path d="m4.9 4.9 2.9 2.9" /></svg
                >
            </div>
            <h3 class="section-title mb-0">
                {$_("settings.system.performance") || "Performance"}
            </h3>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <!-- Pause on Blur -->
            <div
                class="action-card flex items-center justify-between p-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)]"
            >
                <div>
                    <div class="font-bold text-sm">
                        {$_("settings.system.pauseApp") ||
                            "Pause in Background"}
                    </div>
                    <div class="text-[10px] text-[var(--text-secondary)]">
                        {$_("settings.system.pauseAppDesc") ||
                            "Stops heavy tasks when tab is not active."}
                    </div>
                </div>
                <Toggle bind:checked={settingsState.pauseAnalysisOnBlur} />
            </div>

            <!-- Network Logs -->
            <div
                class="action-card flex items-center justify-between p-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)]"
            >
                <div>
                    <div class="font-bold text-sm">
                        {$_("settings.system.networkLogs") || "Network Logging"}
                    </div>
                    <div class="text-[10px] text-[var(--text-secondary)]">
                        {$_("settings.system.networkLogsDesc") ||
                            "Show API traffic in console."}
                    </div>
                </div>
                <Toggle bind:checked={settingsState.enableNetworkLogs} />
            </div>

            <!-- Debug Mode -->
            <div
                class="action-card flex items-center justify-between p-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)]"
            >
                <div>
                    <div class="font-bold text-sm">
                        {$_("settings.system.debugMode") || "Debug Mode"}
                    </div>
                    <div class="text-[10px] text-[var(--text-secondary)]">
                        {$_("settings.system.debugModeDesc") ||
                            "Show detailed logs and hidden features."}
                    </div>
                </div>
                <Toggle bind:checked={settingsState.debugMode} />
            </div>
        </div>

        <!-- Quick Actions -->
        <div class="grid grid-cols-2 gap-4 mt-4">
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
                    /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg
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
    </section>

    <!-- Data Health & Backup -->
    <section
        class="settings-section border-t border-[var(--border-color)] pt-8"
    >
        <div class="flex items-center gap-2 mb-4">
            <div class="icon-box bg-emerald-500/10 text-emerald-500">
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
                        d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"
                    /><polyline points="14 2 14 8 20 8" /></svg
                >
            </div>
            <h3 class="section-title mb-0">
                {$_("settings.system.dataMaintenance") || "Data & Backup"}
            </h3>
        </div>

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
                        {$_("settings.system.backup") || "Create Backup"}
                    </div>
                    <div class="text-[10px] text-[var(--text-secondary)]">
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
                        {$_("settings.system.restore") || "Restore Backup"}
                    </div>
                    <div class="text-[10px] text-[var(--text-secondary)]">
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
    </section>

    <!-- Danger Zone -->
    <section
        class="settings-section border-t border-[var(--border-color)] pt-8"
    >
        <h3 class="section-title text-red-500 mb-4">
            {$_("settings.system.dangerZone") || "Danger Zone"}
        </h3>

        <div
            class="p-4 border border-red-500/30 bg-red-500/5 rounded-lg flex items-center justify-between"
        >
            <div>
                <div class="font-bold text-sm text-red-500">
                    {$_("settings.system.factoryReset") || "Factory Reset"}
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
</div>

<style>
    .icon-box {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border-radius: 8px;
    }
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
