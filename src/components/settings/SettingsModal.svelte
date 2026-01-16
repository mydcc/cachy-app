<script lang="ts">
  import { onMount, onDestroy } from "svelte";

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

  import HotkeySettings from "./HotkeySettings.svelte";
  import Toggle from "../shared/Toggle.svelte";
  import { enhancedInput } from "../../lib/actions/inputEnhancements";
  import {
    HOTKEY_ACTIONS,
    MODE1_MAP,
    MODE2_MAP,
    MODE3_MAP,
  } from "../../services/hotkeyService";

  // Tab Components
  import SystemTab from "./tabs/SystemTab.svelte";
  import GeneralTab from "./tabs/GeneralTab.svelte";
  import ApiTab from "./tabs/ApiTab.svelte";
  import AiTab from "./tabs/AiTab.svelte";
  import BehaviorTab from "./tabs/BehaviorTab.svelte";
  import HotkeysTab from "./tabs/HotkeysTab.svelte";
  import SidebarTab from "./tabs/SidebarTab.svelte";
  import IndicatorsTab from "./tabs/IndicatorsTab.svelte";

  // Local state for the form inputs
  let apiProvider: "bitunix" | "binance" = $state("bitunix");
  let marketDataInterval: number = $state(10);
  let autoUpdatePriceInput: boolean = $state(false);
  let autoFetchBalance: boolean = $state(false);
  let showSidebars: boolean = $state(true);
  let showTechnicals: boolean = $state(true);
  let showIndicatorParams: boolean = $state(false);
  let hideUnfilledOrders: boolean = $state(false);
  let isPro: boolean = $state(false);
  let feePreference: "maker" | "taker" = $state("taker");
  let hotkeyMode: HotkeyMode = $state("mode1");
  let positionViewMode: PositionViewMode = $state("detailed");
  let showSpinButtons: boolean | "hover" = $state("hover");
  let syncFavorites: boolean = $state(true);
  let confirmTradeDeletion: boolean = $state(true);
  let confirmBulkDeletion: boolean = $state(true);
  let debugMode: boolean = $state(false);
  let enableGlassmorphism: boolean = $state(true);

  // Timeframe & RSI Sync
  let favoriteTimeframes: string[] = $state([]);
  let syncRsiTimeframe: boolean = $state(true);

  // Indicator Settings
  let historyLimit = $state(2000);
  let precision = $state(4);
  let rsiSettings = $state({ ...$indicatorStore.rsi });
  let macdSettings = $state({ ...$indicatorStore.macd });
  let stochSettings = $state({ ...$indicatorStore.stochastic });
  let cciSettings = $state({ ...$indicatorStore.cci });
  let adxSettings = $state({ ...$indicatorStore.adx });
  let aoSettings = $state({ ...$indicatorStore.ao });
  let momentumSettings = $state({ ...$indicatorStore.momentum });
  let emaSettings = $state({ ...$indicatorStore.ema });
  let pivotSettings = $state({ ...$indicatorStore.pivots });

  // Side Panel Settings
  let enableSidePanel: boolean = $state(false);
  let sidePanelMode: "chat" | "notes" | "ai" = $state("notes");
  let sidePanelLayout: SidePanelLayout = $state("standard");

  // AI Settings
  let aiProviderState: AiProvider = $state("gemini");
  let openaiApiKey: string = $state("");
  let openaiModel: string = $state("gpt-4o");
  let geminiApiKey: string = $state("");
  let geminiModel: string = $state("gemini-2.0-flash-exp");
  let anthropicApiKey: string = $state("");
  let anthropicModel: string = $state("claude-3-5-sonnet-20240620");

  // Separate API keys per provider
  let bitunixKeys: ApiKeys = $state({ key: "", secret: "" });
  let binanceKeys: ApiKeys = $state({ key: "", secret: "" });

  // ImgBB
  let imgbbApiKey: string = $state("");
  let imgbbExpiration: number = $state(604800);

  // UI state
  let currentTheme: string = $state("dark");
  let currentLanguage: string = $state("en");
  let forceEnglishTechnicalTerms: boolean = $state(false);

  // Track active tab
  let activeTab:
    | "general"
    | "api"
    | "ai"
    | "behavior"
    | "system"
    | "sidebar"
    | "indicators"
    | "hotkeys" = $state("general");
  let isInitialized = $state(false);

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
  $effect(() => {
    if ($uiStore.showSettingsModal) {
      if (!isInitialized) {
        apiProvider = $settingsStore.apiProvider;
        marketDataInterval = $settingsStore.marketDataInterval;
        autoUpdatePriceInput = $settingsStore.autoUpdatePriceInput;
        autoFetchBalance = $settingsStore.autoFetchBalance;
        showSidebars = $settingsStore.showSidebars;
        showTechnicals = $settingsStore.showTechnicals ?? true;
        showIndicatorParams = $settingsStore.showIndicatorParams;
        hideUnfilledOrders = $settingsStore.hideUnfilledOrders;
        positionViewMode = $settingsStore.positionViewMode || "detailed";
        feePreference = $settingsStore.feePreference;
        hotkeyMode = $settingsStore.hotkeyMode;
        enableSidePanel = $settingsStore.enableSidePanel;
        sidePanelMode = $settingsStore.sidePanelMode;
        sidePanelLayout = $settingsStore.sidePanelLayout || "compact"; // Changed from "standard"
        isPro = $settingsStore.isPro;
        showSpinButtons = $settingsStore.showSpinButtons || "hover";
        syncFavorites = $settingsStore.syncFavorites; // Added
        confirmTradeDeletion = $settingsStore.confirmTradeDeletion; // Added
        confirmBulkDeletion = $settingsStore.confirmBulkDeletion; // Added
        debugMode = $settingsStore.debugMode; // Added
        enableGlassmorphism = $settingsStore.enableGlassmorphism ?? true;

        aiProviderState = $settingsStore.aiProvider || "openai"; // Changed from "gemini"
        openaiApiKey = $settingsStore.openaiApiKey || "";
        openaiModel = $settingsStore.openaiModel || "gpt-4o";
        geminiApiKey = $settingsStore.geminiApiKey || "";
        geminiModel = $settingsStore.geminiModel || "gemini-2.0-flash";
        anthropicApiKey = $settingsStore.anthropicApiKey || "";
        anthropicModel =
          $settingsStore.anthropicModel || "claude-3-5-sonnet-20240620";

        favoriteTimeframes = [...$settingsStore.favoriteTimeframes];
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
        imgbbExpiration = $settingsStore.imgbbExpiration || 604800; // Updated default

        currentTheme = $uiStore.currentTheme;
        currentLanguage = $locale || "en";
        forceEnglishTechnicalTerms = $settingsStore.forceEnglishTechnicalTerms;

        isInitialized = true;
      }
    } else {
      isInitialized = false;
    }
  });

  // Reactive update for settings (Immediate Save)
  $effect(() => {
    if (isInitialized) {
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
        syncFavorites, // Added
        confirmTradeDeletion, // Added
        confirmBulkDeletion, // Added
        forceEnglishTechnicalTerms,
        debugMode, // Added
        enableGlassmorphism,
        apiKeys: {
          bitunix: bitunixKeys,
          binance: binanceKeys,
        },
      }));

      indicatorStore.update((s) => ({
        ...s,
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
      }));
    }
  });

  // Immediate Theme Update
  $effect(() => {
    if (isInitialized && currentTheme !== $uiStore.currentTheme) {
      uiStore.setTheme(currentTheme);
    }
  });

  // Immediate Language Update
  // Immediate Language Update
  $effect(() => {
    if (isInitialized && currentLanguage !== $locale) {
      setLocale(currentLanguage);
    }
  });

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
  let activeDescriptions = $derived(getHotkeyDescriptions(hotkeyMode));
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
        class="px-4 py-3 text-sm font-medium transition-colors text-left focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:ring-offset-2 focus:ring-offset-[var(--bg-secondary)] whitespace-nowrap {activeTab ===
        'general'
          ? 'bg-[var(--bg-tertiary)] text-[var(--accent-color)] border-b-2 md:border-b-0 md:border-l-2 border-[var(--accent-color)]'
          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] border-b-2 md:border-b-0 md:border-l-2 border-transparent'}"
        onclick={(e) => {
          e.stopPropagation();
          activeTab = "general";
        }}
        role="tab"
        aria-selected={activeTab === "general"}
      >
        {$_("settings.tabs.general")}
      </button>
      <button
        class="px-4 py-3 text-sm font-medium transition-colors text-left focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:ring-offset-2 focus:ring-offset-[var(--bg-secondary)] whitespace-nowrap {activeTab ===
        'api'
          ? 'bg-[var(--bg-tertiary)] text-[var(--accent-color)] border-b-2 md:border-b-0 md:border-l-2 border-[var(--accent-color)]'
          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] border-b-2 md:border-b-0 md:border-l-2 border-transparent'}"
        onclick={(e) => {
          e.stopPropagation();
          activeTab = "api";
        }}
        role="tab"
        aria-selected={activeTab === "api"}
      >
        {$_("settings.tabs.api")}
      </button>
      <button
        class="px-4 py-3 text-sm font-medium transition-colors text-left focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:ring-offset-2 focus:ring-offset-[var(--bg-secondary)] whitespace-nowrap {activeTab ===
        'ai'
          ? 'bg-[var(--bg-tertiary)] text-[var(--accent-color)] border-b-2 md:border-b-0 md:border-l-2 border-[var(--accent-color)]'
          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] border-b-2 md:border-b-0 md:border-l-2 border-transparent'}"
        onclick={() => (activeTab = "ai")}
        role="tab"
        aria-selected={activeTab === "ai"}
      >
        AI Chat
      </button>
      <button
        class="px-4 py-3 text-sm font-medium transition-colors text-left focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:ring-offset-2 focus:ring-offset-[var(--bg-secondary)] whitespace-nowrap {activeTab ===
        'behavior'
          ? 'bg-[var(--bg-tertiary)] text-[var(--accent-color)] border-b-2 md:border-b-0 md:border-l-2 border-[var(--accent-color)]'
          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] border-b-2 md:border-b-0 md:border-l-2 border-transparent'}"
        onclick={() => (activeTab = "behavior")}
        role="tab"
        aria-selected={activeTab === "behavior"}
      >
        {$_("settings.tabs.behavior")}
      </button>
      <button
        class="px-4 py-3 text-sm font-medium transition-colors text-left focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:ring-offset-2 focus:ring-offset-[var(--bg-secondary)] whitespace-nowrap {activeTab ===
        'hotkeys'
          ? 'bg-[var(--bg-tertiary)] text-[var(--accent-color)] border-b-2 md:border-b-0 md:border-l-2 border-[var(--accent-color)]'
          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] border-b-2 md:border-b-0 md:border-l-2 border-transparent'}"
        onclick={() => (activeTab = "hotkeys")}
        role="tab"
        aria-selected={activeTab === "hotkeys"}
      >
        Hotkeys
      </button>
      <button
        class="px-4 py-3 text-sm font-medium transition-colors text-left focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:ring-offset-2 focus:ring-offset-[var(--bg-secondary)] whitespace-nowrap {activeTab ===
        'sidebar'
          ? 'bg-[var(--bg-tertiary)] text-[var(--accent-color)] border-b-2 md:border-b-0 md:border-l-2 border-[var(--accent-color)]'
          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] border-b-2 md:border-b-0 md:border-l-2 border-transparent'}"
        onclick={() => (activeTab = "sidebar")}
        role="tab"
        aria-selected={activeTab === "sidebar"}
      >
        Sidebar
      </button>
      <button
        class="px-4 py-3 text-sm font-medium transition-colors text-left focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:ring-offset-2 focus:ring-offset-[var(--bg-secondary)] whitespace-nowrap {activeTab ===
        'indicators'
          ? 'bg-[var(--bg-tertiary)] text-[var(--accent-color)] border-b-2 md:border-b-0 md:border-l-2 border-[var(--accent-color)]'
          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] border-b-2 md:border-b-0 md:border-l-2 border-transparent'}"
        onclick={() => (activeTab = "indicators")}
        role="tab"
        aria-selected={activeTab === "indicators"}
      >
        Technicals
      </button>
      <button
        class="px-4 py-3 text-sm font-medium transition-colors text-left focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:ring-offset-2 focus:ring-offset-[var(--bg-secondary)] whitespace-nowrap {activeTab ===
        'system'
          ? 'bg-[var(--bg-tertiary)] text-[var(--accent-color)] border-b-2 md:border-b-0 md:border-l-2 border-[var(--accent-color)]'
          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] border-b-2 md:border-b-0 md:border-l-2 border-transparent'}"
        onclick={() => (activeTab = "system")}
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
        <GeneralTab
          bind:currentLanguage
          bind:currentTheme
          bind:feePreference
          bind:forceEnglishTechnicalTerms
          {isPro}
          {themes}
        />
      {:else if activeTab === "api"}
        <ApiTab
          bind:apiProvider
          bind:bitunixKeys
          bind:binanceKeys
          bind:imgbbApiKey
          bind:imgbbExpiration
        />
      {:else if activeTab === "ai"}
        <AiTab
          bind:aiProvider={aiProviderState}
          bind:openaiApiKey
          bind:openaiModel
          bind:geminiApiKey
          bind:geminiModel
          bind:anthropicApiKey
          bind:anthropicModel
        />
      {:else if activeTab === "behavior"}
        <BehaviorTab
          bind:showSpinButtons
          bind:marketDataInterval
          bind:autoUpdatePriceInput
          bind:autoFetchBalance
          bind:hotkeyMode
          bind:enableGlassmorphism
          {activeDescriptions}
        />
      {:else if activeTab === "hotkeys"}
        <HotkeysTab bind:hotkeyMode />
      {:else if activeTab === "sidebar"}
        <SidebarTab
          bind:showSidebars
          bind:showTechnicals
          bind:showIndicatorParams
          bind:hideUnfilledOrders
          bind:positionViewMode
          bind:enableSidePanel
          bind:sidePanelMode
          bind:sidePanelLayout
        />
      {:else if activeTab === "indicators"}
        <IndicatorsTab
          bind:precision
          bind:historyLimit
          {availableTimeframes}
          bind:favoriteTimeframes
          bind:syncRsiTimeframe
          {isPro}
          bind:rsiSettings
          bind:macdSettings
          bind:emaSettings
          bind:stochSettings
          bind:cciSettings
          bind:adxSettings
          bind:aoSettings
          bind:momentumSettings
          bind:pivotSettings
        />
      {:else if activeTab === "system"}
        <SystemTab
          {isPro}
          onBackup={handleBackup}
          onRestore={handleRestore}
          onReset={handleReset}
        />
      {/if}
    </div>
  </div>

  <!-- Footer Actions -->
  <div
    class="flex justify-end gap-3 pt-4 border-t border-[var(--border-color)] shrink-0 bg-[var(--bg-secondary)] px-4 pb-4"
  >
    <button
      class="px-6 py-2 text-sm font-bold bg-[var(--accent-color)] text-[var(--btn-accent-text)] rounded hover:opacity-90 transition-opacity"
      onclick={close}
    >
      {$_("common.ok") || "OK"}
    </button>
  </div>
</ModalFrame>
