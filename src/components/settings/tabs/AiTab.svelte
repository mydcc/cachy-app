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

    const aiProviders = [
        { value: "openai", label: "OpenAI (GPT-4o)" },
        { value: "gemini", label: "Google Gemini (Pro)" },
        { value: "anthropic", label: "Anthropic (Claude 3.5)" },
    ];

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
</script>

<div class="ai-tab h-full flex flex-col" role="tabpanel" id="tab-ai">
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
                onclick={() => (uiState.settingsAiSubTab = tab.id)}
            >
                {tab.label}
            </button>
        {/each}
    </div>

    <div class="flex-1 overflow-y-auto custom-scrollbar pr-2">
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
                    <div class="segmented-control">
                        {#each aiProviders as provider}
                            <button
                                class="segmented-btn {settingsState.aiProvider ===
                                provider.value
                                    ? 'active'
                                    : ''}"
                                onclick={() =>
                                    (settingsState.aiProvider =
                                        provider.value as any)}
                            >
                                {provider.label}
                            </button>
                        {/each}
                        <div
                            class="segmented-bg"
                            style="width: 33.33%; transform: translateX({settingsState.aiProvider ===
                            'openai'
                                ? '0%'
                                : settingsState.aiProvider === 'gemini'
                                  ? '100%'
                                  : '200%'})"
                        ></div>
                    </div>
                    <p class="text-[10px] text-[var(--text-secondary)] mt-1">
                        {$_("settings.ai.providerDesc")}
                    </p>
                </div>

                <div class="mt-4 p-4 bg-[var(--bg-tertiary)] rounded-lg border border-[var(--border-color)]">
                    {#if settingsState.aiProvider === "openai"}
                        <div class="grid grid-cols-1 gap-4">
                            <div class="field-group">
                                <label for="openai-key">{$_("settings.ai.openaiApiKey")}</label>
                                <input
                                    id="openai-key"
                                    type="password"
                                    bind:value={settingsState.openaiApiKey}
                                    class="input-field"
                                    placeholder="sk-..."
                                />
                            </div>
                            <div class="field-group">
                                <label for="openai-model">{$_("settings.ai.openaiModel")}</label>
                                <input
                                    id="openai-model"
                                    bind:value={settingsState.openaiModel}
                                    placeholder="gpt-4o"
                                    class="input-field"
                                />
                            </div>
                        </div>
                    {:else if settingsState.aiProvider === "gemini"}
                        <div class="grid grid-cols-1 gap-4">
                            <div class="field-group">
                                <label for="gemini-key">{$_("settings.ai.geminiApiKey")}</label>
                                <input
                                    id="gemini-key"
                                    type="password"
                                    bind:value={settingsState.geminiApiKey}
                                    class="input-field"
                                    placeholder="AIza..."
                                />
                            </div>
                            <div class="field-group">
                                <label for="gemini-model">{$_("settings.ai.geminiModel")}
                                    <span class="text-[10px] font-normal text-[var(--text-secondary)] ml-2">({$_("settings.ai.geminiModelDesc")})</span>
                                </label>
                                <select
                                    id="gemini-model"
                                    bind:value={settingsState.geminiModel}
                                    class="input-field"
                                >
                                    <option value="gemini-2.5-flash">{$_("settings.ai.geminiRecommended")}</option>
                                    <option value="gemini-2.0-flash">{$_("settings.ai.geminiStable")}</option>
                                    <option value="gemini-3-flash-preview">{$_("settings.ai.geminiPreview")}</option>
                                    <option value="gemini-3-pro-preview">{$_("settings.ai.geminiPro")}</option>
                                    <option value="gemma-3-27b-it">{$_("settings.ai.gemmaOpen")}</option>
                                </select>
                            </div>
                        </div>
                    {:else if settingsState.aiProvider === "anthropic"}
                        <div class="grid grid-cols-1 gap-4">
                            <div class="field-group">
                                <label for="anthropic-key">{$_("settings.ai.anthropicApiKey")}</label>
                                <input
                                    id="anthropic-key"
                                    type="password"
                                    bind:value={settingsState.anthropicApiKey}
                                    class="input-field"
                                    placeholder="sk-ant-..."
                                />
                            </div>
                            <div class="field-group">
                                <label for="anthropic-model">{$_("settings.ai.anthropicModel")}</label>
                                <input
                                    id="anthropic-model"
                                    bind:value={settingsState.anthropicModel}
                                    placeholder="claude-3-5-sonnet-20240620"
                                    class="input-field"
                                />
                                <span class="text-[10px] text-[var(--text-secondary)] mt-1">
                                    {$_("settings.ai.anthropicModelDesc")}
                                </span>
                            </div>
                        </div>
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

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <!-- Context Toggles -->
                    <label class="toggle-card">
                        <div class="flex flex-col">
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
                    <label class="toggle-card">
                        <div class="flex flex-col">
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
                    <label class="toggle-card">
                        <div class="flex flex-col">
                            <span class="text-sm font-medium"
                                >{$_("settings.ai.confirmActions")}</span
                            >
                            <span class="text-xs text-[var(--text-secondary)]"
                                >{$_("settings.ai.confirmActionsDesc")}</span
                            >
                        </div>
                        <Toggle bind:checked={settingsState.aiConfirmActions} />
                    </label>

                    <label class="toggle-card">
                        <div class="flex flex-col">
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
                </div>
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
                        {#each settingsState.discordChannels as channel, i}
                            <div class="flex items-center gap-2">
                                <input
                                    type="text"
                                    bind:value={
                                        settingsState.discordChannels[i]
                                    }
                                    class="input-field"
                                    placeholder={$_("settings.ai.discord.channelId")}
                                />
                                <button
                                    class="text-red-500 hover:text-red-400 p-2"
                                    onclick={() => removeDiscordChannel(i)}
                                    aria-label="Remove channel"
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
                        aria-label="Add Channel"
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
        font-size: 0.875rem;
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
    .input-field,
    .textarea-field {
        background-color: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 0.5rem;
        padding: 0.5rem 0.75rem;
        font-size: 0.875rem;
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
        border-radius: 0.5rem;
        position: relative;
        overflow: hidden;
    }
    .segmented-btn {
        flex: 1;
        z-index: 1;
        padding: 0.4rem;
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--text-secondary);
        background: transparent;
        border: none;
        cursor: pointer;
    }
    .segmented-btn.active {
        color: var(--btn-accent-text);
    }
    .segmented-bg {
        position: absolute;
        top: 2px;
        bottom: 2px;
        left: 2px;
        background: var(--accent-color);
        border-radius: 0.4rem;
        transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
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
