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

    function addXMonitor() {
        if (!settingsState.xMonitors) settingsState.xMonitors = [];
        settingsState.xMonitors = [
            ...settingsState.xMonitors,
            { type: "user", value: "" },
        ];
    }

    function removeXMonitor(index: number) {
        const newMonitors = [...settingsState.xMonitors];
        newMonitors.splice(index, 1);
        settingsState.xMonitors = newMonitors;
    }

    const activeSubTab = $derived(uiState.settingsAiSubTab);

    const subTabs = [
        {
            id: "intelligence",
            label: $_("settings.tabs.ai_assistant") || "Intelligence",
        },
        { id: "behavior", label: $_("settings.ai.behavior") || "Behavior" },
        { id: "agents", label: $_("settings.ai.agents") || "Agents" },
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
                    ? 'bg-[var(--accent-color)] text-white'
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
                    {$_("settings.ai.intelligenceTitle") || "Intelligence Core"}
                </h3>

                <!-- Provider Switcher -->
                <div class="field-group mb-6">
                    <span
                        class="text-xs font-semibold color-[var(--text-secondary)] mb-1"
                        >{$_("settings.apiProvider") || "Provider"}</span
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

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="field-group">
                        <label for="openai-model"
                            >{$_("settings.ai.openaiModel")}</label
                        >
                        <input
                            id="openai-model"
                            bind:value={settingsState.openaiModel}
                            placeholder="gpt-4o"
                            class="input-field"
                        />
                    </div>
                    <div class="field-group">
                        <label for="gemini-model"
                            >{$_("settings.ai.geminiModel")}</label
                        >
                        <select
                            id="gemini-model"
                            bind:value={settingsState.geminiModel}
                            class="input-field"
                        >
                            <option value="gemini-2.5-flash"
                                >{$_("settings.ai.geminiRecommended")}</option
                            >
                            <option value="gemini-2.0-flash"
                                >{$_("settings.ai.geminiStable")}</option
                            >
                            <option value="gemini-3-flash-preview"
                                >{$_("settings.ai.geminiPreview")}</option
                            >
                            <option value="gemini-3-pro-preview"
                                >{$_("settings.ai.geminiPro")}</option
                            >
                            <option value="gemma-3-27b-it"
                                >{$_("settings.ai.gemmaOpen")}</option
                            >
                        </select>
                    </div>
                </div>
            </section>
        {/if}

        <!-- Behavior & Persona -->
        {#if activeSubTab === "behavior"}
            <section class="settings-section animate-fade-in">
                <h3 class="section-title mb-4">
                    {$_("settings.ai.behavior") || "Behavior & Persona"}
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
                                >Confirm Actions</span
                            >
                            <span class="text-xs text-[var(--text-secondary)]"
                                >Ask before executing trades</span
                            >
                        </div>
                        <Toggle bind:checked={settingsState.aiConfirmActions} />
                    </label>

                    <label class="toggle-card">
                        <div class="flex flex-col">
                            <span class="text-sm font-medium"
                                >Confirm Clear Chat</span
                            >
                            <span class="text-xs text-[var(--text-secondary)]"
                                >Prevent accidental deletion</span
                            >
                        </div>
                        <Toggle bind:checked={settingsState.aiConfirmClear} />
                    </label>

                    <!-- History Limit -->
                    <div class="field-group">
                        <label for="history-limit">Trade History Limit</label>
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
                            >Analysis Depth: {settingsState.analysisDepth ||
                                "Standard"}</label
                        >
                        <select
                            id="analysis-depth"
                            bind:value={settingsState.analysisDepth}
                            class="input-field"
                        >
                            <option value="quick">Quick (Fast)</option>
                            <option value="standard">Standard</option>
                            <option value="deep">Deep (Detailed)</option>
                        </select>
                    </div>
                </div>
            </section>
        {/if}

        <!-- Agents (Social) -->
        {#if activeSubTab === "agents"}
            <section class="settings-section animate-fade-in">
                <h3 class="section-title mb-4">
                    {$_("settings.ai.agents") || "Autonomous Agents"}
                </h3>

                <!-- Discord Bot -->
                <h4
                    class="text-xs font-bold text-[var(--text-secondary)] uppercase mb-2"
                >
                    Discord Bot
                </h4>
                <div class="field-group mb-4">
                    <label for="discord-token">Bot Token</label>
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
                                    placeholder="Channel ID"
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
                        + Add Channel
                    </button>
                </div>

                <!-- X Monitors -->
                <h4
                    class="text-xs font-bold text-[var(--text-secondary)] uppercase mb-2"
                >
                    X / Twitter Monitors
                </h4>
                <div class="flex flex-col gap-2">
                    {#if settingsState.xMonitors}
                        {#each settingsState.xMonitors as monitor, i}
                            <div class="flex items-center gap-2">
                                <select
                                    bind:value={monitor.type}
                                    class="input-field w-24"
                                >
                                    <option value="user">User</option>
                                    <option value="hashtag">Hash</option>
                                </select>
                                <input
                                    type="text"
                                    bind:value={monitor.value}
                                    class="input-field flex-1"
                                    placeholder={monitor.type === "user"
                                        ? "@username"
                                        : "#crypto"}
                                />
                                <button
                                    class="text-red-500 hover:text-red-400 p-2"
                                    onclick={() => removeXMonitor(i)}
                                    aria-label="Remove monitor"
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
                        onclick={addXMonitor}
                        aria-label="Add X Monitor"
                    >
                        + Add Monitor
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
