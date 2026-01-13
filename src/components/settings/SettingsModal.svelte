<script lang="ts">
    import ModalFrame from "../shared/ModalFrame.svelte";
    import {
        settingsStore,
        type ApiKeys,
        type HotkeyMode,
        type PositionViewMode,
        type AiProvider,
        type SidePanelLayout,
    } from "../../stores/settingsStore";
    import {
        indicatorStore,
        type IndicatorSettings,
    } from "../../stores/indicatorStore";
    import { uiStore } from "../../stores/uiStore";
    import { _, locale, setLocale } from "../../locales/i18n";
    import {
        createBackup,
        restoreFromBackup,
    } from "../../services/backupService";
    import { trackCustomEvent } from "../../services/trackingService";
    import { normalizeTimeframeInput } from "../../utils/utils";
    import HotkeySettings from "./HotkeySettings.svelte";
    import Toggle from "../shared/Toggle.svelte";
    import { enhancedInput } from "../../lib/actions/inputEnhancements";
    import {
        HOTKEY_ACTIONS,
        MODE1_MAP,
        MODE2_MAP,
        MODE3_MAP,
    } from "../../services/hotkeyService";

    // Local state for the form inputs
    let apiProvider: "bitunix" | "binance";
    let marketDataInterval: "1s" | "1m" | "10m";
    let autoUpdatePriceInput: boolean;
    let autoFetchBalance: boolean;
    let showSidebars: boolean;
    let showTechnicals: boolean;
    let showIndicatorParams: boolean;
    let hideUnfilledOrders: boolean;
    let feePreference: "maker" | "taker";
    let hotkeyMode: HotkeyMode;
    let positionViewMode: PositionViewMode;
    let showSpinButtons: boolean | "hover";

    // Timeframe & RSI Sync
    let favoriteTimeframes: string[] = [];
    let favoriteTimeframesInput: string = ""; // Text input
    let syncRsiTimeframe: boolean;

    // Indicator Settings
    let historyLimit = $indicatorStore.historyLimit || 2000;
    let precision = $indicatorStore.precision || 4;
    let rsiSettings = { ...$indicatorStore.rsi };
    let macdSettings = { ...$indicatorStore.macd };
    let stochSettings = { ...$indicatorStore.stochastic };
    let cciSettings = { ...$indicatorStore.cci };
    let adxSettings = { ...$indicatorStore.adx };
    let aoSettings = { ...$indicatorStore.ao };
    let momentumSettings = { ...$indicatorStore.momentum };
    let emaSettings = { ...$indicatorStore.ema };
    let pivotSettings = { ...$indicatorStore.pivots };

    // Side Panel Settings
    let enableSidePanel: boolean;
    let sidePanelMode: "chat" | "notes" | "ai";
    let sidePanelLayout: SidePanelLayout;

    // AI Settings
    let aiProviderState: AiProvider;
    let openaiApiKey: string;
    let openaiModel: string;
    let geminiApiKey: string;
    let geminiModel: string;
    let anthropicApiKey: string;
    let anthropicModel: string;

    // Separate API keys per provider
    let bitunixKeys: ApiKeys = { key: "", secret: "" };
    let binanceKeys: ApiKeys = { key: "", secret: "" };

    // ImgBB
    let imgbbApiKey: string;
    let imgbbExpiration: number;

    // UI state
    let currentTheme: string;
    let currentLanguage: string;
    let isPro: boolean;

    // Track active tab
    let activeTab:
        | "general"
        | "api"
        | "ai"
        | "behavior"
        | "system"
        | "sidebar"
        | "indicators"
        | "hotkeys" = "general";
    let isInitialized = false;

    const availableTimeframes = [
        "1m",
        "3m",
        "5m",
        "15m",
        "30m",
        "1h",
        "2h",
        "4h",
        "6h",
        "8h",
        "12h",
        "1d",
        "3d",
        "1w",
        "1M",
    ];

    const themes = [
        { value: "dark", label: "Dark (Default)" },
        { value: "light", label: "Light" },
        { value: "meteorite", label: "Meteorite" },
        { value: "midnight", label: "Midnight" },
        { value: "cobalt2", label: "Cobalt2" },
        { value: "night-owl", label: "Night Owl" },
        { value: "dracula", label: "Dracula" },
        { value: "dracula-soft", label: "Dracula Soft" },
        { value: "monokai", label: "Monokai" },
        { value: "nord", label: "Nord" },
        { value: "solarized-dark", label: "Solarized Dark" },
        { value: "solarized-light", label: "Solarized Light" },
        { value: "gruvbox-dark", label: "Gruvbox Dark" },
        { value: "catppuccin", label: "Catppuccin" },
        { value: "tokyo-night", label: "Tokyo Night" },
        { value: "one-dark-pro", label: "One Dark Pro" },
        { value: "obsidian", label: "Obsidian" },
        { value: "ayu-dark", label: "Ayu Dark" },
        { value: "ayu-light", label: "Ayu Light" },
        { value: "ayu-mirage", label: "Ayu Mirage" },
        { value: "github-dark", label: "GitHub Dark" },
        { value: "github-light", label: "GitHub Light" },
        { value: "steel", label: "Steel" },
        { value: "matrix", label: "Matrix" },
        { value: "everforest-dark", label: "Everforest Dark" },
        { value: "VIP", label: "VIP" },
    ];

    // Subscribe to store to initialize local state
    // We use a guard to prevent overwriting user changes if the store updates while modal is open
    $: if ($uiStore.showSettingsModal) {
        if (!isInitialized) {
            apiProvider = $settingsStore.apiProvider;
            marketDataInterval = $settingsStore.marketDataInterval;
            autoUpdatePriceInput = $settingsStore.autoUpdatePriceInput;
            autoFetchBalance = $settingsStore.autoFetchBalance;
            showSidebars = $settingsStore.showSidebars;
            showTechnicals = $settingsStore.showTechnicals;
            showIndicatorParams = $settingsStore.showIndicatorParams;
            hideUnfilledOrders = $settingsStore.hideUnfilledOrders;
            positionViewMode = $settingsStore.positionViewMode || "detailed";
            feePreference = $settingsStore.feePreference;
            hotkeyMode = $settingsStore.hotkeyMode;
            enableSidePanel = $settingsStore.enableSidePanel;
            sidePanelMode = $settingsStore.sidePanelMode;
            sidePanelLayout = $settingsStore.sidePanelLayout || "standard";
            isPro = $settingsStore.isPro;
            showSpinButtons = $settingsStore.showSpinButtons || "hover";

            aiProviderState = $settingsStore.aiProvider || "gemini";
            openaiApiKey = $settingsStore.openaiApiKey || "";
            openaiModel = $settingsStore.openaiModel || "gpt-4o";
            geminiApiKey = $settingsStore.geminiApiKey || "";
            geminiModel = $settingsStore.geminiModel || "gemini-2.0-flash";
            anthropicApiKey = $settingsStore.anthropicApiKey || "";
            anthropicModel =
                $settingsStore.anthropicModel || "claude-3-5-sonnet-20240620";

            favoriteTimeframes = [...$settingsStore.favoriteTimeframes];
            favoriteTimeframesInput = favoriteTimeframes.join(", "); // Init text input
            syncRsiTimeframe = $settingsStore.syncRsiTimeframe;

            activeTab = ($uiStore.settingsTab || "general") as any;

            historyLimit = $indicatorStore.historyLimit || 2000;
            precision = $indicatorStore.precision || 4;
            rsiSettings = { ...$indicatorStore.rsi };
            macdSettings = { ...$indicatorStore.macd };
            stochSettings = { ...$indicatorStore.stochastic };
            cciSettings = { ...$indicatorStore.cci };
            adxSettings = { ...$indicatorStore.adx };
            aoSettings = { ...$indicatorStore.ao };
            momentumSettings = { ...$indicatorStore.momentum };
            emaSettings = { ...$indicatorStore.ema };
            pivotSettings = { ...$indicatorStore.pivots };

            // Deep copy keys to avoid binding issues
            bitunixKeys = { ...$settingsStore.apiKeys.bitunix };
            binanceKeys = { ...$settingsStore.apiKeys.binance };

            imgbbApiKey = $settingsStore.imgbbApiKey;
            imgbbExpiration = $settingsStore.imgbbExpiration;

            currentTheme = $uiStore.currentTheme;
            currentLanguage = $locale || "en";

            isInitialized = true;
        }
    } else {
        isInitialized = false;
    }

    // Reactive update for settings (Immediate Save)
    $: if (isInitialized) {
        settingsStore.update((s) => ({
            ...s,
            apiProvider,
            marketDataInterval,
            autoUpdatePriceInput,
            autoFetchBalance,
            showSidebars,
            showTechnicals,
            showIndicatorParams,
            hideUnfilledOrders,
            feePreference,
            hotkeyMode,
            enableSidePanel,
            sidePanelMode,
            sidePanelLayout,
            favoriteTimeframes,
            syncRsiTimeframe,
            imgbbApiKey,
            imgbbExpiration,
            aiProvider: aiProviderState,
            openaiApiKey,
            openaiModel,
            geminiApiKey,
            geminiModel,
            anthropicApiKey,
            anthropicModel,
            showSpinButtons,
            apiKeys: {
                bitunix: bitunixKeys,
                binance: binanceKeys,
            },
        }));

        indicatorStore.set({
            historyLimit,
            precision,
            rsi: rsiSettings,
            macd: macdSettings,
            stochastic: stochSettings,
            cci: cciSettings,
            adx: adxSettings,
            ao: aoSettings,
            momentum: momentumSettings,
            ema: emaSettings,
            pivots: pivotSettings,
        });
    }

    // Immediate Theme Update
    $: if (isInitialized && currentTheme !== $uiStore.currentTheme) {
        uiStore.setTheme(currentTheme);
    }

    // Immediate Language Update
    $: if (isInitialized && currentLanguage !== $locale) {
        setLocale(currentLanguage);
    }

    function close() {
        uiStore.toggleSettingsModal(false);
    }

    // System Tab Functions
    function handleBackup() {
        createBackup();
        trackCustomEvent("System", "Backup", "Created");
    }

    async function handleRestore(e: Event) {
        const input = e.target as HTMLInputElement;
        if (!input.files || input.files.length === 0) return;

        const file = input.files[0];
        const reader = new FileReader();

        reader.onload = async (event) => {
            const content = event.target?.result as string;
            if (confirm($_("app.restoreConfirmMessage"))) {
                const result = restoreFromBackup(content);
                if (result.success) {
                    alert(result.message);
                    window.location.reload();
                } else {
                    alert(result.message);
                }
            }
            // Reset input
            input.value = "";
        };

        reader.onerror = () => {
            alert($_("app.fileReadError"));
            input.value = "";
        };

        reader.readAsText(file);
    }

    function handleReset() {
        if (confirm($_("settings.resetConfirm"))) {
            localStorage.clear();
            window.location.reload();
        }
    }

    function handleTimeframeInput(event: Event) {
        const input = (event.target as HTMLInputElement).value;
        favoriteTimeframesInput = input; // update local input state

        const rawTags = input
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s !== "");

        // Normalize
        const normalizedTags = rawTags.map(normalizeTimeframeInput);

        // Limit to 4
        const limitedTags = normalizedTags.slice(0, 4);

        favoriteTimeframes = limitedTags;
    }

    function handleTimeframeBlur() {
        // Re-format the input field to show the normalized versions nicely
        favoriteTimeframesInput = favoriteTimeframes.join(", ");
    }

    function getHotkeyDescriptions(mode: string) {
        let map: Record<string, string> = {};
        if (mode === "mode1") map = MODE1_MAP;
        else if (mode === "mode2") map = MODE2_MAP;
        else if (mode === "mode3") map = MODE3_MAP;
        else return [];

        // Group slightly for display or just list them?
        // Listing all might be long. Let's list primary ones.
        return HOTKEY_ACTIONS.map((action) => {
            const key = map[action.id];
            if (!key) return null;
            return { keys: key, action: action.label };
        }).filter((x) => x !== null);
    }

    // Reactive descriptions based on selected mode
    $: activeDescriptions = getHotkeyDescriptions(hotkeyMode);
</script>

<ModalFrame
    isOpen={$uiStore.showSettingsModal}
    title={$_("settings.title") || "Settings"}
    on:close={close}
    extraClasses="!w-[1000px] !max-w-[95vw] !max-h-[90vh] flex flex-col overflow-hidden"
    alignment="top"
>
    <!-- Main Content Container (Split View) -->
    <div class="flex flex-col md:flex-row flex-1 min-h-0 overflow-hidden">
        <!-- Sidebar Navigation -->
        <div
            class="flex md:flex-col overflow-x-auto md:overflow-y-auto md:w-56 border-b md:border-b-0 md:border-r border-[var(--border-color)] shrink-0 bg-[var(--bg-secondary)]"
            role="tablist"
        >
            <button
                class="px-4 py-3 text-sm font-medium transition-colors text-left focus:outline-none whitespace-nowrap {activeTab ===
                'general'
                    ? 'bg-[var(--bg-tertiary)] text-[var(--accent-color)] border-b-2 md:border-b-0 md:border-l-2 border-[var(--accent-color)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] border-b-2 md:border-b-0 md:border-l-2 border-transparent'}"
                on:click={() => (activeTab = "general")}
                role="tab"
                aria-selected={activeTab === "general"}
            >
                {$_("settings.tabs.general")}
            </button>
            <button
                class="px-4 py-3 text-sm font-medium transition-colors text-left focus:outline-none whitespace-nowrap {activeTab ===
                'api'
                    ? 'bg-[var(--bg-tertiary)] text-[var(--accent-color)] border-b-2 md:border-b-0 md:border-l-2 border-[var(--accent-color)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] border-b-2 md:border-b-0 md:border-l-2 border-transparent'}"
                on:click={() => (activeTab = "api")}
                role="tab"
                aria-selected={activeTab === "api"}
            >
                {$_("settings.tabs.api")}
            </button>
            <button
                class="px-4 py-3 text-sm font-medium transition-colors text-left focus:outline-none whitespace-nowrap {activeTab ===
                'ai'
                    ? 'bg-[var(--bg-tertiary)] text-[var(--accent-color)] border-b-2 md:border-b-0 md:border-l-2 border-[var(--accent-color)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] border-b-2 md:border-b-0 md:border-l-2 border-transparent'}"
                on:click={() => (activeTab = "ai")}
                role="tab"
                aria-selected={activeTab === "ai"}
            >
                AI Chat
            </button>
            <button
                class="px-4 py-3 text-sm font-medium transition-colors text-left focus:outline-none whitespace-nowrap {activeTab ===
                'behavior'
                    ? 'bg-[var(--bg-tertiary)] text-[var(--accent-color)] border-b-2 md:border-b-0 md:border-l-2 border-[var(--accent-color)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] border-b-2 md:border-b-0 md:border-l-2 border-transparent'}"
                on:click={() => (activeTab = "behavior")}
                role="tab"
                aria-selected={activeTab === "behavior"}
            >
                {$_("settings.tabs.behavior")}
            </button>
            <button
                class="px-4 py-3 text-sm font-medium transition-colors text-left focus:outline-none whitespace-nowrap {activeTab ===
                'hotkeys'
                    ? 'bg-[var(--bg-tertiary)] text-[var(--accent-color)] border-b-2 md:border-b-0 md:border-l-2 border-[var(--accent-color)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] border-b-2 md:border-b-0 md:border-l-2 border-transparent'}"
                on:click={() => (activeTab = "hotkeys")}
                role="tab"
                aria-selected={activeTab === "hotkeys"}
            >
                Hotkeys
            </button>
            <button
                class="px-4 py-3 text-sm font-medium transition-colors text-left focus:outline-none whitespace-nowrap {activeTab ===
                'sidebar'
                    ? 'bg-[var(--bg-tertiary)] text-[var(--accent-color)] border-b-2 md:border-b-0 md:border-l-2 border-[var(--accent-color)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] border-b-2 md:border-b-0 md:border-l-2 border-transparent'}"
                on:click={() => (activeTab = "sidebar")}
                role="tab"
                aria-selected={activeTab === "sidebar"}
            >
                Sidebar
            </button>
            <button
                class="px-4 py-3 text-sm font-medium transition-colors text-left focus:outline-none whitespace-nowrap {activeTab ===
                'indicators'
                    ? 'bg-[var(--bg-tertiary)] text-[var(--accent-color)] border-b-2 md:border-b-0 md:border-l-2 border-[var(--accent-color)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] border-b-2 md:border-b-0 md:border-l-2 border-transparent'}"
                on:click={() => (activeTab = "indicators")}
                role="tab"
                aria-selected={activeTab === "indicators"}
            >
                Technicals
            </button>
            <button
                class="px-4 py-3 text-sm font-medium transition-colors text-left focus:outline-none whitespace-nowrap {activeTab ===
                'system'
                    ? 'bg-[var(--bg-tertiary)] text-[var(--accent-color)] border-b-2 md:border-b-0 md:border-l-2 border-[var(--accent-color)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] border-b-2 md:border-b-0 md:border-l-2 border-transparent'}"
                on:click={() => (activeTab = "system")}
                role="tab"
                aria-selected={activeTab === "system"}
            >
                {$_("settings.tabs.system")}
            </button>
        </div>

        <!-- Tab Content Area -->
        <div
            class="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar bg-[var(--bg-primary)]"
        >
            {#if activeTab === "general"}
                <div
                    class="flex flex-col gap-4"
                    role="tabpanel"
                    id="tab-general"
                    aria-labelledby="tab-general-label"
                >
                    <div class="grid grid-cols-2 gap-4">
                        <div class="flex flex-col gap-1">
                            <label
                                for="settings-language"
                                class="text-xs font-medium text-[var(--text-secondary)]"
                                >{$_("settings.language")}</label
                            >
                            <select
                                id="settings-language"
                                name="language"
                                bind:value={currentLanguage}
                                class="input-field p-2 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] text-sm"
                            >
                                <option value="en">English</option>
                                <option value="de">Deutsch</option>
                            </select>
                        </div>
                        <div class="flex flex-col gap-1">
                            <label
                                for="settings-theme"
                                class="text-xs font-medium text-[var(--text-secondary)]"
                                >{$_("settings.theme")}</label
                            >
                            <select
                                id="settings-theme"
                                name="theme"
                                bind:value={currentTheme}
                                class="input-field p-2 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] text-sm"
                            >
                                {#each themes as theme, index}
                                    <option
                                        value={theme.value}
                                        disabled={!isPro && index >= 5}
                                        >{theme.label}
                                        {!isPro && index >= 5
                                            ? "(Pro)"
                                            : ""}</option
                                    >
                                {/each}
                            </select>
                        </div>
                    </div>
                    <div class="flex flex-col gap-1 mt-2">
                        <span class="text-sm font-medium"
                            >{$_("settings.feePreference")}</span
                        >
                        <div class="flex gap-2">
                            <label
                                class="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-[var(--bg-tertiary)] flex-1 border border-[var(--border-color)]"
                            >
                                <input
                                    id="fee-maker"
                                    name="feePreference"
                                    type="radio"
                                    bind:group={feePreference}
                                    value="maker"
                                    class="accent-[var(--accent-color)]"
                                />
                                <span class="text-sm">Maker</span>
                            </label>
                            <label
                                class="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-[var(--bg-tertiary)] flex-1 border border-[var(--border-color)]"
                            >
                                <input
                                    id="fee-taker"
                                    name="feePreference"
                                    type="radio"
                                    bind:group={feePreference}
                                    value="taker"
                                    class="accent-[var(--accent-color)]"
                                />
                                <span class="text-sm">Taker</span>
                            </label>
                        </div>
                        <p class="text-xs text-[var(--text-secondary)]">
                            {$_("settings.feePreferenceDesc")}
                        </p>
                    </div>
                </div>
            {:else if activeTab === "api"}
                <div class="flex flex-col gap-4" role="tabpanel" id="tab-api">
                    <div
                        class="p-3 border border-[var(--border-color)] rounded bg-[var(--bg-tertiary)] flex flex-col gap-2"
                    >
                        <h4
                            class="text-xs uppercase font-bold text-[var(--text-secondary)]"
                        >
                            {$_("settings.imgbbHeader")}
                        </h4>
                        <div class="flex flex-col gap-1">
                            <label for="imgbb-key" class="text-xs"
                                >{$_("settings.imgbbApiKey")}</label
                            >
                            <input
                                id="imgbb-key"
                                name="imgbbApiKey"
                                type="password"
                                bind:value={imgbbApiKey}
                                class="input-field p-1 px-2 rounded text-sm"
                                placeholder="Paste ImgBB Key"
                            />
                        </div>
                        <div class="flex flex-col gap-1">
                            <label for="imgbb-exp" class="text-xs"
                                >{$_("settings.imgbbExpiration")}</label
                            >
                            <select
                                id="imgbb-exp"
                                name="imgbbExpiration"
                                bind:value={imgbbExpiration}
                                class="input-field p-1 px-2 rounded text-sm bg-[var(--bg-secondary)] border border-[var(--border-color)]"
                            >
                                <option value={0}
                                    >{$_("settings.imgbbPermanent")}</option
                                >
                                <option value={600}
                                    >{$_("settings.imgbb10m")}</option
                                >
                                <option value={3600}
                                    >{$_("settings.imgbb1h")}</option
                                >
                                <option value={86400}
                                    >{$_("settings.imgbb1d")}</option
                                >
                                <option value={604800}
                                    >{$_("settings.imgbb1w")}</option
                                >
                                <option value={2592000}
                                    >{$_("settings.imgbb1m")}</option
                                >
                            </select>
                        </div>
                        <p class="text-[10px] text-[var(--text-secondary)]">
                            {$_("settings.imgbbGetKey")}
                            <a
                                href="https://api.imgbb.com/"
                                target="_blank"
                                class="text-[var(--accent-color)] hover:underline"
                                >api.imgbb.com</a
                            >.
                        </p>
                    </div>
                    <div class="flex flex-col gap-1">
                        <label for="api-provider" class="text-sm font-medium"
                            >{$_("settings.providerLabel")}</label
                        >
                        <select
                            id="api-provider"
                            name="apiProvider"
                            bind:value={apiProvider}
                            class="input-field p-2 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)]"
                        >
                            <option value="bitunix">Bitunix</option>
                            <option value="binance">Binance Futures</option>
                        </select>
                    </div>
                    {#if apiProvider === "bitunix"}
                        <div
                            class="p-3 border border-[var(--border-color)] rounded bg-[var(--bg-tertiary)] flex flex-col gap-2"
                        >
                            <h4
                                class="text-xs uppercase font-bold text-[var(--text-secondary)]"
                            >
                                Bitunix Credentials
                            </h4>
                            <div class="flex flex-col gap-1">
                                <label for="bx-key" class="text-xs"
                                    >API Key</label
                                >
                                <input
                                    id="bx-key"
                                    name="bitunixKey"
                                    type="password"
                                    bind:value={bitunixKeys.key}
                                    class="input-field p-1 px-2 rounded text-sm"
                                    placeholder="Paste Key"
                                />
                            </div>
                            <div class="flex flex-col gap-1">
                                <label for="bx-secret" class="text-xs"
                                    >Secret Key</label
                                >
                                <input
                                    id="bx-secret"
                                    name="bitunixSecret"
                                    type="password"
                                    bind:value={bitunixKeys.secret}
                                    class="input-field p-1 px-2 rounded text-sm"
                                    placeholder="Paste Secret"
                                />
                            </div>
                        </div>
                    {:else}
                        <div
                            class="p-3 border border-[var(--border-color)] rounded bg-[var(--bg-tertiary)] flex flex-col gap-2"
                        >
                            <h4
                                class="text-xs uppercase font-bold text-[var(--text-secondary)]"
                            >
                                Binance Credentials
                            </h4>
                            <div class="flex flex-col gap-1">
                                <label for="bn-key" class="text-xs"
                                    >API Key</label
                                >
                                <input
                                    id="bn-key"
                                    name="binanceKey"
                                    type="password"
                                    bind:value={binanceKeys.key}
                                    class="input-field p-1 px-2 rounded text-sm"
                                    placeholder="Paste Key"
                                />
                            </div>
                            <div class="flex flex-col gap-1">
                                <label for="bn-secret" class="text-xs"
                                    >Secret Key</label
                                >
                                <input
                                    id="bn-secret"
                                    name="binanceSecret"
                                    type="password"
                                    bind:value={binanceKeys.secret}
                                    class="input-field p-1 px-2 rounded text-sm"
                                    placeholder="Paste Secret"
                                />
                            </div>
                        </div>
                    {/if}
                    <p class="text-xs text-[var(--text-secondary)] italic">
                        {$_("settings.securityNote")}
                    </p>
                </div>
            {:else if activeTab === "ai"}
                <div class="flex flex-col gap-4" role="tabpanel" id="tab-ai">
                    <div
                        class="p-3 border border-[var(--border-color)] rounded bg-[var(--bg-tertiary)] flex flex-col gap-4"
                    >
                        <h4
                            class="text-xs uppercase font-bold text-[var(--text-secondary)]"
                        >
                            AI Provider Settings
                        </h4>
                        <div class="flex flex-col gap-1">
                            <label for="ai-provider" class="text-sm font-medium"
                                >Default Provider</label
                            >
                            <select
                                id="ai-provider"
                                name="aiProvider"
                                bind:value={aiProviderState}
                                class="input-field p-2 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)]"
                            >
                                <option value="openai">OpenAI (ChatGPT)</option>
                                <option value="gemini">Google Gemini</option>
                                <option value="anthropic"
                                    >Anthropic (Claude)</option
                                >
                            </select>
                        </div>
                        <div
                            class="flex flex-col gap-4 pt-4 border-t border-[var(--border-color)]"
                        >
                            <div class="flex flex-col gap-2">
                                <label
                                    for="openai-key"
                                    class="text-xs font-bold flex items-center gap-2"
                                >
                                    <span>OpenAI</span>
                                    {#if aiProviderState === "openai"}<span
                                            class="w-1.5 h-1.5 rounded-full bg-[var(--accent-color)]"
                                        />{/if}
                                </label>
                                <input
                                    id="openai-key"
                                    name="openaiKey"
                                    type="password"
                                    bind:value={openaiApiKey}
                                    class="input-field p-1 px-2 rounded text-sm mb-1"
                                    placeholder="API Key (sk-...)"
                                />
                                <div class="flex items-center gap-2">
                                    <label
                                        for="openai-model"
                                        class="text-[10px] text-[var(--text-secondary)] w-12"
                                        >Model:</label
                                    >
                                    <input
                                        id="openai-model"
                                        name="openaiModel"
                                        type="text"
                                        bind:value={openaiModel}
                                        class="input-field p-1 px-2 rounded text-xs flex-1 bg-[var(--bg-secondary)] border border-[var(--border-color)]"
                                        placeholder="gpt-4o"
                                    />
                                </div>
                            </div>
                            <div
                                class="flex flex-col gap-2 border-t border-[var(--border-color)] pt-3"
                            >
                                <label
                                    for="gemini-key"
                                    class="text-xs font-bold flex items-center gap-2"
                                >
                                    <span>Google Gemini</span>
                                    {#if aiProviderState === "gemini"}<span
                                            class="w-1.5 h-1.5 rounded-full bg-[var(--accent-color)]"
                                        />{/if}
                                </label>
                                <input
                                    id="gemini-key"
                                    name="geminiKey"
                                    type="password"
                                    bind:value={geminiApiKey}
                                    class="input-field p-1 px-2 rounded text-sm mb-1"
                                    placeholder="API Key (AIza...)"
                                />
                                <div class="flex items-center gap-2">
                                    <label
                                        for="gemini-model"
                                        class="text-[10px] text-[var(--text-secondary)] w-12"
                                        >Model:</label
                                    >
                                    <input
                                        id="gemini-model"
                                        name="geminiModel"
                                        type="text"
                                        bind:value={geminiModel}
                                        class="input-field p-1 px-2 rounded text-xs flex-1 bg-[var(--bg-secondary)] border border-[var(--border-color)]"
                                        placeholder="gemini-2.0-flash-exp"
                                    />
                                </div>
                                <p
                                    class="text-[10px] text-[var(--text-secondary)] italic"
                                >
                                    Use <code>gemini-1.5-flash</code> for stability
                                    if the experimental version fails.
                                </p>
                            </div>
                            <div
                                class="flex flex-col gap-2 border-t border-[var(--border-color)] pt-3"
                            >
                                <label
                                    for="anthropic-key"
                                    class="text-xs font-bold flex items-center gap-2"
                                >
                                    <span>Anthropic</span>
                                    {#if aiProviderState === "anthropic"}<span
                                            class="w-1.5 h-1.5 rounded-full bg-[var(--accent-color)]"
                                        />{/if}
                                </label>
                                <input
                                    id="anthropic-key"
                                    name="anthropicKey"
                                    type="password"
                                    bind:value={anthropicApiKey}
                                    class="input-field p-1 px-2 rounded text-sm mb-1"
                                    placeholder="API Key (sk-ant-...)"
                                />
                                <div class="flex items-center gap-2">
                                    <label
                                        for="anthropic-model"
                                        class="text-[10px] text-[var(--text-secondary)] w-12"
                                        >Model:</label
                                    >
                                    <input
                                        id="anthropic-model"
                                        name="anthropicModel"
                                        type="text"
                                        bind:value={anthropicModel}
                                        class="input-field p-1 px-2 rounded text-xs flex-1 bg-[var(--bg-secondary)] border border-[var(--border-color)]"
                                        placeholder="claude-3-5-sonnet-20240620"
                                    />
                                </div>
                            </div>
                        </div>
                        <p
                            class="text-[10px] text-[var(--text-secondary)] mt-2 italic border-t border-[var(--border-color)] pt-2"
                        >
                            Your API keys are stored locally in your browser and
                            are never saved to our servers. They are only used
                            to communicate directly with the AI providers.
                        </p>
                    </div>
                </div>
            {:else if activeTab === "behavior"}
                <div
                    class="flex flex-col gap-4"
                    role="tabpanel"
                    id="tab-behavior"
                >
                    <!-- Spin Buttons Global Toggle -->
                    <div
                        class="flex flex-col gap-2 p-3 border border-[var(--border-color)] rounded bg-[var(--bg-secondary)] mb-2"
                    >
                        <div class="flex flex-col">
                            <span
                                class="text-sm font-bold text-[var(--accent-color)]"
                                >{$_("settings.showSpinButtons")}</span
                            >
                            <span
                                class="text-[10px] text-[var(--text-secondary)] mb-2"
                                >Globale Sichtbarkeit der Scroll-Buttons in
                                Eingabefeldern</span
                            >
                        </div>
                        <div class="flex gap-2">
                            <label
                                class="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-[var(--bg-tertiary)] flex-1 border border-[var(--border-color)] transition-colors"
                                class:bg-[var(--bg-tertiary)]={showSpinButtons ===
                                    true}
                                class:border-[var(--accent-color)]={showSpinButtons ===
                                    true}
                            >
                                <input
                                    type="radio"
                                    bind:group={showSpinButtons}
                                    value={true}
                                    class="accent-[var(--accent-color)]"
                                />
                                <span class="text-xs font-medium"
                                    >{$_("settings.spinButtonsAlways")}</span
                                >
                            </label>
                            <label
                                class="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-[var(--bg-tertiary)] flex-1 border border-[var(--border-color)] transition-colors"
                                class:bg-[var(--bg-tertiary)]={showSpinButtons ===
                                    "hover"}
                                class:border-[var(--accent-color)]={showSpinButtons ===
                                    "hover"}
                            >
                                <input
                                    type="radio"
                                    bind:group={showSpinButtons}
                                    value="hover"
                                    class="accent-[var(--accent-color)]"
                                />
                                <span class="text-xs font-medium"
                                    >{$_("settings.spinButtonsHover")}</span
                                >
                            </label>
                            <label
                                class="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-[var(--bg-tertiary)] flex-1 border border-[var(--border-color)] transition-colors"
                                class:bg-[var(--bg-tertiary)]={showSpinButtons ===
                                    false}
                                class:border-[var(--accent-color)]={showSpinButtons ===
                                    false}
                            >
                                <input
                                    type="radio"
                                    bind:group={showSpinButtons}
                                    value={false}
                                    class="accent-[var(--accent-color)]"
                                />
                                <span class="text-xs font-medium"
                                    >{$_("settings.spinButtonsHidden")}</span
                                >
                            </label>
                        </div>
                    </div>

                    <div class="flex flex-col gap-1">
                        <label
                            for="market-data-interval"
                            class="text-sm font-medium"
                            >{$_("settings.intervalLabel")}</label
                        >
                        <select
                            id="market-data-interval"
                            name="marketDataInterval"
                            bind:value={marketDataInterval}
                            class="input-field p-2 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)]"
                        >
                            <option value="1s"
                                >{$_("settings.interval1s")}</option
                            >
                            <option value="1m"
                                >{$_("settings.interval1m")}</option
                            >
                            <option value="10m"
                                >{$_("settings.interval10m")}</option
                            >
                        </select>
                    </div>
                    <label
                        class="flex items-center justify-between p-2 rounded hover:bg-[var(--bg-tertiary)] cursor-pointer"
                    >
                        <div class="flex flex-col">
                            <span class="text-sm font-medium"
                                >{$_("settings.autoUpdatePrice")}</span
                            >
                            <span class="text-xs text-[var(--text-secondary)]"
                                >Overwrite entry price on every update tick</span
                            >
                        </div>
                        <input
                            id="auto-update-price"
                            name="autoUpdatePrice"
                            type="checkbox"
                            bind:checked={autoUpdatePriceInput}
                            class="accent-[var(--accent-color)] h-4 w-4 rounded"
                        />
                    </label>
                    <label
                        class="flex items-center justify-between p-2 rounded hover:bg-[var(--bg-tertiary)] cursor-pointer"
                    >
                        <div class="flex flex-col">
                            <span class="text-sm font-medium"
                                >{$_("settings.autoFetchBalance")}</span
                            >
                            <span class="text-xs text-[var(--text-secondary)]"
                                >Fetch wallet balance on startup</span
                            >
                        </div>
                        <input
                            id="auto-fetch-balance"
                            name="autoFetchBalance"
                            type="checkbox"
                            bind:checked={autoFetchBalance}
                            class="accent-[var(--accent-color)] h-4 w-4 rounded"
                        />
                    </label>
                    <div
                        class="flex flex-col gap-2 pt-2 border-t border-[var(--border-color)]"
                    >
                        <label for="hotkey-mode" class="text-sm font-medium"
                            >Hotkey Profile</label
                        >
                        <select
                            id="hotkey-mode"
                            name="hotkeyMode"
                            bind:value={hotkeyMode}
                            class="input-field p-2 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)]"
                        >
                            <option value="custom"
                                >Custom (Fully Configurable)</option
                            >
                            <option value="mode2"
                                >Safety Mode (Alt + Key)</option
                            >
                            <option value="mode1">Direct Mode (Fast)</option>
                            <option value="mode3">Hybrid Mode</option>
                        </select>
                        {#if hotkeyMode !== "custom"}
                            <div
                                class="bg-[var(--bg-tertiary)] p-3 rounded text-xs text-[var(--text-secondary)] mt-1"
                            >
                                <div
                                    class="font-bold mb-2 text-[var(--text-primary)]"
                                >
                                    Active Hotkeys ({activeDescriptions.length}):
                                </div>
                                <div
                                    class="grid grid-cols-2 gap-x-4 gap-y-1 max-h-[200px] overflow-y-auto custom-scrollbar pr-2"
                                >
                                    {#each activeDescriptions as desc}
                                        <div class="flex justify-between gap-4">
                                            <span
                                                class="font-mono text-[var(--accent-color)] whitespace-nowrap"
                                                >{desc.keys}</span
                                            >
                                            <span class="truncate"
                                                >{desc.action}</span
                                            >
                                        </div>
                                    {/each}
                                </div>
                            </div>
                        {:else}
                            <div
                                class="bg-[var(--bg-tertiary)] p-3 rounded text-xs text-[var(--text-secondary)] mt-1"
                            >
                                <p>
                                    Configure your custom hotkeys in the
                                    "Hotkeys" tab.
                                </p>
                            </div>
                        {/if}
                    </div>
                </div>
            {:else if activeTab === "hotkeys"}
                <div
                    class="flex flex-col h-full"
                    role="tabpanel"
                    id="tab-hotkeys"
                >
                    {#if hotkeyMode !== "custom"}
                        <div
                            class="flex flex-col items-center justify-center h-full p-6 text-center text-[var(--text-secondary)]"
                        >
                            <p class="mb-4">
                                You are currently using a preset Hotkey Mode.
                            </p>
                            <button
                                class="px-4 py-2 bg-[var(--accent-color)] text-[var(--btn-accent-text)] rounded font-bold text-sm"
                                on:click={() => (hotkeyMode = "custom")}
                            >
                                Switch to Custom Mode to Edit
                            </button>
                        </div>
                    {:else}
                        <HotkeySettings />
                    {/if}
                </div>
            {:else if activeTab === "sidebar"}
                <div
                    class="flex flex-col gap-4"
                    role="tabpanel"
                    id="tab-sidebar"
                >
                    <label
                        class="flex items-center justify-between p-2 rounded hover:bg-[var(--bg-tertiary)] cursor-pointer border border-[var(--border-color)]"
                    >
                        <span class="text-sm font-medium"
                            >{$_("settings.showSidebars")}</span
                        >
                        <input
                            id="show-sidebars"
                            name="showSidebars"
                            type="checkbox"
                            bind:checked={showSidebars}
                            class="accent-[var(--accent-color)] h-4 w-4 rounded"
                        />
                    </label>
                    <label
                        class="flex items-center justify-between p-2 rounded hover:bg-[var(--bg-tertiary)] cursor-pointer border border-[var(--border-color)]"
                    >
                        <span class="text-sm font-medium"
                            >{$_("settings.showTechnicals") ||
                                "Show Technicals Panel"}</span
                        >
                        <input
                            id="show-technicals"
                            name="showTechnicals"
                            type="checkbox"
                            bind:checked={showTechnicals}
                            class="accent-[var(--accent-color)] h-4 w-4 rounded"
                        />
                    </label>
                    <label
                        class="flex items-center justify-between p-2 rounded hover:bg-[var(--bg-tertiary)] cursor-pointer border border-[var(--border-color)]"
                    >
                        <div class="flex flex-col">
                            <span class="text-sm font-medium"
                                >{$_("settings.enableSidePanel")}</span
                            >
                            <span class="text-xs text-[var(--text-secondary)]"
                                >{$_("settings.sidePanelDesc")}</span
                            >
                        </div>
                        <input
                            id="enable-side-panel"
                            name="enableSidePanel"
                            type="checkbox"
                            bind:checked={enableSidePanel}
                            class="accent-[var(--accent-color)] h-4 w-4 rounded"
                        />
                    </label>
                    <div
                        class="flex flex-col gap-3 ml-4 border-l-2 border-[var(--border-color)] pl-4 transition-opacity duration-200 {enableSidePanel
                            ? 'opacity-100'
                            : 'opacity-50 pointer-events-none'}"
                    >
                        <div class="flex flex-col gap-1">
                            <span class="text-sm font-medium"
                                >{$_("settings.sidePanelMode")}</span
                            >
                            <div class="flex gap-2">
                                <label
                                    class="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-[var(--bg-tertiary)] flex-1 border border-[var(--border-color)]"
                                >
                                    <input
                                        id="sp-mode-notes"
                                        name="sidePanelMode"
                                        type="radio"
                                        bind:group={sidePanelMode}
                                        value="notes"
                                        class="accent-[var(--accent-color)]"
                                    />
                                    <span class="text-sm"
                                        >{$_("settings.modeNotes")}</span
                                    >
                                </label>
                                <label
                                    class="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-[var(--bg-tertiary)] flex-1 border border-[var(--border-color)]"
                                >
                                    <input
                                        id="sp-mode-chat"
                                        name="sidePanelMode"
                                        type="radio"
                                        bind:group={sidePanelMode}
                                        value="chat"
                                        class="accent-[var(--accent-color)]"
                                    />
                                    <span class="text-sm"
                                        >{$_("settings.modeChat")}</span
                                    >
                                </label>
                                <label
                                    class="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-[var(--bg-tertiary)] flex-1 border border-[var(--border-color)]"
                                >
                                    <input
                                        id="sp-mode-ai"
                                        name="sidePanelMode"
                                        type="radio"
                                        bind:group={sidePanelMode}
                                        value="ai"
                                        class="accent-[var(--accent-color)]"
                                    />
                                    <span class="text-sm">AI Chat</span>
                                </label>
                            </div>
                        </div>
                        <div class="flex flex-col gap-1">
                            <span class="text-sm font-medium"
                                >{$_("settings.sidePanelLayout")}</span
                            >
                            <div class="flex flex-col gap-2">
                                <label
                                    class="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-[var(--bg-tertiary)] border border-[var(--border-color)]"
                                >
                                    <input
                                        id="sp-layout-standard"
                                        name="sidePanelLayout"
                                        type="radio"
                                        bind:group={sidePanelLayout}
                                        value="standard"
                                        class="accent-[var(--accent-color)]"
                                    />
                                    <div class="flex flex-col">
                                        <span class="text-sm"
                                            >{$_(
                                                "settings.layoutStandard"
                                            )}</span
                                        >
                                        <span
                                            class="text-[10px] text-[var(--text-secondary)]"
                                            >{$_(
                                                "settings.layoutStandardDesc"
                                            )}</span
                                        >
                                    </div>
                                </label>
                                <label
                                    class="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-[var(--bg-tertiary)] border border-[var(--border-color)]"
                                >
                                    <input
                                        id="sp-layout-transparent"
                                        name="sidePanelLayout"
                                        type="radio"
                                        bind:group={sidePanelLayout}
                                        value="transparent"
                                        class="accent-[var(--accent-color)]"
                                    />
                                    <div class="flex flex-col">
                                        <span class="text-sm"
                                            >{$_(
                                                "settings.layoutTransparent"
                                            )}</span
                                        >
                                        <span
                                            class="text-[10px] text-[var(--text-secondary)]"
                                            >{$_(
                                                "settings.layoutTransparentDesc"
                                            )}</span
                                        >
                                    </div>
                                </label>
                                <label
                                    class="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-[var(--bg-tertiary)] border border-[var(--border-color)]"
                                >
                                    <input
                                        id="sp-layout-floating"
                                        name="sidePanelLayout"
                                        type="radio"
                                        bind:group={sidePanelLayout}
                                        value="floating"
                                        class="accent-[var(--accent-color)]"
                                    />
                                    <div class="flex flex-col">
                                        <span class="text-sm"
                                            >{$_(
                                                "settings.layoutFloating"
                                            )}</span
                                        >
                                        <span
                                            class="text-[10px] text-[var(--text-secondary)]"
                                            >{$_(
                                                "settings.layoutFloatingDesc"
                                            )}</span
                                        >
                                    </div>
                                </label>
                            </div>
                        </div>
                    </div>
                    <label
                        class="flex items-center justify-between p-2 rounded hover:bg-[var(--bg-tertiary)] cursor-pointer border border-[var(--border-color)]"
                    >
                        <span class="text-sm font-medium"
                            >{$_("settings.hideUnfilledOrders")}</span
                        >
                        <input
                            id="hide-unfilled"
                            name="hideUnfilledOrders"
                            type="checkbox"
                            bind:checked={hideUnfilledOrders}
                            class="accent-[var(--accent-color)] h-4 w-4 rounded"
                        />
                    </label>
                    <div class="flex flex-col gap-1">
                        <label for="pos-view-mode" class="text-sm font-medium"
                            >Position View Mode</label
                        >
                        <select
                            id="pos-view-mode"
                            name="positionViewMode"
                            bind:value={positionViewMode}
                            class="input-field p-2 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)]"
                        >
                            <option value="detailed">Detailed (Default)</option>
                            <option value="focus">Focus (Compact)</option>
                        </select>
                    </div>
                </div>
            {:else if activeTab === "indicators"}
                <div
                    class="flex flex-col gap-4 overflow-x-hidden"
                    role="tabpanel"
                    id="tab-indicators"
                >
                    <div
                        class="flex items-center justify-between p-3 rounded border border-[var(--border-color)] bg-[var(--bg-tertiary)]"
                    >
                        <div class="flex flex-col">
                            <span class="text-sm font-medium"
                                >{$_("settings.showIndicatorParams")}</span
                            >
                            <span
                                class="text-[10px] text-[var(--text-secondary)]"
                                >Zeigt Parameter wie Länge/Quelle direkt im
                                Panel an</span
                            >
                        </div>
                        <Toggle bind:checked={showIndicatorParams} />
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <!-- Left Column: Global & Core Indicators -->
                        <div class="flex flex-col gap-4">
                            <!-- Global Technical Settings -->
                            <div
                                class="flex flex-col gap-2 p-3 border border-[var(--border-color)] rounded bg-[var(--bg-tertiary)]"
                            >
                                <h4
                                    class="text-xs uppercase font-bold text-[var(--text-secondary)] mb-1"
                                >
                                    Global Settings
                                </h4>

                                <div class="flex items-center justify-between">
                                    <label for="precision" class="text-xs"
                                        >Technicals Precision</label
                                    >
                                    <div class="flex items-center gap-2">
                                        <input
                                            id="precision"
                                            type="number"
                                            min="0"
                                            max="8"
                                            step="1"
                                            class="input-field rounded settings-number-input text-xs"
                                            bind:value={precision}
                                            use:enhancedInput={{
                                                min: 0,
                                                max: 8,
                                            }}
                                        />
                                        <span
                                            class="text-[10px] text-[var(--text-secondary)]"
                                            >dec</span
                                        >
                                    </div>
                                </div>

                                <div
                                    class="flex items-center justify-between mt-1"
                                >
                                    <label for="history-limit" class="text-xs"
                                        >History Depth</label
                                    >
                                    <div class="flex items-center gap-2">
                                        <input
                                            id="history-limit"
                                            type="number"
                                            min="200"
                                            max="5000"
                                            step="100"
                                            class="input-field rounded settings-number-input text-xs"
                                            bind:value={historyLimit}
                                            use:enhancedInput={{
                                                min: 200,
                                                max: 5000,
                                                step: 100,
                                            }}
                                        />
                                        <span
                                            class="text-[10px] text-[var(--text-secondary)]"
                                            >bars</span
                                        >
                                    </div>
                                </div>
                            </div>

                            <!-- Timeframe Favorites -->
                            <div
                                class="flex flex-col gap-2 p-3 border border-[var(--border-color)] rounded bg-[var(--bg-tertiary)]"
                            >
                                <div
                                    class="flex justify-between items-center mb-1"
                                >
                                    <h4
                                        class="text-xs uppercase font-bold text-[var(--text-secondary)]"
                                    >
                                        Timeframes
                                    </h4>
                                    <span
                                        class="text-[10px] text-[var(--text-secondary)]"
                                        >{favoriteTimeframes.length}/4</span
                                    >
                                </div>
                                <input
                                    id="fav-timeframes"
                                    type="text"
                                    class="input-field p-2 rounded text-xs bg-[var(--bg-secondary)]"
                                    value={favoriteTimeframesInput}
                                    on:input={handleTimeframeInput}
                                    on:blur={handleTimeframeBlur}
                                    placeholder="e.g. 5m, 15m, 1h, 4h"
                                />
                                <div class="flex flex-wrap gap-1.5 mt-1">
                                    {#each favoriteTimeframes as tf}
                                        <span
                                            class="px-2 py-0.5 text-[10px] rounded bg-[var(--accent-color)] text-[var(--btn-accent-text)] font-bold"
                                        >
                                            {tf}
                                        </span>
                                    {/each}
                                </div>
                            </div>

                            <!-- RSI Settings -->
                            <div
                                class="p-3 border border-[var(--border-color)] rounded bg-[var(--bg-tertiary)] flex flex-col gap-3 relative overflow-hidden"
                            >
                                <div
                                    class="flex justify-between items-center border-b border-[var(--border-color)] pb-2 mb-1"
                                >
                                    <h4
                                        class="text-xs font-bold uppercase text-[var(--text-secondary)]"
                                    >
                                        RSI
                                    </h4>
                                    {#if !isPro}
                                        <span
                                            class="text-[9px] font-bold bg-[var(--accent-color)] text-[var(--btn-accent-text)] px-1.5 py-0.5 rounded"
                                            >PRO</span
                                        >
                                    {/if}
                                </div>

                                <div class="flex items-center justify-between">
                                    <span class="text-xs">Sync Timeframe</span>
                                    <Toggle
                                        bind:checked={syncRsiTimeframe}
                                        disabled={!isPro}
                                    />
                                </div>

                                {#if !syncRsiTimeframe}
                                    <div
                                        class="flex items-center justify-between"
                                    >
                                        <label
                                            for="rsi-timeframe"
                                            class="text-xs">Default TF</label
                                        >
                                        <select
                                            id="rsi-timeframe"
                                            bind:value={rsiSettings.defaultTimeframe}
                                            class="input-field p-1 rounded text-xs bg-[var(--bg-secondary)]"
                                            disabled={!isPro}
                                        >
                                            {#each availableTimeframes as tf}
                                                <option value={tf}>{tf}</option>
                                            {/each}
                                        </select>
                                    </div>
                                {/if}

                                <div
                                    class="grid grid-cols-2 gap-x-4 gap-y-2 mt-1"
                                >
                                    <div
                                        class="flex items-center justify-between"
                                    >
                                        <label for="rsi-length" class="text-xs"
                                            >Length</label
                                        >
                                        <input
                                            id="rsi-length"
                                            type="number"
                                            bind:value={rsiSettings.length}
                                            min="2"
                                            max="100"
                                            class="input-field rounded settings-number-input text-xs"
                                            disabled={!isPro}
                                            use:enhancedInput={{
                                                min: 2,
                                                max: 100,
                                            }}
                                        />
                                    </div>
                                    <div
                                        class="flex items-center justify-between"
                                    >
                                        <label for="rsi-source" class="text-xs"
                                            >Source</label
                                        >
                                        <select
                                            id="rsi-source"
                                            bind:value={rsiSettings.source}
                                            class="input-field p-1 rounded text-xs bg-[var(--bg-secondary)]"
                                            disabled={!isPro}
                                        >
                                            <option value="close">Close</option>
                                            <option value="open">Open</option>
                                            <option value="high">High</option>
                                            <option value="low">Low</option>
                                            <option value="hl2">HL/2</option>
                                            <option value="hlc3">HLC/3</option>
                                        </select>
                                    </div>
                                </div>

                                <div
                                    class="border-t border-[var(--border-color)] pt-3 mt-1"
                                >
                                    <div
                                        class="flex items-center justify-between mb-2"
                                    >
                                        <span class="text-xs"
                                            >Signal Line (MA)</span
                                        >
                                        <Toggle
                                            bind:checked={rsiSettings.showSignal}
                                            disabled={!isPro}
                                        />
                                    </div>

                                    {#if rsiSettings.showSignal}
                                        <div
                                            class="grid grid-cols-2 gap-x-4 gap-y-2"
                                        >
                                            <div
                                                class="flex items-center justify-between"
                                            >
                                                <label
                                                    for="rsi-signal-type"
                                                    class="text-xs">Type</label
                                                >
                                                <select
                                                    id="rsi-signal-type"
                                                    bind:value={rsiSettings.signalType}
                                                    class="input-field p-1 rounded text-xs bg-[var(--bg-secondary)]"
                                                    disabled={!isPro}
                                                >
                                                    <option value="sma"
                                                        >SMA</option
                                                    >
                                                    <option value="ema"
                                                        >EMA</option
                                                    >
                                                </select>
                                            </div>
                                            <div
                                                class="flex items-center justify-between"
                                            >
                                                <label
                                                    for="rsi-signal-length"
                                                    class="text-xs"
                                                    >Length</label
                                                >
                                                <input
                                                    id="rsi-signal-length"
                                                    type="number"
                                                    bind:value={rsiSettings.signalLength}
                                                    min="2"
                                                    max="100"
                                                    class="input-field rounded settings-number-input text-xs"
                                                    disabled={!isPro}
                                                    use:enhancedInput={{
                                                        min: 2,
                                                        max: 100,
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    {/if}
                                </div>

                                {#if !isPro}
                                    <div
                                        class="absolute inset-0 bg-black/20 backdrop-blur-[1px] rounded z-10"
                                    />
                                {/if}
                            </div>

                            <!-- MACD Settings -->
                            <div
                                class="p-3 border border-[var(--border-color)] rounded bg-[var(--bg-tertiary)] flex flex-col gap-3 relative overflow-hidden"
                            >
                                <div
                                    class="flex justify-between items-center border-b border-[var(--border-color)] pb-2 mb-1"
                                >
                                    <h4
                                        class="text-xs font-bold uppercase text-[var(--text-secondary)]"
                                    >
                                        MACD
                                    </h4>
                                    {#if !isPro}
                                        <span
                                            class="text-[9px] font-bold bg-[var(--accent-color)] text-[var(--btn-accent-text)] px-1.5 py-0.5 rounded"
                                            >PRO</span
                                        >
                                    {/if}
                                </div>

                                <div
                                    class="grid grid-cols-2 gap-x-4 gap-y-2 mt-1"
                                >
                                    <div
                                        class="flex items-center justify-between"
                                    >
                                        <label for="macd-fast" class="text-xs"
                                            >Fast Len</label
                                        >
                                        <input
                                            id="macd-fast"
                                            type="number"
                                            bind:value={macdSettings.fastLength}
                                            min="2"
                                            max="100"
                                            class="input-field rounded settings-number-input text-xs"
                                            disabled={!isPro}
                                            use:enhancedInput={{
                                                min: 2,
                                                max: 100,
                                            }}
                                        />
                                    </div>
                                    <div
                                        class="flex items-center justify-between"
                                    >
                                        <label for="macd-slow" class="text-xs"
                                            >Slow Len</label
                                        >
                                        <input
                                            id="macd-slow"
                                            type="number"
                                            bind:value={macdSettings.slowLength}
                                            min="2"
                                            max="100"
                                            class="input-field rounded settings-number-input text-xs"
                                            disabled={!isPro}
                                            use:enhancedInput={{
                                                min: 2,
                                                max: 100,
                                            }}
                                        />
                                    </div>
                                    <div
                                        class="flex items-center justify-between"
                                    >
                                        <label for="macd-signal" class="text-xs"
                                            >Signal Len</label
                                        >
                                        <input
                                            id="macd-signal"
                                            type="number"
                                            bind:value={macdSettings.signalLength}
                                            min="2"
                                            max="100"
                                            class="input-field rounded settings-number-input text-xs"
                                            disabled={!isPro}
                                            use:enhancedInput={{
                                                min: 2,
                                                max: 100,
                                            }}
                                        />
                                    </div>
                                    <div
                                        class="flex items-center justify-between"
                                    >
                                        <label for="macd-source" class="text-xs"
                                            >Source</label
                                        >
                                        <select
                                            id="macd-source"
                                            bind:value={macdSettings.source}
                                            class="input-field p-1 rounded text-xs bg-[var(--bg-secondary)]"
                                            disabled={!isPro}
                                        >
                                            <option value="close">Close</option>
                                            <option value="open">Open</option>
                                            <option value="high">High</option>
                                            <option value="low">Low</option>
                                            <option value="hl2">HL/2</option>
                                            <option value="hlc3">HLC/3</option>
                                        </select>
                                    </div>
                                </div>

                                <div
                                    class="grid grid-cols-2 gap-x-4 gap-y-2 mt-1 pt-2 border-t border-[var(--border-color)]"
                                >
                                    <div
                                        class="flex items-center justify-between"
                                    >
                                        <label
                                            for="macd-osc-type"
                                            class="text-[10px] text-[var(--text-secondary)]"
                                            >Osc MA</label
                                        >
                                        <select
                                            id="macd-osc-type"
                                            bind:value={macdSettings.oscillatorMaType}
                                            class="input-field p-1 rounded text-xs bg-[var(--bg-secondary)]"
                                            disabled={!isPro}
                                        >
                                            <option value="ema">EMA</option>
                                            <option value="sma">SMA</option>
                                        </select>
                                    </div>
                                    <div
                                        class="flex items-center justify-between"
                                    >
                                        <label
                                            for="macd-sig-type"
                                            class="text-[10px] text-[var(--text-secondary)]"
                                            >Sig MA</label
                                        >
                                        <select
                                            id="macd-sig-type"
                                            bind:value={macdSettings.signalMaType}
                                            class="input-field p-1 rounded text-xs bg-[var(--bg-secondary)]"
                                            disabled={!isPro}
                                        >
                                            <option value="ema">EMA</option>
                                            <option value="sma">SMA</option>
                                        </select>
                                    </div>
                                </div>

                                {#if !isPro}
                                    <div
                                        class="absolute inset-0 bg-black/20 backdrop-blur-[1px] rounded z-10"
                                    />
                                {/if}
                            </div>

                            <!-- EMA Settings -->
                            <div
                                class="p-3 border border-[var(--border-color)] rounded bg-[var(--bg-tertiary)] flex flex-col gap-3 relative overflow-hidden"
                            >
                                <div
                                    class="flex justify-between items-center border-b border-[var(--border-color)] pb-2 mb-1"
                                >
                                    <h4
                                        class="text-xs font-bold uppercase text-[var(--text-secondary)]"
                                    >
                                        EMA 1
                                    </h4>
                                    {#if !isPro}
                                        <span
                                            class="text-[9px] font-bold bg-[var(--accent-color)] text-[var(--btn-accent-text)] px-1.5 py-0.5 rounded"
                                            >PRO</span
                                        >
                                    {/if}
                                </div>

                                <div class="grid grid-cols-2 gap-x-4 gap-y-2">
                                    <div
                                        class="flex items-center justify-between"
                                    >
                                        <label for="ema1-len" class="text-xs"
                                            >Length</label
                                        >
                                        <input
                                            id="ema1-len"
                                            type="number"
                                            bind:value={emaSettings.ema1.length}
                                            min="2"
                                            max="500"
                                            class="input-field rounded settings-number-input text-xs"
                                            disabled={!isPro}
                                            use:enhancedInput={{
                                                min: 2,
                                                max: 500,
                                            }}
                                        />
                                    </div>
                                    <div
                                        class="flex items-center justify-between"
                                    >
                                        <label for="ema1-offset" class="text-xs"
                                            >Offset</label
                                        >
                                        <input
                                            id="ema1-offset"
                                            type="number"
                                            bind:value={emaSettings.ema1.offset}
                                            min="-100"
                                            max="100"
                                            class="input-field rounded settings-number-input text-xs"
                                            disabled={!isPro}
                                            use:enhancedInput={{
                                                min: -100,
                                                max: 100,
                                            }}
                                        />
                                    </div>
                                </div>

                                <div
                                    class="grid grid-cols-2 gap-x-4 gap-y-2 mt-1 pt-2 border-t border-[var(--border-color)]"
                                >
                                    <div
                                        class="flex items-center justify-between"
                                    >
                                        <label
                                            for="ema1-smth-type"
                                            class="text-[10px] text-[var(--text-secondary)]"
                                            >Smoothing</label
                                        >
                                        <select
                                            id="ema1-smth-type"
                                            bind:value={emaSettings.ema1
                                                .smoothingType}
                                            class="input-field p-1 rounded text-xs bg-[var(--bg-secondary)]"
                                            disabled={!isPro}
                                        >
                                            <option value="none">None</option>
                                            <option value="sma">SMA</option>
                                            <option value="ema">EMA</option>
                                            <option value="smma">SMMA</option>
                                            <option value="wma">WMA</option>
                                            <option value="vwma">VWMA</option>
                                        </select>
                                    </div>
                                    <div
                                        class="flex items-center justify-between"
                                    >
                                        <label
                                            for="ema1-smth-len"
                                            class="text-[10px] text-[var(--text-secondary)]"
                                            >Smth Len</label
                                        >
                                        <input
                                            id="ema1-smth-len"
                                            type="number"
                                            bind:value={emaSettings.ema1
                                                .smoothingLength}
                                            min="1"
                                            max="100"
                                            class="input-field rounded settings-number-input text-xs"
                                            disabled={!isPro ||
                                                emaSettings.ema1
                                                    .smoothingType === "none"}
                                            use:enhancedInput={{
                                                min: 1,
                                                max: 100,
                                            }}
                                        />
                                    </div>
                                </div>

                                {#if !isPro}
                                    <div
                                        class="absolute inset-0 bg-black/20 backdrop-blur-[1px] rounded z-10"
                                    />
                                {/if}
                            </div>

                            <!-- EMA 2 -->
                            <div
                                class="p-3 border border-[var(--border-color)] rounded bg-[var(--bg-tertiary)] flex flex-col gap-3 relative overflow-hidden"
                            >
                                <div
                                    class="flex justify-between items-center border-b border-[var(--border-color)] pb-2 mb-1"
                                >
                                    <h4
                                        class="text-xs font-bold uppercase text-[var(--text-secondary)]"
                                    >
                                        EMA 2
                                    </h4>
                                    {#if !isPro}
                                        <span
                                            class="text-[9px] font-bold bg-[var(--accent-color)] text-[var(--btn-accent-text)] px-1.5 py-0.5 rounded"
                                            >PRO</span
                                        >
                                    {/if}
                                </div>

                                <div class="grid grid-cols-2 gap-x-4 gap-y-2">
                                    <div
                                        class="flex items-center justify-between"
                                    >
                                        <label for="ema2-len" class="text-xs"
                                            >Length</label
                                        >
                                        <input
                                            id="ema2-len"
                                            type="number"
                                            bind:value={emaSettings.ema2.length}
                                            min="2"
                                            max="500"
                                            class="input-field rounded settings-number-input text-xs"
                                            disabled={!isPro}
                                            use:enhancedInput={{
                                                min: 2,
                                                max: 500,
                                            }}
                                        />
                                    </div>
                                    <div
                                        class="flex items-center justify-between"
                                    >
                                        <label for="ema2-offset" class="text-xs"
                                            >Offset</label
                                        >
                                        <input
                                            id="ema2-offset"
                                            type="number"
                                            bind:value={emaSettings.ema2.offset}
                                            min="-100"
                                            max="100"
                                            class="input-field rounded settings-number-input text-xs"
                                            disabled={!isPro}
                                            use:enhancedInput={{
                                                min: -100,
                                                max: 100,
                                            }}
                                        />
                                    </div>
                                </div>

                                <div
                                    class="grid grid-cols-2 gap-x-4 gap-y-2 mt-1 pt-2 border-t border-[var(--border-color)]"
                                >
                                    <div
                                        class="flex items-center justify-between"
                                    >
                                        <label
                                            for="ema2-smth-type"
                                            class="text-[10px] text-[var(--text-secondary)]"
                                            >Smoothing</label
                                        >
                                        <select
                                            id="ema2-smth-type"
                                            bind:value={emaSettings.ema2
                                                .smoothingType}
                                            class="input-field p-1 rounded text-xs bg-[var(--bg-secondary)]"
                                            disabled={!isPro}
                                        >
                                            <option value="none">None</option>
                                            <option value="sma">SMA</option>
                                            <option value="ema">EMA</option>
                                            <option value="smma">SMMA</option>
                                            <option value="wma">WMA</option>
                                            <option value="vwma">VWMA</option>
                                        </select>
                                    </div>
                                    <div
                                        class="flex items-center justify-between"
                                    >
                                        <label
                                            for="ema2-smth-len"
                                            class="text-[10px] text-[var(--text-secondary)]"
                                            >Smth Len</label
                                        >
                                        <input
                                            id="ema2-smth-len"
                                            type="number"
                                            bind:value={emaSettings.ema2
                                                .smoothingLength}
                                            min="1"
                                            max="100"
                                            class="input-field rounded settings-number-input text-xs"
                                            disabled={!isPro ||
                                                emaSettings.ema2
                                                    .smoothingType === "none"}
                                            use:enhancedInput={{
                                                min: 1,
                                                max: 100,
                                            }}
                                        />
                                    </div>
                                </div>

                                {#if !isPro}
                                    <div
                                        class="absolute inset-0 bg-black/20 backdrop-blur-[1px] rounded z-10"
                                    />
                                {/if}
                            </div>

                            <!-- EMA 3 -->
                            <div
                                class="p-3 border border-[var(--border-color)] rounded bg-[var(--bg-tertiary)] flex flex-col gap-3 relative overflow-hidden"
                            >
                                <div
                                    class="flex justify-between items-center border-b border-[var(--border-color)] pb-2 mb-1"
                                >
                                    <h4
                                        class="text-xs font-bold uppercase text-[var(--text-secondary)]"
                                    >
                                        EMA 3
                                    </h4>
                                    {#if !isPro}
                                        <span
                                            class="text-[9px] font-bold bg-[var(--accent-color)] text-[var(--btn-accent-text)] px-1.5 py-0.5 rounded"
                                            >PRO</span
                                        >
                                    {/if}
                                </div>

                                <div class="grid grid-cols-2 gap-x-4 gap-y-2">
                                    <div
                                        class="flex items-center justify-between"
                                    >
                                        <label for="ema3-len" class="text-xs"
                                            >Length</label
                                        >
                                        <input
                                            id="ema3-len"
                                            type="number"
                                            bind:value={emaSettings.ema3.length}
                                            min="2"
                                            max="500"
                                            class="input-field rounded settings-number-input text-xs"
                                            disabled={!isPro}
                                            use:enhancedInput={{
                                                min: 2,
                                                max: 500,
                                            }}
                                        />
                                    </div>
                                    <div
                                        class="flex items-center justify-between"
                                    >
                                        <label for="ema3-offset" class="text-xs"
                                            >Offset</label
                                        >
                                        <input
                                            id="ema3-offset"
                                            type="number"
                                            bind:value={emaSettings.ema3.offset}
                                            min="-100"
                                            max="100"
                                            class="input-field rounded settings-number-input text-xs"
                                            disabled={!isPro}
                                            use:enhancedInput={{
                                                min: -100,
                                                max: 100,
                                            }}
                                        />
                                    </div>
                                </div>

                                <div
                                    class="grid grid-cols-2 gap-x-4 gap-y-2 mt-1 pt-2 border-t border-[var(--border-color)]"
                                >
                                    <div
                                        class="flex items-center justify-between"
                                    >
                                        <label
                                            for="ema3-smth-type"
                                            class="text-[10px] text-[var(--text-secondary)]"
                                            >Smoothing</label
                                        >
                                        <select
                                            id="ema3-smth-type"
                                            bind:value={emaSettings.ema3
                                                .smoothingType}
                                            class="input-field p-1 rounded text-xs bg-[var(--bg-secondary)]"
                                            disabled={!isPro}
                                        >
                                            <option value="none">None</option>
                                            <option value="sma">SMA</option>
                                            <option value="ema">EMA</option>
                                            <option value="smma">SMMA</option>
                                            <option value="wma">WMA</option>
                                            <option value="vwma">VWMA</option>
                                        </select>
                                    </div>
                                    <div
                                        class="flex items-center justify-between"
                                    >
                                        <label
                                            for="ema3-smth-len"
                                            class="text-[10px] text-[var(--text-secondary)]"
                                            >Smth Len</label
                                        >
                                        <input
                                            id="ema3-smth-len"
                                            type="number"
                                            bind:value={emaSettings.ema3
                                                .smoothingLength}
                                            min="1"
                                            max="100"
                                            class="input-field rounded settings-number-input text-xs"
                                            disabled={!isPro ||
                                                emaSettings.ema3
                                                    .smoothingType === "none"}
                                            use:enhancedInput={{
                                                min: 1,
                                                max: 100,
                                            }}
                                        />
                                    </div>
                                </div>

                                {#if !isPro}
                                    <div
                                        class="absolute inset-0 bg-black/20 backdrop-blur-[1px] rounded z-10"
                                    />
                                {/if}
                            </div>

                            <!-- Source selection for all EMAs -->
                            <div
                                class="p-3 border border-[var(--border-color)] rounded bg-[var(--bg-tertiary)] flex items-center justify-between"
                            >
                                <label for="ema-source" class="text-xs"
                                    >Common Source</label
                                >
                                <select
                                    id="ema-source"
                                    bind:value={emaSettings.source}
                                    class="input-field p-1 rounded text-xs bg-[var(--bg-secondary)]"
                                    disabled={!isPro}
                                >
                                    <option value="close">Close</option>
                                    <option value="open">Open</option>
                                    <option value="high">High</option>
                                    <option value="low">Low</option>
                                    <option value="hl2">HL/2</option>
                                    <option value="hlc3">HLC/3</option>
                                </select>
                            </div>
                        </div>

                        <!-- Right Column -->
                        <div class="flex flex-col gap-4">
                            <!-- Stochastic Settings -->
                            <div
                                class="p-3 border border-[var(--border-color)] rounded bg-[var(--bg-tertiary)] flex flex-col gap-3 relative overflow-hidden"
                            >
                                <div
                                    class="flex justify-between items-center border-b border-[var(--border-color)] pb-2 mb-1"
                                >
                                    <h4
                                        class="text-xs font-bold uppercase text-[var(--text-secondary)]"
                                    >
                                        Stochastic
                                    </h4>
                                    {#if !isPro}
                                        <span
                                            class="text-[9px] font-bold bg-[var(--accent-color)] text-[var(--btn-accent-text)] px-1.5 py-0.5 rounded"
                                            >PRO</span
                                        >
                                    {/if}
                                </div>

                                <div class="grid grid-cols-3 gap-2 mt-1">
                                    <div
                                        class="flex flex-col gap-1 items-center"
                                    >
                                        <label
                                            for="stoch-k"
                                            class="text-[10px] text-[var(--text-secondary)]"
                                            >%K Len</label
                                        >
                                        <input
                                            id="stoch-k"
                                            type="number"
                                            bind:value={stochSettings.kPeriod}
                                            min="2"
                                            max="100"
                                            class="input-field rounded settings-number-input text-xs mx-auto"
                                            disabled={!isPro}
                                            use:enhancedInput={{
                                                min: 2,
                                                max: 100,
                                            }}
                                        />
                                    </div>
                                    <div
                                        class="flex flex-col gap-1 items-center"
                                    >
                                        <label
                                            for="stoch-k-smooth"
                                            class="text-[10px] text-[var(--text-secondary)]"
                                            >%K Smth</label
                                        >
                                        <input
                                            id="stoch-k-smooth"
                                            type="number"
                                            bind:value={stochSettings.kSmoothing}
                                            min="1"
                                            max="50"
                                            class="input-field rounded settings-number-input text-xs mx-auto"
                                            disabled={!isPro}
                                            use:enhancedInput={{
                                                min: 1,
                                                max: 50,
                                            }}
                                        />
                                    </div>
                                    <div
                                        class="flex flex-col gap-1 items-center"
                                    >
                                        <label
                                            for="stoch-d-smooth"
                                            class="text-[10px] text-[var(--text-secondary)]"
                                            >%D Smth</label
                                        >
                                        <input
                                            id="stoch-d-smooth"
                                            type="number"
                                            bind:value={stochSettings.dPeriod}
                                            min="2"
                                            max="100"
                                            class="input-field rounded settings-number-input text-xs mx-auto"
                                            disabled={!isPro}
                                            use:enhancedInput={{
                                                min: 2,
                                                max: 100,
                                            }}
                                        />
                                    </div>
                                </div>

                                {#if !isPro}
                                    <div
                                        class="absolute inset-0 bg-black/20 backdrop-blur-[1px] rounded z-10"
                                    />
                                {/if}
                            </div>

                            <!-- CCI Settings -->
                            <div
                                class="p-3 border border-[var(--border-color)] rounded bg-[var(--bg-tertiary)] flex flex-col gap-3 relative overflow-hidden"
                            >
                                <div
                                    class="flex justify-between items-center border-b border-[var(--border-color)] pb-2 mb-1"
                                >
                                    <h4
                                        class="text-xs font-bold uppercase text-[var(--text-secondary)]"
                                    >
                                        CCI
                                    </h4>
                                    {#if !isPro}
                                        <span
                                            class="text-[9px] font-bold bg-[var(--accent-color)] text-[var(--btn-accent-text)] px-1.5 py-0.5 rounded"
                                            >PRO</span
                                        >
                                    {/if}
                                </div>

                                <div
                                    class="grid grid-cols-2 gap-x-4 gap-y-2 mt-1"
                                >
                                    <div
                                        class="flex items-center justify-between"
                                    >
                                        <label for="cci-length" class="text-xs"
                                            >Length</label
                                        >
                                        <input
                                            id="cci-length"
                                            type="number"
                                            bind:value={cciSettings.length}
                                            min="2"
                                            max="100"
                                            class="input-field rounded settings-number-input text-xs"
                                            disabled={!isPro}
                                            use:enhancedInput={{
                                                min: 2,
                                                max: 100,
                                            }}
                                        />
                                    </div>
                                    <div
                                        class="flex items-center justify-between"
                                    >
                                        <label for="cci-source" class="text-xs"
                                            >Source</label
                                        >
                                        <select
                                            id="cci-source"
                                            bind:value={cciSettings.source}
                                            class="input-field p-1 rounded text-xs bg-[var(--bg-secondary)]"
                                            disabled={!isPro}
                                        >
                                            <option value="close">Close</option>
                                            <option value="open">Open</option>
                                            <option value="high">High</option>
                                            <option value="low">Low</option>
                                            <option value="hl2">HL/2</option>
                                            <option value="hlc3">HLC/3</option>
                                        </select>
                                    </div>
                                </div>

                                <div
                                    class="grid grid-cols-2 gap-x-4 gap-y-2 mt-1 pt-2 border-t border-[var(--border-color)]"
                                >
                                    <div
                                        class="flex items-center justify-between"
                                    >
                                        <label
                                            for="cci-smooth-type"
                                            class="text-[10px] text-[var(--text-secondary)]"
                                            >Smth Type</label
                                        >
                                        <select
                                            id="cci-smooth-type"
                                            bind:value={cciSettings.smoothingType}
                                            class="input-field p-1 rounded text-xs bg-[var(--bg-secondary)]"
                                            disabled={!isPro}
                                        >
                                            <option value="sma">SMA</option>
                                            <option value="ema">EMA</option>
                                        </select>
                                    </div>
                                    <div
                                        class="flex items-center justify-between"
                                    >
                                        <label
                                            for="cci-smooth-len"
                                            class="text-[10px] text-[var(--text-secondary)]"
                                            >Smth Len</label
                                        >
                                        <input
                                            id="cci-smooth-len"
                                            type="number"
                                            bind:value={cciSettings.smoothingLength}
                                            min="1"
                                            max="100"
                                            class="input-field rounded settings-number-input text-xs"
                                            disabled={!isPro}
                                            use:enhancedInput={{
                                                min: 1,
                                                max: 100,
                                            }}
                                        />
                                    </div>
                                </div>

                                {#if !isPro}
                                    <div
                                        class="absolute inset-0 bg-black/20 backdrop-blur-[1px] rounded z-10"
                                    />
                                {/if}
                            </div>

                            <!-- ADX Settings -->
                            <div
                                class="p-3 border border-[var(--border-color)] rounded bg-[var(--bg-tertiary)] flex flex-col gap-3 relative overflow-hidden"
                            >
                                <div
                                    class="flex justify-between items-center border-b border-[var(--border-color)] pb-2 mb-1"
                                >
                                    <h4
                                        class="text-xs font-bold uppercase text-[var(--text-secondary)]"
                                    >
                                        ADX
                                    </h4>
                                    {#if !isPro}
                                        <span
                                            class="text-[9px] font-bold bg-[var(--accent-color)] text-[var(--btn-accent-text)] px-1.5 py-0.5 rounded"
                                            >PRO</span
                                        >
                                    {/if}
                                </div>

                                <div
                                    class="grid grid-cols-2 gap-x-4 gap-y-2 mt-1"
                                >
                                    <div
                                        class="flex items-center justify-between"
                                    >
                                        <label for="adx-smooth" class="text-xs"
                                            >Smoothing</label
                                        >
                                        <input
                                            id="adx-smooth"
                                            type="number"
                                            bind:value={adxSettings.adxSmoothing}
                                            min="2"
                                            max="100"
                                            class="input-field rounded settings-number-input text-xs"
                                            disabled={!isPro}
                                            use:enhancedInput={{
                                                min: 2,
                                                max: 100,
                                            }}
                                        />
                                    </div>
                                    <div
                                        class="flex items-center justify-between"
                                    >
                                        <label for="adx-di" class="text-xs"
                                            >DI Len</label
                                        >
                                        <input
                                            id="adx-di"
                                            type="number"
                                            bind:value={adxSettings.diLength}
                                            min="2"
                                            max="100"
                                            class="input-field rounded settings-number-input text-xs"
                                            disabled={!isPro}
                                            use:enhancedInput={{
                                                min: 2,
                                                max: 100,
                                            }}
                                        />
                                    </div>
                                </div>

                                {#if !isPro}
                                    <div
                                        class="absolute inset-0 bg-black/20 backdrop-blur-[1px] rounded z-10"
                                    />
                                {/if}
                            </div>

                            <!-- Awesome Oscillator Settings -->
                            <div
                                class="p-3 border border-[var(--border-color)] rounded bg-[var(--bg-tertiary)] flex flex-col gap-3 relative overflow-hidden"
                            >
                                <div
                                    class="flex justify-between items-center border-b border-[var(--border-color)] pb-2 mb-1"
                                >
                                    <h4
                                        class="text-xs font-bold uppercase text-[var(--text-secondary)]"
                                    >
                                        AO
                                    </h4>
                                    {#if !isPro}
                                        <span
                                            class="text-[9px] font-bold bg-[var(--accent-color)] text-[var(--btn-accent-text)] px-1.5 py-0.5 rounded"
                                            >PRO</span
                                        >
                                    {/if}
                                </div>

                                <div
                                    class="grid grid-cols-2 gap-x-4 gap-y-2 mt-1"
                                >
                                    <div
                                        class="flex items-center justify-between"
                                    >
                                        <label for="ao-fast" class="text-xs"
                                            >Fast Period</label
                                        >
                                        <input
                                            id="ao-fast"
                                            type="number"
                                            bind:value={aoSettings.fastLength}
                                            min="1"
                                            max="100"
                                            class="input-field rounded settings-number-input text-xs"
                                            disabled={!isPro}
                                            use:enhancedInput={{
                                                min: 1,
                                                max: 100,
                                            }}
                                        />
                                    </div>
                                    <div
                                        class="flex items-center justify-between"
                                    >
                                        <label for="ao-slow" class="text-xs"
                                            >Slow Period</label
                                        >
                                        <input
                                            id="ao-slow"
                                            type="number"
                                            bind:value={aoSettings.slowLength}
                                            min="2"
                                            max="100"
                                            class="input-field rounded settings-number-input text-xs"
                                            disabled={!isPro}
                                            use:enhancedInput={{
                                                min: 2,
                                                max: 100,
                                            }}
                                        />
                                    </div>
                                </div>

                                {#if !isPro}
                                    <div
                                        class="absolute inset-0 bg-black/20 backdrop-blur-[1px] rounded z-10"
                                    />
                                {/if}
                            </div>

                            <!-- Momentum Settings -->
                            <div
                                class="p-3 border border-[var(--border-color)] rounded bg-[var(--bg-tertiary)] flex flex-col gap-3 relative overflow-hidden"
                            >
                                <div
                                    class="flex justify-between items-center border-b border-[var(--border-color)] pb-2 mb-1"
                                >
                                    <h4
                                        class="text-xs font-bold uppercase text-[var(--text-secondary)]"
                                    >
                                        Momentum
                                    </h4>
                                    {#if !isPro}
                                        <span
                                            class="text-[9px] font-bold bg-[var(--accent-color)] text-[var(--btn-accent-text)] px-1.5 py-0.5 rounded"
                                            >PRO</span
                                        >
                                    {/if}
                                </div>

                                <div
                                    class="grid grid-cols-2 gap-x-4 gap-y-2 mt-1"
                                >
                                    <div
                                        class="flex items-center justify-between"
                                    >
                                        <label for="mom-length" class="text-xs"
                                            >Length</label
                                        >
                                        <input
                                            id="mom-length"
                                            type="number"
                                            bind:value={momentumSettings.length}
                                            min="1"
                                            max="100"
                                            class="input-field rounded settings-number-input text-xs"
                                            disabled={!isPro}
                                            use:enhancedInput={{
                                                min: 1,
                                                max: 100,
                                            }}
                                        />
                                    </div>
                                    <div
                                        class="flex items-center justify-between"
                                    >
                                        <label for="mom-source" class="text-xs"
                                            >Source</label
                                        >
                                        <select
                                            id="mom-source"
                                            bind:value={momentumSettings.source}
                                            class="input-field p-1 rounded text-xs bg-[var(--bg-secondary)]"
                                            disabled={!isPro}
                                        >
                                            <option value="close">Close</option>
                                            <option value="open">Open</option>
                                            <option value="high">High</option>
                                            <option value="low">Low</option>
                                            <option value="hl2">HL/2</option>
                                            <option value="hlc3">HLC/3</option>
                                        </select>
                                    </div>
                                </div>

                                {#if !isPro}
                                    <div
                                        class="absolute inset-0 bg-black/20 backdrop-blur-[1px] rounded z-10"
                                    />
                                {/if}
                            </div>

                            <!-- Pivots Settings -->
                            <div
                                class="p-3 border border-[var(--border-color)] rounded bg-[var(--bg-tertiary)] flex flex-col gap-3 relative overflow-hidden"
                            >
                                <div
                                    class="flex justify-between items-center border-b border-[var(--border-color)] pb-2 mb-1"
                                >
                                    <h4
                                        class="text-xs font-bold uppercase text-[var(--text-secondary)]"
                                    >
                                        Pivots
                                    </h4>
                                    {#if !isPro}
                                        <span
                                            class="text-[9px] font-bold bg-[var(--accent-color)] text-[var(--btn-accent-text)] px-1.5 py-0.5 rounded"
                                            >PRO</span
                                        >
                                    {/if}
                                </div>

                                <div
                                    class="grid grid-cols-2 gap-x-4 gap-y-2 mt-1"
                                >
                                    <div
                                        class="flex items-center justify-between"
                                    >
                                        <label for="pivot-type" class="text-xs"
                                            >Type</label
                                        >
                                        <select
                                            id="pivot-type"
                                            bind:value={pivotSettings.type}
                                            class="input-field p-1 rounded text-xs bg-[var(--bg-secondary)]"
                                            disabled={!isPro}
                                        >
                                            <option value="classic"
                                                >Classic</option
                                            >
                                            <option value="woodie"
                                                >Woodie</option
                                            >
                                            <option value="camarilla"
                                                >Camarilla</option
                                            >
                                            <option value="fibonacci"
                                                >Fibonacci</option
                                            >
                                        </select>
                                    </div>
                                    <div
                                        class="flex items-center justify-between"
                                    >
                                        <label for="pivot-view" class="text-xs"
                                            >View</label
                                        >
                                        <select
                                            id="pivot-view"
                                            bind:value={pivotSettings.viewMode}
                                            class="input-field p-1 rounded text-xs bg-[var(--bg-secondary)]"
                                            disabled={!isPro}
                                        >
                                            <option value="integrated"
                                                >Int</option
                                            >
                                            <option value="separated"
                                                >Sep</option
                                            >
                                            <option value="abstract"
                                                >Gauge</option
                                            >
                                        </select>
                                    </div>
                                </div>

                                {#if !isPro}
                                    <div
                                        class="absolute inset-0 bg-black/20 backdrop-blur-[1px] rounded z-10"
                                    />
                                {/if}
                            </div>
                        </div>
                    </div>
                </div>
            {:else if activeTab === "system"}
                <!-- ... [System tab content same as read file] ... -->
                <div
                    class="flex flex-col gap-4"
                    role="tabpanel"
                    id="tab-system"
                >
                    <div
                        class="p-3 border border-[var(--border-color)] rounded bg-[var(--bg-tertiary)] flex flex-col gap-2"
                    >
                        <h4 class="text-sm font-bold">CachyLog Debug</h4>
                        <p class="text-xs text-[var(--text-secondary)] mb-2">
                            Trigger a test log on the server to verify browser
                            console logging (CL: prefix).
                        </p>
                        <button
                            class="btn btn-secondary text-sm w-full"
                            on:click={() =>
                                fetch("/api/test-log", { method: "POST" })}
                        >
                            Trigger Server Log
                        </button>
                    </div>
                    <div
                        class="p-3 border border-[var(--border-color)] rounded bg-[var(--bg-tertiary)] flex flex-col gap-2"
                    >
                        <h4 class="text-sm font-bold">
                            {$_("settings.backup")}
                        </h4>
                        <p class="text-xs text-[var(--text-secondary)] mb-2">
                            Save all your settings, presets, and journal entries
                            to a file.
                        </p>
                        <button
                            class="btn btn-secondary text-sm w-full"
                            on:click={handleBackup}
                            disabled={!isPro}
                        >
                            {$_("app.backupButtonAriaLabel")}
                            {!isPro ? "(Pro only)" : ""}
                        </button>
                    </div>
                    <div
                        class="p-3 border border-[var(--border-color)] rounded bg-[var(--bg-tertiary)] flex flex-col gap-2"
                    >
                        <h4 class="text-sm font-bold">
                            {$_("settings.restore")}
                        </h4>
                        <p class="text-xs text-[var(--text-secondary)] mb-2">
                            Overwrite current data with a backup file.
                        </p>
                        <label
                            class="btn btn-secondary text-sm w-full cursor-pointer text-center"
                        >
                            {$_("app.restoreButtonAriaLabel")}
                            <input
                                id="restore-file"
                                name="restoreFile"
                                type="file"
                                accept=".json"
                                class="hidden"
                                on:change={handleRestore}
                            />
                        </label>
                    </div>
                    <div
                        class="mt-4 pt-4 border-t border-[var(--border-color)]"
                    >
                        <button
                            class="text-xs text-[var(--danger-color)] hover:underline"
                            on:click={handleReset}
                        >
                            {$_("settings.reset")}
                        </button>
                    </div>
                </div>
            {/if}
        </div>
    </div>

    <!-- Footer Actions -->
    <div
        class="flex justify-end gap-3 pt-4 border-t border-[var(--border-color)] shrink-0 bg-[var(--bg-secondary)] px-4 pb-4"
    >
        <button
            class="px-6 py-2 text-sm font-bold bg-[var(--accent-color)] text-[var(--btn-accent-text)] rounded hover:opacity-90 transition-opacity"
            on:click={close}
        >
            {$_("common.ok") || "OK"}
        </button>
    </div>
</ModalFrame>
