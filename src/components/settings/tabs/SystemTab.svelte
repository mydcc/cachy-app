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
    import EngineDebugPanel from "../EngineDebugPanel.svelte";
    import DataMaintenance from "../DataMaintenance.svelte";
    import SettingsGrid from "../shared/SettingsGrid.svelte";
    import { toastService } from "../../../services/toastService.svelte";
    import {
        applyTelemetryConsent,
        trackCustomEvent,
    } from "../../../services/trackingService";
    import { autoBackupState, triggerAutoBackup } from "../../../services/autoBackupService.svelte";
    import { onboardingState } from "../../../stores/onboarding.svelte";
    import {
        fileTargetState,
        isFileSystemAccessSupported,
        pickFileTarget,
        clearFileTarget,
        setFileTargetInterval,
        requestFileTargetPermission,
        MIN_INTERVAL_MINUTES,
        MAX_INTERVAL_MINUTES,
        type FileTargetSlot,
    } from "../../../services/fileTargetBackupService.svelte";
    import { modalState } from "../../../stores/modal.svelte";
    import {
        createBackup,
        restoreFromBackup,
    } from "../../../services/backupService";
    import { wipeLocalData } from "../../../utils/appReset";
    import type { TranslationKey } from "../../../locales/schema";
    import HotkeySettings from "../HotkeySettings.svelte";
    import {
        HOTKEY_ACTIONS,
        HOTKEY_CATEGORY_KEYS,
        MODE1_MAP,
        MODE2_MAP,
        type HotkeyAction,
        type HotkeyCategory,
    } from "../../../services/hotkeyService";

    function clearAppCache() {
        localStorage.removeItem("cachy_news_cache");
        localStorage.removeItem("cachy_market_cache"); // Hypothetical
        toastService.success($_("settings.system.cacheCleared"));
    }

    function reloadApp() {
        window.location.reload();
    }

    // Backup & restore handlers (moved from SettingsContent; this tab owns them now)
    async function handleBackup() {
        const useEncryption = await modalState.show(
            $_("settings.system.dataMaintenance") || "Data & Backup",
            $_("app.backupEncryptQuestion") || "Encrypt backup with password?",
            "confirm",
        );
        let password = "";

        if (useEncryption) {
            const result = await modalState.show(
                $_("settings.system.dataMaintenance") || "Data & Backup",
                $_("app.backupPasswordPrompt") || "Enter password:",
                "prompt",
            );
            password = typeof result === "string" ? result : "";

            if (!password) {
                uiState.showError(
                    $_("app.backupPasswordRequired") || "Password required.",
                );
                return;
            }
        }

        await createBackup(password);
        trackCustomEvent("System", "Backup", "Created");
    }

    async function handleRestore(e: Event) {
        const input = e.target as HTMLInputElement;
        if (!input.files || input.files.length === 0) return;

        const file = input.files[0];
        const reader = new FileReader();

        reader.onload = async (event) => {
            const content = event.target?.result as string;
            const confirmed = await modalState.show(
                $_("settings.system.dataMaintenance") || "Data & Backup",
                $_("app.restoreConfirmMessage") ||
                    "Restore backup? Current data will be replaced.",
                "confirm",
            );

            if (confirmed) {
                let result = await restoreFromBackup(content);

                if (result.needsPassword) {
                    const pwResult = await modalState.show(
                        $_("settings.system.dataMaintenance") ||
                            "Data & Backup",
                        $_("app.backupPasswordEntryPrompt") ||
                            "Enter encryption password:",
                        "prompt",
                    );
                    const password =
                        typeof pwResult === "string" ? pwResult : "";

                    if (password) {
                        result = await restoreFromBackup(content, password);
                    } else {
                        input.value = "";
                        return;
                    }
                }

                if (result.success) {
                    await modalState.show(
                        $_("settings.system.dataMaintenance") ||
                            "Data & Backup",
                        result.message,
                        "alert",
                    );
                    window.location.reload();
                } else {
                    uiState.showError(
                        result.message.startsWith("app.")
                            ? $_(result.message as TranslationKey, { values: result.messageParams })
                            : result.message,
                    );
                }
            }
            input.value = "";
        };

        reader.onerror = () => {
            uiState.showError($_("app.fileReadError"));
            input.value = "";
        };

        reader.readAsText(file);
    }

    async function handleReset() {
        const confirmed = await modalState.show(
            $_("settings.system.dangerZone") || "Danger Zone",
            $_("settings.resetConfirm") ||
                "Factory Reset? This cannot be undone.",
            "confirm",
        );
        if (confirmed) {
            await wipeLocalData();
            window.location.reload();
        }
    }

    // Controls (moved from Trading; device controls live with system maintenance)
    const groupedActions: Record<string, HotkeyAction[]> = {};
    HOTKEY_ACTIONS.forEach((action) => {
        if (!groupedActions[action.category]) {
            groupedActions[action.category] = [];
        }
        groupedActions[action.category].push(action);
    });
    const categories = Object.keys(groupedActions);

    function getPresetKey(action: HotkeyAction, mode: string): string {
        if (mode === "mode1") {
            return MODE1_MAP[action.id] || action.defaultKey;
        } else if (mode === "mode2") {
            return MODE2_MAP[action.id] || action.defaultKey;
        }
        return action.defaultKey;
    }

    // BUG-0286: consent changed — load the Matomo container on opt-in, drop
    // the data-layer reference on opt-out. Reads the checkbox state from the
    // event so it never depends on binding order.
    function handleTelemetryConsent(e: Event) {
        const enabled = (e.currentTarget as HTMLInputElement).checked;
        applyTelemetryConsent(enabled);
    }

    const fsaSupported = isFileSystemAccessSupported();

    async function handlePickFileTarget(slot: FileTargetSlot) {
        const result = await pickFileTarget(slot, fileTargetState[slot].intervalMinutes);
        if (result.success) {
            toastService.success($_("settings.system.fileTargetConfigured"));
        } else if (result.message === "pickFailed") {
            toastService.error($_("settings.system.fileTargetPickFailed"));
        }
    }

    async function handleReconnect(slot: FileTargetSlot) {
        const ok = await requestFileTargetPermission(slot);
        if (ok) {
            toastService.success($_("settings.system.fileTargetReconnected"));
        } else {
            toastService.error($_("settings.system.fileTargetReconnectFailed"));
        }
    }

    function handleIntervalChange(slot: FileTargetSlot, e: Event) {
        const value = Number((e.target as HTMLInputElement).value);
        if (!Number.isNaN(value)) {
            setFileTargetInterval(slot, value);
        }
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
        {
            id: "data",
            label: $_("settings.system.dataMaintenance") || "Data & Backup",
        },
        {
            id: "maintenance",
            label: $_("settings.tabs.maintenance") || "Maintenance",
        },
        {
            id: "controls",
            label: $_("settings.profile.hotkeysTitle") || "Hotkeys",
        },
    ];
</script>

<div class="system-tab flex flex-col gap-3 sm:gap-4 md:gap-6" role="tabpanel" id="tab-system">
    <!-- Sub-Navigation -->
    <div
        class="flex gap-2 overflow-x-auto border-b border-[var(--border-color)] pb-2 shrink-0 custom-scrollbar"
    >
        {#each subTabs as tab}
            <button
                class="px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 {activeSubTab ===
                tab.id
                    ? 'bg-[var(--accent-color)] text-[var(--btn-accent-text)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'}"
                onclick={() => (uiState.settingsSystemSubTab = tab.id)}
            >
                {tab.label}
            </button>
        {/each}
    </div>

    <div class="min-w-0">
        <!-- Performance & Resources -->
        {#if activeSubTab === "performance"}
            <section class="settings-section animate-fade-in">
                <h3 class="section-title mb-4">
                    {$_("settings.system.performance") || "Performance"}
                </h3>

                <!-- Calculation Settings Component -->
                <CalculationSettings />

                <!-- Engine Debug Panel (debug mode only) -->
                {#if settingsState.debugMode}
                    <EngineDebugPanel />
                {/if}

                <SettingsGrid gap="gap-4" extraClass="mt-6">
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

                    <!-- Telemetry Opt-Out (BUG-0286): tracking runs by
                         default on anonymized first-party measurement; this
                         toggle stops it immediately. No cookie banner needed. -->
                    <div
                        class="action-card flex items-center justify-between p-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)]"
                    >
                        <div>
                            <div class="font-bold text-sm">
                                {$_("settings.system.telemetry") ||
                                    "Usage Statistics"}
                            </div>
                            <div
                                class="text-[10px] text-[var(--text-secondary)]"
                            >
                                {$_("settings.system.telemetryDesc")}
                            </div>
                        </div>
                        <Toggle
                            bind:checked={settingsState.enableTelemetry}
                            onchange={handleTelemetryConsent}
                        />
                    </div>
                </SettingsGrid>

                <!-- Quick Actions -->
                <h4
                    class="text-xs font-bold text-[var(--text-secondary)] uppercase mt-6 mb-2"
                >
                    {$_("settings.system.quickActions")}
                </h4>
                <SettingsGrid gap="gap-4">
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
                </SettingsGrid>

                <label class="toggle-card mt-4 gap-3">
                    <div class="flex flex-col min-w-0 flex-1">
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

                <!-- Auto-Backup OPFS Status -->
                <div class="mb-4 p-4 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div class="flex items-start gap-3">
                        <div class="p-2 rounded-md bg-[var(--accent-color)]/10 text-[var(--accent-color)]">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                                <path d="m9 12 2 2 4-4"/>
                            </svg>
                        </div>
                        <div>
                            <div class="font-bold text-sm flex items-center gap-2">
                                <span>{$_("settings.system.autoBackupTitle") || "Automatic OPFS Backup"}</span>
                                {#if autoBackupState.isOpfsSupported}
                                    <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-500">
                                        <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                        {$_("settings.system.active") || "Active"}
                                    </span>
                                {:else}
                                    <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[var(--warning-color)]/10 text-[var(--warning-color)]">
                                        {$_("settings.system.unsupported") || "Not supported"}
                                    </span>
                                {/if}
                            </div>
                            <div class="text-[10px] text-[var(--text-secondary)] mt-0.5">
                                {$_("settings.system.autoBackupDesc") || "Silently backs up all local data (Class A) to the browser's protected file system."}
                                {#if autoBackupState.lastSnapshotTime}
                                    <span class="block text-[10px] text-[var(--text-secondary)] mt-1">
                                        {$_("settings.system.lastSnapshot") || "Last snapshot"}: {new Date(autoBackupState.lastSnapshotTime).toLocaleTimeString()}
                                    </span>
                                {/if}
                            </div>
                        </div>
                    </div>

                    {#if autoBackupState.isOpfsSupported}
                        <button
                            type="button"
                            onclick={() => {
                                triggerAutoBackup(0);
                                toastService.success($_("settings.system.snapshotCreated"));
                            }}
                            class="px-3 py-1.5 text-xs font-semibold rounded-lg border border-[var(--border-color)] hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)] transition-colors self-start sm:self-center"
                        >
                            {$_("settings.system.snapshotNow") || "Snapshot Now"}
                        </button>
                    {/if}
                </div>

                <!-- Periodic Local File Write-Through (FEAT-0212 Phase 2) -->
                <div class="mb-4 p-4 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg">
                    <div class="font-bold text-sm">
                        {$_("settings.system.fileTargetTitle")}
                    </div>
                    <div class="text-[10px] text-[var(--text-secondary)] mt-0.5 mb-3">
                        {$_("settings.system.fileTargetDesc")}
                    </div>

                    {#if !fsaSupported}
                        <div class="text-[10px] text-[var(--warning-color)]">
                            {$_("settings.system.fileTargetUnsupported")}
                        </div>
                    {:else}
                        <SettingsGrid gap="gap-3">
                            {#each [1, 2] as slot (slot)}
                                {@const info = fileTargetState[slot as FileTargetSlot]}
                                <div class="p-3 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg">
                                    <div class="flex items-center justify-between mb-2">
                                        <span class="text-xs font-semibold">
                                            {$_("settings.system.fileTargetSlot", { values: { slot } })}
                                        </span>
                                        {#if info.isConfigured}
                                            <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold {info.needsPermission ? 'bg-[var(--warning-color)]/10 text-[var(--warning-color)]' : 'bg-emerald-500/10 text-emerald-500'}">
                                                <span class="w-1.5 h-1.5 rounded-full {info.needsPermission ? 'bg-[var(--warning-color)]' : 'bg-emerald-500'}"></span>
                                                {info.needsPermission ? ($_("settings.system.unsupported") || "") : ($_("settings.system.active") || "Active")}
                                            </span>
                                        {/if}
                                    </div>

                                    {#if info.isConfigured}
                                        <div class="text-[10px] text-[var(--text-secondary)] truncate" title={info.fileName ?? ""}>
                                            {info.fileName}
                                        </div>
                                        <div class="text-[10px] text-[var(--text-secondary)] mt-1">
                                            {$_("settings.system.fileTargetLastWrite")}:
                                            {info.lastWriteTime ? new Date(info.lastWriteTime).toLocaleTimeString() : $_("settings.system.fileTargetNever")}
                                        </div>

                                        {#if info.needsPermission}
                                            <div class="text-[10px] text-[var(--warning-color)] mt-1">
                                                {$_("settings.system.fileTargetPermissionNeeded")}
                                            </div>
                                            <button
                                                type="button"
                                                class="btn-secondary text-[10px] py-1 px-2 mt-2 w-full"
                                                onclick={() => handleReconnect(slot as FileTargetSlot)}
                                            >
                                                {$_("settings.system.fileTargetReconnect")}
                                            </button>
                                        {:else if info.lastError}
                                            <div class="text-[10px] text-[var(--danger-color)] mt-1">
                                                {$_("settings.system.fileTargetWriteFailed")}
                                            </div>
                                        {/if}

                                        <label class="flex items-center gap-2 mt-2 text-[10px] text-[var(--text-secondary)]">
                                            {$_("settings.system.fileTargetInterval")}
                                            <input
                                                type="number"
                                                min={MIN_INTERVAL_MINUTES}
                                                max={MAX_INTERVAL_MINUTES}
                                                value={info.intervalMinutes}
                                                onchange={(e) => handleIntervalChange(slot as FileTargetSlot, e)}
                                                class="w-14 px-1.5 py-0.5 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-primary)] text-[10px]"
                                            />
                                            {$_("settings.system.fileTargetIntervalMinutes")}
                                        </label>

                                        <div class="flex gap-2 mt-2">
                                            <button
                                                type="button"
                                                class="btn-secondary text-[10px] py-1 px-2 flex-1"
                                                onclick={() => handlePickFileTarget(slot as FileTargetSlot)}
                                            >
                                                {$_("settings.system.fileTargetReplace")}
                                            </button>
                                            <button
                                                type="button"
                                                class="btn-secondary text-[10px] py-1 px-2 flex-1"
                                                onclick={() => clearFileTarget(slot as FileTargetSlot)}
                                            >
                                                {$_("settings.system.fileTargetRemove")}
                                            </button>
                                        </div>
                                    {:else}
                                        <div class="text-[10px] text-[var(--text-secondary)] mb-2">
                                            {$_("settings.system.fileTargetNotConfigured")}
                                        </div>
                                        <button
                                            type="button"
                                            class="btn-secondary text-[10px] py-1 px-2 w-full"
                                            onclick={() => handlePickFileTarget(slot as FileTargetSlot)}
                                        >
                                            {$_("settings.system.fileTargetChoose")}
                                        </button>
                                    {/if}
                                </div>
                            {/each}
                        </SettingsGrid>
                    {/if}
                </div>

                <SettingsGrid gap="gap-4">
                    <button
                        class="flex items-center gap-3 p-4 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors text-left group"
                            onclick={handleBackup}
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
                            onchange={handleRestore}
                            class="hidden"
                        />
                    </label>
                </SettingsGrid>

                <div class="mt-8">
                    <DataMaintenance />
                </div>
            </section>
        {/if}

        <!-- Onboarding Tour -->
        {#if activeSubTab === "maintenance"}
            <section class="settings-section animate-fade-in mb-6">
                <h3 class="section-title mb-4">
                    {$_("settings.system.startOnboardingTour") || "Onboarding Tour"}
                </h3>

                <div
                    class="p-4 border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] rounded-lg flex items-center justify-between gap-4"
                >
                    <div class="flex items-center gap-2">
                        <span aria-hidden="true">🧭</span>
                        <div class="text-xs sm:text-sm text-[var(--text-secondary)]">
                            {$_("settings.system.onboardingTourDesc") ||
                                "Start the interactive 4-step walkthrough of the Cachy trading workstation."}
                        </div>
                    </div>
                    <button
                        type="button"
                        id="start-onboarding-tour-btn"
                        class="px-4 py-2 rounded-lg text-xs font-bold bg-[var(--btn-accent-bg)] text-[var(--btn-accent-text)] hover:bg-[var(--btn-accent-hover-bg)] shadow transition-all shrink-0"
                        onclick={() => onboardingState.triggerStartWithDelay(2000)}
                    >
                        {$_("onboarding.start") || "Start tour"}
                    </button>
                </div>
            </section>

            <!-- Danger Zone -->
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
                        onclick={handleReset}
                    >
                        {$_("settings.system.resetNow") || "Reset Now"}
                    </button>
                </div>
            </section>
        {/if}

        <!-- Controls (moved from Trading; device controls live with system maintenance) -->
        {#if activeSubTab === "controls"}
            <section class="settings-section animate-fade-in">
                <div class="flex justify-between items-center gap-2 mb-4">
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
                        class="p-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)] flex flex-col gap-4"
                    >
                        <p class="text-xs text-[var(--text-secondary)]">
                            <strong>{$_("settings.hotkeys.activePreset")}</strong>
                            {settingsState.hotkeyMode === "mode1"
                                ? $_("settings.hotkeys.mode1Desc")
                                : $_("settings.hotkeys.mode2Desc")}
                            <button
                                class="text-[var(--accent-color)] underline ml-2"
                                onclick={() =>
                                    (settingsState.hotkeyMode = "custom")}
                                >{$_("settings.hotkeys.switchToCustom")}</button
                            >
                        </p>
                        <div class="flex flex-col gap-6">
                            {#each categories as category}
                                <div class="flex flex-col gap-2">
                                    <h4 class="text-sm font-bold text-[var(--accent-color)] border-b border-[var(--border-color)] pb-1 mb-1">
                                        {$_(HOTKEY_CATEGORY_KEYS[category as HotkeyCategory])}
                                    </h4>
                                    <SettingsGrid gap="gap-3">
                                        {#each groupedActions[category] as action}
                                            <div class="flex justify-between items-center gap-2 p-2 rounded bg-[var(--bg-tertiary)] border border-[var(--border-color)]">
                                                <span class="text-sm min-w-0">{$_(action.labelKey)}</span>
                                                <span class="px-3 py-1 text-xs font-mono rounded border min-w-[80px] text-center bg-[var(--bg-secondary)] border-[var(--border-color)] text-[var(--text-secondary)] shrink-0">
                                                    {getPresetKey(action, settingsState.hotkeyMode)}
                                                </span>
                                            </div>
                                        {/each}
                                    </SettingsGrid>
                                </div>
                            {/each}
                        </div>
                    </div>
                {/if}
            </section>
        {/if}
    </div>
</div>

<style>
    .settings-section {
        margin-bottom: 0;
    }
    .section-title {
        font-size: var(--text-sm);
        font-weight: var(--font-bold);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--text-secondary);
    }
    .btn-secondary {
        background: var(--bg-tertiary);
        border: 1px solid var(--border-color);
        color: var(--text-primary);
        border-radius: var(--radius-md);
        transition: all 0.2s;
    }
    .btn-secondary:hover {
        background: var(--bg-secondary);
        border-color: var(--accent-color);
    }
</style>
