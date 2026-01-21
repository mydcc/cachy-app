<!--
  Copyright (C) 2026 MYDCT
-->

<script lang="ts">
    import { _ } from "../../../locales/i18n";
    import { settingsState } from "../../../stores/settings.svelte";
    import { enhancedInput } from "../../../lib/actions/inputEnhancements";

    const sidePanelModes = [
        { value: "ai", label: "AI Assistant" },
        { value: "chat", label: "Market Chat" },
        { value: "notes", label: "Private Notes" },
    ];

    const sidePanelLayouts = [
        { value: "standard", label: "Standard (Aside)" },
        { value: "floating", label: "Floating (Draggable)" },
    ];
</script>

<div
    class="workspace-tab flex flex-col gap-6"
    role="tabpanel"
    id="tab-workspace"
>
    <!-- Sidebar Master Controls -->
    <section class="settings-section">
        <div class="flex justify-between items-center mb-4">
            <h3 class="section-title mb-0">
                {$_("settings.workspace.sidebarTitle") ||
                    "Main Sidebar Controls"}
            </h3>
            <button
                class="toggle-container {settingsState.showSidebars
                    ? 'active'
                    : ''}"
                onclick={() =>
                    (settingsState.showSidebars = !settingsState.showSidebars)}
                aria-label="Toggle Sidebars"
            >
                <div class="toggle-thumb"></div>
            </button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label class="toggle-card">
                <div class="flex flex-col">
                    <span class="text-sm font-medium"
                        >{$_("settings.showTechnicals") ||
                            "Technicals Panel"}</span
                    >
                    <span class="text-[10px] text-[var(--text-secondary)]"
                        >{$_("settings.workspace.technicalsDesc") ||
                            "Show indicator computation panel"}</span
                    >
                </div>
                <input
                    type="checkbox"
                    bind:checked={settingsState.showTechnicals}
                    class="hidden-checkbox"
                />
                <div
                    class="card-indicator {settingsState.showTechnicals
                        ? 'active'
                        : ''}"
                ></div>
            </label>

            <label class="toggle-card">
                <div class="flex flex-col">
                    <span class="text-sm font-medium"
                        >{$_("settings.showIndicatorParams") ||
                            "Indicator Parameters"}</span
                    >
                    <span class="text-[10px] text-[var(--text-secondary)]"
                        >{$_("settings.workspace.paramsDesc") ||
                            "Show settings directly in panel"}</span
                    >
                </div>
                <input
                    type="checkbox"
                    bind:checked={settingsState.showIndicatorParams}
                    class="hidden-checkbox"
                />
                <div
                    class="card-indicator {settingsState.showIndicatorParams
                        ? 'active'
                        : ''}"
                ></div>
            </label>
        </div>
    </section>

    <!-- Granular Technicals Controls -->
    {#if settingsState.showTechnicals}
        <section
            class="settings-section border-t border-[var(--border-color)] pt-6"
        >
            <h3 class="section-title">
                {$_("settings.workspace.granularTechnicals") ||
                    "Technicals Modules"}
            </h3>
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {#each [{ id: "showTechnicalsSummary", label: "Summary" }, { id: "showTechnicalsConfluence", label: "Confluence" }, { id: "showTechnicalsVolatility", label: "Volatility" }, { id: "showTechnicalsOscillators", label: "Oscillators" }, { id: "showTechnicalsMAs", label: "MAs" }, { id: "showTechnicalsAdvanced", label: "Advanced" }, { id: "showTechnicalsSignals", label: "Signals" }, { id: "showTechnicalsPivots", label: "Pivots" }] as module}
                    <label class="module-toggle">
                        <input
                            type="checkbox"
                            checked={(settingsState as any)[module.id]}
                            onchange={(e) =>
                                ((settingsState as any)[module.id] =
                                    e.currentTarget.checked)}
                        />
                        <span>{module.label}</span>
                    </label>
                {/each}
            </div>
        </section>
    {/if}

    <!-- Market Overview Controls -->
    <section
        class="settings-section border-t border-[var(--border-color)] pt-6"
    >
        <h3 class="section-title">
            {$_("settings.workspace.marketOverview") || "Market Overview"}
        </h3>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <label class="module-toggle">
                <input
                    type="checkbox"
                    bind:checked={settingsState.showMarketOverviewLinks}
                />
                <span
                    >{$_("settings.showMarketLinks") ||
                        "Links & Research"}</span
                >
            </label>
            <label class="module-toggle">
                <input
                    type="checkbox"
                    bind:checked={settingsState.showMarketActivity}
                />
                <span
                    >{$_("settings.showMarketActivity") ||
                        "Market Details"}</span
                >
            </label>
            {#if settingsState.isPro}
                <label class="module-toggle">
                    <input
                        type="checkbox"
                        bind:checked={settingsState.showSidebarActivity}
                    />
                    <span
                        >{$_("settings.showSidebarActivity") ||
                            "Activity Sidebar"}</span
                    >
                </label>
            {/if}
            <label class="module-toggle">
                <input
                    type="checkbox"
                    bind:checked={settingsState.showMarketSentiment}
                />
                <span
                    >{$_("settings.showMarketSentiment") ||
                        "Social Sentiment"}</span
                >
            </label>
        </div>
    </section>

    <!-- Side Panel & Widgets -->
    <section
        class="settings-section border-t border-[var(--border-color)] pt-6"
    >
        <div class="flex justify-between items-center mb-4">
            <h3 class="section-title mb-0">
                {$_("settings.workspace.panelTitle") || "Side Panel & Widgets"}
            </h3>
            <button
                class="toggle-container {settingsState.enableSidePanel
                    ? 'active'
                    : ''}"
                onclick={() =>
                    (settingsState.enableSidePanel =
                        !settingsState.enableSidePanel)}
                aria-label="Enable Side Panel"
            >
                <div class="toggle-thumb"></div>
            </button>
        </div>

        {#if settingsState.enableSidePanel}
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div class="field-group">
                    <span
                        class="text-xs font-semibold text-[var(--text-secondary)] mb-1"
                        >{$_("settings.workspace.panelMode") ||
                            "Panel Feature"}</span
                    >
                    <div class="segmented-control">
                        {#each sidePanelModes as mode}
                            <button
                                class="segmented-btn {settingsState.sidePanelMode ===
                                mode.value
                                    ? 'active'
                                    : ''}"
                                onclick={() =>
                                    (settingsState.sidePanelMode =
                                        mode.value as any)}
                            >
                                {mode.label}
                            </button>
                        {/each}
                        <div
                            class="segmented-bg"
                            style="width: 33.33%; transform: translateX({settingsState.sidePanelMode ===
                            'ai'
                                ? '0%'
                                : settingsState.sidePanelMode === 'chat'
                                  ? '100%'
                                  : '200%'})"
                        ></div>
                    </div>
                </div>

                <div class="field-group">
                    <span
                        class="text-xs font-semibold text-[var(--text-secondary)] mb-1"
                        >{$_("settings.workspace.panelLayout") ||
                            "Mounting Type"}</span
                    >
                    <div class="segmented-control">
                        {#each sidePanelLayouts as layout}
                            <button
                                class="segmented-btn {settingsState.sidePanelLayout ===
                                layout.value
                                    ? 'active'
                                    : ''}"
                                onclick={() =>
                                    (settingsState.sidePanelLayout =
                                        layout.value as any)}
                            >
                                {layout.label}
                            </button>
                        {/each}
                        <div
                            class="segmented-bg"
                            style="transform: translateX({settingsState.sidePanelLayout ===
                            'standard'
                                ? '0%'
                                : '100%'})"
                        ></div>
                    </div>
                </div>

                {#if settingsState.sidePanelMode === "notes"}
                    <div class="field-group">
                        <label for="max-notes"
                            >{$_("settings.maxPrivateNotes") ||
                                "Max Notes History"}</label
                        >
                        <input
                            id="max-notes"
                            type="number"
                            bind:value={settingsState.maxPrivateNotes}
                            use:enhancedInput
                            class="input-field"
                        />
                    </div>
                {/if}

                {#if settingsState.sidePanelMode === "chat"}
                    <div class="field-group">
                        <label for="min-chat-pf"
                            >{$_("settings.minChatProfitFactor") ||
                                "Min. Chat Profit Factor"}</label
                        >
                        <input
                            id="min-chat-pf"
                            type="number"
                            step="0.01"
                            bind:value={settingsState.minChatProfitFactor}
                            use:enhancedInput
                            class="input-field"
                        />
                        <p class="text-[10px] text-[var(--text-secondary)]">
                            {$_("settings.minChatProfitFactorDesc") ||
                                "Filter chat messages from users below this PF"}
                        </p>
                    </div>
                {/if}
            </div>
        {/if}

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
            <label class="toggle-card">
                <div class="flex flex-col">
                    <span class="text-sm font-medium"
                        >{$_("settings.hideUnfilledOrders") ||
                            "Focus View"}</span
                    >
                    <span class="text-[10px] text-[var(--text-secondary)]"
                        >{$_("settings.workspace.focusDesc") ||
                            "Hide non-essential table data"}</span
                    >
                </div>
                <input
                    type="checkbox"
                    bind:checked={settingsState.hideUnfilledOrders}
                    class="hidden-checkbox"
                />
                <div
                    class="card-indicator {settingsState.hideUnfilledOrders
                        ? 'active'
                        : ''}"
                ></div>
            </label>

            <label class="toggle-card">
                <div class="flex flex-col">
                    <span class="text-sm font-medium"
                        >{$_("settings.positionViewMode") ||
                            "Expert Layout"}</span
                    >
                    <span class="text-[10px] text-[var(--text-secondary)]"
                        >{$_("settings.workspace.expertDesc") ||
                            "Detailed vs compact positions"}</span
                    >
                </div>
                <input
                    type="checkbox"
                    checked={settingsState.positionViewMode === "detailed"}
                    onchange={(e) =>
                        (settingsState.positionViewMode = e.currentTarget
                            .checked
                            ? "detailed"
                            : "focus")}
                    class="hidden-checkbox"
                />
                <div
                    class="card-indicator {settingsState.positionViewMode ===
                    'detailed'
                        ? 'active'
                        : ''}"
                ></div>
            </label>
        </div>

        <!-- Performance & Updates -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
            <div class="field-group">
                <label for="market-interval"
                    >{$_("settings.marketDataInterval") ||
                        "Update Speed"}</label
                >
                <select
                    id="market-interval"
                    bind:value={settingsState.marketDataInterval}
                    class="input-field py-1 text-xs"
                >
                    <option value={1000}>1s (Ultra)</option>
                    <option value={2000}>2s (Fast)</option>
                    <option value={5000}>5s (Normal)</option>
                    <option value={10000}>10s (Save CPU)</option>
                </select>
            </div>

            <div class="field-group justify-end">
                <label class="flex items-center gap-2 cursor-pointer h-full">
                    <input
                        type="checkbox"
                        bind:checked={settingsState.autoUpdatePriceInput}
                        class="w-4 h-4 accent-[var(--accent-color)]"
                    />
                    <span class="text-xs"
                        >{$_("settings.autoUpdatePriceInput") ||
                            "Live Price Link"}</span
                    >
                </label>
            </div>

            <div class="field-group justify-end">
                <label class="flex items-center gap-2 cursor-pointer h-full">
                    <input
                        type="checkbox"
                        bind:checked={settingsState.autoFetchBalance}
                        class="w-4 h-4 accent-[var(--accent-color)]"
                    />
                    <span class="text-xs"
                        >{$_("settings.autoFetchBalance") ||
                            "Auto Balance"}</span
                    >
                </label>
            </div>
        </div>
    </section>
</div>

<style>
    .workspace-tab {
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

    /* Toggle Cards */
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
        width: 20px;
        height: 20px;
        border-radius: 50%;
        border: 2px solid var(--border-color);
        position: relative;
        transition: all 0.3s ease;
    }

    .card-indicator.active {
        border-color: var(--accent-color);
        background: var(--accent-color);
    }

    .card-indicator.active::after {
        content: "";
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: white;
    }

    /* Module Toggles (Grid) */
    .module-toggle {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem 0.75rem;
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 0.5rem;
        cursor: pointer;
        font-size: 0.75rem;
        transition: all 0.2s ease;
    }

    .module-toggle:has(input:checked) {
        border-color: var(--accent-color);
        background: rgba(var(--accent-rgb), 0.05);
        color: var(--accent-color);
        font-weight: 600;
    }

    .module-toggle input {
        accent-color: var(--accent-color);
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
        transition: all 0.2s ease;
    }

    /* Segmented Control (Shared with Profile) */
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
        width: calc(50% - 2px);
        background: var(--accent-color);
        border-radius: 0.4rem;
        transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
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
    .active .toggle-thumb {
        transform: translateX(16px);
    }
</style>
