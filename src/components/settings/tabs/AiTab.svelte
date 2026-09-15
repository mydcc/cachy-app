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
    import { settingsState, type AiProvider } from "../../../stores/settings.svelte";
    import {
        BUILTIN_ENTRY_IDS,
        isBuiltinEntryId,
    } from "../../../stores/settings/aiProviders";
    import {
        AI_ACTION_CATALOG,
        AI_ACTION_GROUPS,
        requiresConfirmation,
        type AiActionGroup,
    } from "../../../lib/ai/actionPolicy";
    import type { TranslationKey } from "../../../locales/schema";
    import Toggle from "../../shared/Toggle.svelte";
    import AiProviderManager from "../AiProviderManager.svelte";
    import ProviderCard from "../ProviderCard.svelte";
    import { uiState } from "../../../stores/ui.svelte";
    import SettingsGrid from "../shared/SettingsGrid.svelte";

    interface ProviderTab {
        id: string;
        vendor: AiProvider;
        label: string;
        showApiKey: boolean;
        keyLabel: string;
        keyPlaceholder: string;
        baseUrlLabel: string;
        baseUrlPlaceholder: string;
        baseUrlHint: string;
    }

    const providerTabs: ProviderTab[] = [
        {
            id: BUILTIN_ENTRY_IDS.ollama,
            vendor: "ollama",
            label: $_("settings.ai.provider.ollama"),
            showApiKey: false,
            keyLabel: "",
            keyPlaceholder: "",
            baseUrlLabel: $_("settings.ai.ollamaBaseUrl"),
            baseUrlPlaceholder: "http://localhost:11434",
            baseUrlHint: $_("settings.ai.ollamaBaseUrlDesc"),
        },
        {
            id: BUILTIN_ENTRY_IDS.openai,
            vendor: "openai",
            label: $_("settings.ai.provider.openai"),
            showApiKey: true,
            keyLabel: $_("settings.ai.openaiApiKey"),
            keyPlaceholder: "sk-...",
            baseUrlLabel: $_("settings.ai.customBaseUrl"),
            baseUrlPlaceholder: "http://localhost:8000/v1",
            baseUrlHint: $_("settings.ai.customBaseUrlDesc"),
        },
        {
            id: BUILTIN_ENTRY_IDS.gemini,
            vendor: "gemini",
            label: $_("settings.ai.provider.gemini"),
            showApiKey: true,
            keyLabel: $_("settings.ai.geminiApiKey"),
            keyPlaceholder: "AIza...",
            baseUrlLabel: $_("settings.ai.customBaseUrl"),
            baseUrlPlaceholder: "https://generativelanguage.googleapis.com",
            baseUrlHint: $_("settings.ai.geminiCustomBaseUrlDesc"),
        },
        {
            id: BUILTIN_ENTRY_IDS.anthropic,
            vendor: "anthropic",
            label: $_("settings.ai.provider.anthropic"),
            showApiKey: true,
            keyLabel: $_("settings.ai.anthropicApiKey"),
            keyPlaceholder: "sk-ant-...",
            baseUrlLabel: $_("settings.ai.customBaseUrl"),
            baseUrlPlaceholder: "https://api.anthropic.com",
            baseUrlHint: $_("settings.ai.customBaseUrlDesc"),
        },
    ];

    let managerOpen = $state(false);
    let showManager = $derived(
        managerOpen || !isBuiltinEntryId(settingsState.activeProviderId),
    );
    let activeTabId = $derived(
        showManager ? "custom" : settingsState.activeProviderId,
    );
    let activeTab = $derived(
        providerTabs.find((tab) => tab.id === activeTabId),
    );

    function selectBuiltin(tab: ProviderTab) {
        settingsState.activeProviderId = tab.id;
        settingsState.aiProvider = tab.vendor;
        managerOpen = false;
    }

    // Social Helper
    function addDiscordChannel() {
        if (!settingsState.discordChannels) settingsState.discordChannels = [];
        settingsState.discordChannels = [...settingsState.discordChannels, ""];
    }

    function removeDiscordChannel(index: number) {
        const newChannels = [...settingsState.discordChannels];
        newChannels.splice(index, 1);
        settingsState.discordChannels = newChannels;
    }

    const activeSubTab = $derived(uiState.settingsAiSubTab);

    const subTabs = [
        {
            id: "intelligence",
            label: $_("settings.tabs.ai_assistant"),
        },
        { id: "behavior", label: $_("settings.ai.behavior") },
        { id: "agents", label: $_("settings.ai.agents") },
    ];

    const ACTION_LABEL_KEYS: Record<string, TranslationKey> = {
        setEntryPrice: "settings.ai.permissions.action.setEntryPrice",
        setStopLoss: "settings.ai.permissions.action.setStopLoss",
        setTakeProfit: "settings.ai.permissions.action.setTakeProfit",
        addTakeProfit: "settings.ai.permissions.action.addTakeProfit",
        removeTakeProfit: "settings.ai.permissions.action.removeTakeProfit",
        setTradeType: "settings.ai.permissions.action.setTradeType",
        setAtrMultiplier: "settings.ai.permissions.action.setAtrMultiplier",
        setUseAtrSl: "settings.ai.permissions.action.setUseAtrSl",
        setRisk: "settings.ai.permissions.action.setRisk",
        setLeverage: "settings.ai.permissions.action.setLeverage",
        setNotes: "settings.ai.permissions.action.setNotes",
        setTags: "settings.ai.permissions.action.setTags",
    };

    const GROUP_LABEL_KEYS: Record<AiActionGroup, TranslationKey> = {
        setup: "settings.ai.permissions.group.setup",
        risk: "settings.ai.permissions.group.risk",
        notes: "settings.ai.permissions.group.notes",
    };

    const permissionGroups = AI_ACTION_GROUPS.map((group) => ({
        id: group,
        labelKey: GROUP_LABEL_KEYS[group],
        entries: AI_ACTION_CATALOG.filter(
            (entry) => entry.group === group,
        ).map((entry) => ({
            id: entry.id,
            labelKey: ACTION_LABEL_KEYS[entry.id],
            alwaysConfirms: requiresConfirmation(entry.id),
        })),
    }));

    const totalActions = AI_ACTION_CATALOG.length;
    const allowedCount = $derived(settingsState.aiAllowedActions?.length ?? 0);

    function isActionAllowed(id: string): boolean {
        return settingsState.aiAllowedActions?.includes(id) ?? false;
    }

    function toggleAction(id: string) {
        const current = settingsState.aiAllowedActions ?? [];
        settingsState.aiAllowedActions = current.includes(id)
            ? current.filter((candidate) => candidate !== id)
            : [...current, id];
    }
</script>

<div class="ai-tab flex flex-col gap-3 sm:gap-4 md:gap-6" role="tabpanel" id="tab-ai">
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
                onclick={() => (uiState.settingsAiSubTab = tab.id)}
            >
                {tab.label}
            </button>
        {/each}
    </div>

    <div class="min-w-0">
        {#if settingsState.decryptionFailures > 0 || settingsState.deviceKeyLost}
            <div class="mb-6 flex items-start gap-3 text-sm text-[var(--text-primary)] bg-[var(--bg-secondary)] border border-[var(--warning-color)] p-4 rounded-lg">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--warning-color)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 mt-0.5"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
                <div class="flex flex-col min-w-0 flex-1">
                    <strong class="text-[var(--text-primary)] mb-1">
                        {#if settingsState.deviceKeyLost}
                            {$_("settings.deviceKeyLostTitle")}
                        {:else}
                            {$_("settings.decryptionWarningTitle")} ({settingsState.decryptionFailures})
                        {/if}
                    </strong>
                    <span class="text-[var(--text-secondary)] text-xs">
                        {#if settingsState.deviceKeyLost}
                            {$_("settings.deviceKeyLostDesc")}
                        {:else}
                            {$_("settings.decryptionWarningMessage")}
                        {/if}
                    </span>
                </div>
            </div>
        {/if}

        <!-- Model Selection -->
        {#if activeSubTab === "intelligence"}
            <section class="settings-section animate-fade-in">
                <h3 class="section-title mb-4">
                    {$_("settings.ai.intelligenceTitle")}
                </h3>

                <!-- Provider Switcher -->
                <div class="field-group mb-6">
                    <span
                        class="text-xs font-semibold color-[var(--text-secondary)] mb-1"
                        >{$_("settings.apiProvider")}</span
                    >
                    <div class="segmented-control flex-wrap">
                        {#each providerTabs as tab}
                            <button
                                class="segmented-btn {activeTabId === tab.id ? 'active' : ''}"
                                onclick={() => selectBuiltin(tab)}
                            >
                                {tab.label}
                            </button>
                        {/each}
                        <button
                            class="segmented-btn {activeTabId === 'custom' ? 'active' : ''}"
                            onclick={() => (managerOpen = true)}
                        >
                            {$_("settings.ai.customProviders.title")}
                        </button>
                    </div>
                    <p class="text-[10px] text-[var(--text-secondary)] mt-1">
                        {$_("settings.ai.providerDesc")}
                    </p>
                </div>

                <div class="mt-4 p-4 bg-[var(--bg-tertiary)] rounded-lg border border-[var(--border-color)]">
                    {#if showManager}
                        <AiProviderManager />
                    {:else if activeTab}
                        <ProviderCard
                            entryId={activeTab.id}
                            vendor={activeTab.vendor}
                            showApiKey={activeTab.showApiKey}
                            keyLabel={activeTab.keyLabel}
                            keyPlaceholder={activeTab.keyPlaceholder}
                            baseUrlLabel={activeTab.baseUrlLabel}
                            baseUrlPlaceholder={activeTab.baseUrlPlaceholder}
                            baseUrlHint={activeTab.baseUrlHint}
                        />
                    {/if}
                </div>
            </section>
        {/if}

        <!-- Behavior & Persona -->
        {#if activeSubTab === "behavior"}
            <section class="settings-section animate-fade-in">
                <h3 class="section-title mb-4">
                    {$_("settings.ai.behavior")}
                </h3>

                <div class="field-group mb-6">
                    <label for="sys-prompt"
                        >{$_("settings.ai.customSystemPrompt")}</label
                    >
                    <textarea
                        id="sys-prompt"
                        bind:value={settingsState.customSystemPrompt}
                        placeholder={$_("settings.ai.systemPromptPlaceholder")}
                        class="textarea-field"
                    ></textarea>
                </div>

                <SettingsGrid gap="gap-4">
                    <!-- News Open Behavior -->
                    <div class="toggle-card flex-col items-start gap-2 col-span-full">
                        <div class="flex justify-between items-center w-full">
                            <div class="flex flex-col min-w-0 flex-1">
                                <span class="text-sm font-medium">{$_("settings.newsOpenBehavior")}</span>
                                <span class="text-xs text-[var(--text-secondary)]">{$_("settings.newsOpenBehaviorDesc")}</span>
                            </div>
                        </div>
                        <SettingsGrid gap="gap-2">
                            <button
                                type="button"
                                class="p-2.5 rounded-lg border text-xs text-left transition-colors cursor-pointer flex items-center justify-between"
                                class:border-[var(--accent-color)]={settingsState.newsOpenBehavior === "smart"}
                                class:bg-[var(--bg-tertiary)]={settingsState.newsOpenBehavior === "smart"}
                                class:border-[var(--border-color)]={settingsState.newsOpenBehavior !== "smart"}
                                class:bg-[var(--bg-secondary)]={settingsState.newsOpenBehavior !== "smart"}
                                onclick={() => settingsState.newsOpenBehavior = "smart"}
                            >
                                <span class="font-medium text-[var(--text-primary)]">{$_("settings.newsOpenBehaviorSmart")}</span>
                                {#if settingsState.newsOpenBehavior === "smart"}
                                    <span class="text-[var(--accent-color)] font-bold text-xs">✓</span>
                                {/if}
                            </button>
                            <button
                                type="button"
                                class="p-2.5 rounded-lg border text-xs text-left transition-colors cursor-pointer flex items-center justify-between"
                                class:border-[var(--accent-color)]={settingsState.newsOpenBehavior === "reader"}
                                class:bg-[var(--bg-tertiary)]={settingsState.newsOpenBehavior === "reader"}
                                class:border-[var(--border-color)]={settingsState.newsOpenBehavior !== "reader"}
                                class:bg-[var(--bg-secondary)]={settingsState.newsOpenBehavior !== "reader"}
                                onclick={() => settingsState.newsOpenBehavior = "reader"}
                            >
                                <span class="font-medium text-[var(--text-primary)]">{$_("settings.newsOpenBehaviorReader")}</span>
                                {#if settingsState.newsOpenBehavior === "reader"}
                                    <span class="text-[var(--accent-color)] font-bold text-xs">✓</span>
                                {/if}
                            </button>
                            <button
                                type="button"
                                class="p-2.5 rounded-lg border text-xs text-left transition-colors cursor-pointer flex items-center justify-between"
                                class:border-[var(--accent-color)]={settingsState.newsOpenBehavior === "new_tab"}
                                class:bg-[var(--bg-tertiary)]={settingsState.newsOpenBehavior === "new_tab"}
                                class:border-[var(--border-color)]={settingsState.newsOpenBehavior !== "new_tab"}
                                class:bg-[var(--bg-secondary)]={settingsState.newsOpenBehavior !== "new_tab"}
                                onclick={() => settingsState.newsOpenBehavior = "new_tab"}
                            >
                                <span class="font-medium text-[var(--text-primary)]">{$_("settings.newsOpenBehaviorNewTab")}</span>
                                {#if settingsState.newsOpenBehavior === "new_tab"}
                                    <span class="text-[var(--accent-color)] font-bold text-xs">✓</span>
                                {/if}
                            </button>
                            <button
                                type="button"
                                class="p-2.5 rounded-lg border text-xs text-left transition-colors cursor-pointer flex items-center justify-between"
                                class:border-[var(--accent-color)]={settingsState.newsOpenBehavior === "window"}
                                class:bg-[var(--bg-tertiary)]={settingsState.newsOpenBehavior === "window"}
                                class:border-[var(--border-color)]={settingsState.newsOpenBehavior !== "window"}
                                class:bg-[var(--bg-secondary)]={settingsState.newsOpenBehavior !== "window"}
                                onclick={() => settingsState.newsOpenBehavior = "window"}
                            >
                                <span class="font-medium text-[var(--text-primary)]">{$_("settings.newsOpenBehaviorWindow")}</span>
                                {#if settingsState.newsOpenBehavior === "window"}
                                    <span class="text-[var(--accent-color)] font-bold text-xs">✓</span>
                                {/if}
                            </button>
                        </SettingsGrid>
                    </div>

                    <!-- Context Toggles -->
                    <label class="toggle-card border-l-4 border-l-[var(--accent-color)] gap-3">
                        <div class="flex flex-col min-w-0 flex-1">
                            <span class="text-sm font-medium"
                                >{$_("settings.ai.shareTradeContext")}</span
                            >
                            <span class="text-xs text-[var(--text-secondary)]"
                                >{$_("settings.ai.shareTradeContextDesc")}</span
                            >
                        </div>
                        <Toggle
                            bind:checked={settingsState.aiShareTradeContext}
                        />
                    </label>

                    <label class="toggle-card gap-3">
                        <div class="flex flex-col min-w-0 flex-1">
                            <span class="text-sm font-medium"
                                >{$_("settings.enableNewsAnalysis")}</span
                            >
                            <span class="text-xs text-[var(--text-secondary)]"
                                >{$_("settings.ai.newsDesc")}</span
                            >
                        </div>
                        <Toggle
                            bind:checked={settingsState.enableNewsAnalysis}
                        />
                    </label>
                    <label class="toggle-card gap-3">
                        <div class="flex flex-col min-w-0 flex-1">
                            <span class="text-sm font-medium"
                                >{$_("settings.enableCmcContext")}</span
                            >
                            <span class="text-xs text-[var(--text-secondary)]"
                                >{$_("settings.ai.cmcDesc")}</span
                            >
                        </div>
                        <Toggle bind:checked={settingsState.enableCmcContext} />
                    </label>

                    <!-- Safety & Confirmation -->
                    <label class="toggle-card gap-3">
                        <div class="flex flex-col min-w-0 flex-1">
                            <span class="text-sm font-medium"
                                >{$_("settings.ai.confirmActions")}</span
                            >
                            <span class="text-xs text-[var(--text-secondary)]"
                                >{$_("settings.ai.confirmActionsDesc")}</span
                            >
                        </div>
                        <Toggle bind:checked={settingsState.aiConfirmActions} />
                    </label>

                    <label class="toggle-card gap-3">
                        <div class="flex flex-col min-w-0 flex-1">
                            <span class="text-sm font-medium"
                                >{$_("settings.ai.allowSettingsChanges")}</span
                            >
                            <span class="text-xs text-[var(--text-secondary)]"
                                >{$_("settings.ai.allowSettingsChangesDesc")}</span
                            >
                        </div>
                        <Toggle bind:checked={settingsState.aiAllowSettingsChanges} />
                    </label>

                    <details class="permissions-dropdown col-span-full">
                        <summary class="permissions-summary">
                            <span class="text-sm font-medium"
                                >{$_("settings.ai.permissions.label")}</span
                            >
                            <span class="text-xs text-[var(--text-secondary)]">
                                {$_("settings.ai.permissions.count", {
                                    values: {
                                        enabled: allowedCount,
                                        total: totalActions,
                                    },
                                })}
                            </span>
                        </summary>
                        <div class="permissions-body">
                            <p class="text-xs text-[var(--text-secondary)]">
                                {$_("settings.ai.permissions.desc")}
                            </p>
                            {#each permissionGroups as group (group.id)}
                                <fieldset class="permission-group">
                                    <legend class="permission-group-title"
                                        >{$_(group.labelKey)}</legend
                                    >
                                    {#each group.entries as entry (entry.id)}
                                        <label class="permission-row">
                                            <input
                                                type="checkbox"
                                                checked={isActionAllowed(entry.id)}
                                                onchange={() =>
                                                    toggleAction(entry.id)}
                                            />
                                            <span class="permission-label"
                                                >{$_(entry.labelKey)}</span
                                            >
                                            {#if entry.alwaysConfirms}
                                                <span class="permission-badge"
                                                    >{$_(
                                                        "settings.ai.permissions.confirmBadge",
                                                    )}</span
                                                >
                                            {/if}
                                        </label>
                                    {/each}
                                </fieldset>
                            {/each}
                        </div>
                    </details>

                    <label class="toggle-card gap-3">
                        <div class="flex flex-col min-w-0 flex-1">
                            <span class="text-sm font-medium"
                                >{$_("settings.ai.confirmClearHistory")}</span
                            >
                            <span class="text-xs text-[var(--text-secondary)]"
                                >{$_("settings.ai.confirmClearHistoryDesc")}</span
                            >
                        </div>
                        <Toggle bind:checked={settingsState.aiConfirmClear} />
                    </label>

                    <!-- History Limit -->
                    <div class="field-group">
                        <label for="history-limit">{$_("settings.ai.historyDesc")}</label>
                        <input
                            id="history-limit"
                            type="number"
                            bind:value={settingsState.aiTradeHistoryLimit}
                            min="5"
                            max="100"
                            class="input-field"
                        />
                    </div>

                    <!-- Analysis Depth -->
                    <div class="field-group">
                        <label for="analysis-depth"
                            >{$_("settings.ai.depth.label")}: {$_(
                                `settings.ai.depth.${settingsState.analysisDepth || "standard"}`,
                            )}</label
                        >
                        <select
                            id="analysis-depth"
                            bind:value={settingsState.analysisDepth}
                            class="input-field"
                        >
                            <option value="quick">{$_("settings.ai.depth.quick")}</option>
                            <option value="standard">{$_("settings.ai.depth.standard")}</option>
                            <option value="deep">{$_("settings.ai.depth.deep")}</option>
                        </select>
                    </div>
                </SettingsGrid>
            </section>
        {/if}

        <!-- Agents (Social) -->
        {#if activeSubTab === "agents"}
            <section class="settings-section animate-fade-in">
                <h3 class="section-title mb-4">
                    {$_("settings.ai.agents")}
                </h3>

                <!-- Discord Bot -->
                <h4
                    class="text-xs font-bold text-[var(--text-secondary)] uppercase mb-2"
                >
                    {$_("settings.ai.discord.title")}
                </h4>
                <div class="field-group mb-4">
                    <label for="discord-token">{$_("settings.ai.discord.token")}</label>
                    <input
                        id="discord-token"
                        type="password"
                        bind:value={settingsState.discordBotToken}
                        class="input-field"
                    />
                </div>
                <div class="flex flex-col gap-2 mb-6">
                    {#if settingsState.discordChannels}
                        {#each settingsState.discordChannels as _channel, i}
                            <div class="flex items-center gap-2">
                                <input
                                    type="text"
                                    bind:value={settingsState.discordChannels[i]}
                                    class="input-field min-w-0 flex-1"
                                    placeholder={$_("settings.ai.discord.channelId")}
                                />
                                <button
                                    class="text-red-500 hover:text-red-400 p-2 shrink-0"
                                    onclick={() => removeDiscordChannel(i)}
                                    aria-label={$_("settings.ai.aria.removeChannel")}
                                >
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="16"
                                        height="16"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        ><path d="M18 6 6 18" /><path
                                            d="m6 6 12 12"
                                        /></svg
                                    >
                                </button>
                            </div>
                        {/each}
                    {/if}
                    <button
                        class="text-xs bg-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)] px-2 py-1 rounded border border-[var(--border-color)] w-max"
                        onclick={addDiscordChannel}
                        aria-label={$_("settings.ai.aria.addChannel")}
                    >
                        {$_("settings.ai.discord.addChannel")}
                    </button>
                </div>
            </section>
        {/if}
    </div>
</div>

<style>
    .section-title {
        font-size: var(--text-sm);
        font-weight: var(--font-bold);
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
        font-size: var(--text-xs);
        font-weight: var(--font-semibold);
        color: var(--text-secondary);
    }
    .input-field,
    .textarea-field {
        background-color: var(--bg-secondary);
        /* WCAG 1.4.11: --border-color is invisible in most themes; use the
           theme-tunable input boundary token. Covers the .textarea-field-only
           textarea, which has no .input-field class. */
        border: 1px solid var(--input-border-color);
        border-radius: var(--radius-lg);
        padding: var(--space-2) var(--space-3);
        font-size: var(--text-sm);
        color: var(--text-primary);
        outline: none;
    }
    .textarea-field {
        min-height: 80px;
        resize: vertical;
        font-family: inherit;
    }
    .segmented-control {
        display: flex;
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        padding: 2px;
        border-radius: var(--radius-lg);
        gap: 2px;
    }
    .segmented-btn {
        flex: 0 0 auto;
        padding: 0.4rem 0.6rem;
        font-size: var(--text-xs);
        font-weight: var(--font-semibold);
        color: var(--text-secondary);
        background: transparent;
        border: none;
        border-radius: 0.4rem;
        cursor: pointer;
        transition: background-color 0.2s, color 0.2s;
    }
    .segmented-btn.active {
        color: var(--btn-accent-text);
        background: var(--accent-color);
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
    .permissions-dropdown {
        padding: var(--space-4);
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-xl);
    }
    .permissions-summary {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 0.5rem;
        cursor: pointer;
        list-style: none;
    }
    .permissions-summary::-webkit-details-marker {
        display: none;
    }
    .permissions-body {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        margin-top: 0.75rem;
    }
    .permission-group {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        margin: 0;
        padding: 0;
        border: none;
    }
    .permission-group-title {
        font-size: var(--text-xs);
        font-weight: var(--font-semibold);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--text-secondary);
        padding: 0;
        margin-bottom: 0.25rem;
    }
    .permission-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        cursor: pointer;
    }
    .permission-label {
        font-size: var(--text-sm);
        color: var(--text-primary);
    }
    .permission-badge {
        font-size: var(--text-xs);
        color: var(--text-secondary);
        border: 1px solid var(--border-color);
        border-radius: 0.25rem;
        padding: 0 0.35rem;
    }
</style>
