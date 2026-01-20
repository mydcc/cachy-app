<!--
  Copyright (C) 2026 MYDCT
-->

<script lang="ts">
    import { _ } from "../../../locales/i18n";
    import { settingsState } from "../../../stores/settings.svelte";
    import Toggle from "../../shared/Toggle.svelte";
    import { enhancedInput } from "../../../lib/actions/inputEnhancements";

    const aiProviders = [
        { value: "openai", label: "OpenAI (GPT-4o)" },
        { value: "gemini", label: "Google Gemini (Pro)" },
        { value: "anthropic", label: "Anthropic (Claude 3.5)" },
    ];
</script>

<div
    class="ai-assistant-tab flex flex-col gap-6"
    role="tabpanel"
    id="tab-ai-assistant"
>
    <!-- Provider Selection -->
    <section class="settings-section">
        <h3 class="section-title">
            {$_("settings.ai.intelligenceTitle") || "Intelligence Core"}
        </h3>

        <div class="field-group">
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
                            (settingsState.aiProvider = provider.value as any)}
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
                {$_("settings.ai.providerDesc") ||
                    "Select your primary AI engine for market analysis and automated actions."}
            </p>
        </div>
    </section>

    <!-- Model & System Configuration -->
    <section
        class="settings-section border-t border-[var(--border-color)] pt-6"
    >
        <h3 class="section-title">
            {$_("settings.ai.modelTitle") || "Model & Prompting"}
        </h3>

        <div class="grid grid-cols-1 gap-6">
            <!-- Custom System Prompt -->
            <div class="field-group">
                <label for="system-prompt"
                    >{$_("settings.ai.customSystemPrompt")}</label
                >
                <textarea
                    id="system-prompt"
                    bind:value={settingsState.customSystemPrompt}
                    placeholder={$_("settings.ai.systemPromptPlaceholder") ||
                        "You are a professional crypto trading assistant..."}
                    class="textarea-field h-32"
                ></textarea>
                <p class="text-[10px] text-[var(--text-secondary)]">
                    {$_("settings.ai.customSystemPromptDesc")}
                </p>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <!-- OpenAI Model Name -->
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

                <!-- Gemini Model Selector (Curated) -->
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
                    <p class="text-[10px] text-[var(--text-secondary)] mt-1">
                        {$_("settings.ai.geminiModelDesc") ||
                            "Gemini 2.5 Flash offers the best balance. Gemma 3 has high rate limits (14.4k/day)."}
                    </p>
                </div>
            </div>
        </div>
    </section>

    <!-- Context & Connectivity -->
    <section
        class="settings-section border-t border-[var(--border-color)] pt-6"
    >
        <h3 class="section-title">
            {$_("settings.ai.contextTitle") || "Context & Data Access"}
        </h3>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <!-- News Analysis -->
            <label class="toggle-card">
                <div class="flex flex-col">
                    <span class="text-sm font-medium"
                        >{$_("settings.enableNewsAnalysis") ||
                            "Market News Context"}</span
                    >
                    <span class="text-[10px] text-[var(--text-secondary)]"
                        >{$_("settings.ai.newsDesc") ||
                            "AI considers latest news headlines"}</span
                    >
                </div>
                <input
                    type="checkbox"
                    bind:checked={settingsState.enableNewsAnalysis}
                    class="hidden-checkbox"
                />
                <div
                    class="card-indicator {settingsState.enableNewsAnalysis
                        ? 'active'
                        : ''}"
                ></div>
            </label>

            <!-- CMC Context -->
            <label class="toggle-card">
                <div class="flex flex-col">
                    <span class="text-sm font-medium"
                        >{$_("settings.enableCmcContext") ||
                            "CoinMarketCap Data"}</span
                    >
                    <span class="text-[10px] text-[var(--text-secondary)]"
                        >{$_("settings.ai.cmcDesc") ||
                            "Fetch market stats for symbols"}</span
                    >
                </div>
                <input
                    type="checkbox"
                    bind:checked={settingsState.enableCmcContext}
                    class="hidden-checkbox"
                />
                <div
                    class="card-indicator {settingsState.enableCmcContext
                        ? 'active'
                        : ''}"
                ></div>
            </label>
        </div>

        <div class="field-group mt-6">
            <label for="trade-limit"
                >{$_("settings.ai.historyDesc") ||
                    "Trade History Context"}</label
            >
            <input
                id="trade-limit"
                type="number"
                min="0"
                max="200"
                step="1"
                bind:value={settingsState.aiTradeHistoryLimit}
                class="input-field"
            />
            <p class="text-[10px] text-[var(--text-secondary)]">
                {$_("settings.ai.historyDesc") ||
                    "Number of recent trades sent to AI for context"}
            </p>
        </div>
    </section>

    <!-- Safety & Verifications -->
    <section
        class="settings-section border-t border-[var(--border-color)] pt-6"
    >
        <h3 class="section-title">
            {$_("settings.ai.safetyTitle") || "Safety & Verifications"}
        </h3>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="safety-toggle">
                <span class="text-xs font-semibold"
                    >{$_("settings.ai.confirmActions")}</span
                >
                <Toggle bind:checked={settingsState.aiConfirmActions} />
            </div>
            <div class="safety-toggle">
                <span class="text-xs font-semibold"
                    >{$_("settings.ai.confirmClear")}</span
                >
                <Toggle bind:checked={settingsState.aiConfirmClear} />
            </div>
        </div>
    </section>
</div>

<style>
    .ai-assistant-tab {
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
        transition: all 0.2s ease;
    }

    .textarea-field {
        resize: vertical;
        min-height: 80px;
        font-family: inherit;
    }

    /* Shared UI Elements (similar to Workspace/Profile) */
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
        border: none;
        background: transparent;
        cursor: pointer;
        transition: color 0.3s ease;
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
        transition: all 0.2s ease;
    }
    .toggle-card:hover {
        border-color: var(--accent-color);
        background: var(--bg-tertiary);
    }
    .hidden-checkbox {
        display: none;
    }
    .card-indicator {
        width: 14px;
        height: 14px;
        border-radius: 50%;
        border: 2px solid var(--border-color);
        transition: all 0.3s ease;
    }
    .card-indicator.active {
        border-color: var(--accent-color);
        background: var(--accent-color);
        box-shadow: 0 0 8px var(--accent-color);
    }

    .safety-toggle {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.75rem;
        background: rgba(var(--warning-rgb), 0.05);
        border: 1px solid var(--border-color);
        border-radius: 0.5rem;
    }
</style>
