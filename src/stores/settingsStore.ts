import { writable } from "svelte/store";
import { browser } from "$app/environment";
import { CONSTANTS } from "../lib/constants";

export type MarketDataInterval = number; // Seconds
export type HotkeyMode = "mode1" | "mode2" | "mode3" | "custom";
export type PositionViewMode = "detailed" | "focus";
export type PnlViewMode = "value" | "percent" | "bar";
export type SidePanelLayout = "standard" | "floating";
export type AiProvider = "openai" | "gemini" | "anthropic";

export interface ApiKeys {
  key: string;
  secret: string;
}

export interface PanelState {
  width: number;
  height: number;
  x: number;
  y: number;
}

export interface Settings {
  apiProvider: "bitunix" | "binance";
  marketDataInterval: MarketDataInterval;
  autoUpdatePriceInput: boolean;
  autoFetchBalance: boolean;
  showSidebars: boolean;
  showTechnicals: boolean;
  showIndicatorParams: boolean;
  hideUnfilledOrders: boolean;
  positionViewMode?: PositionViewMode;
  pnlViewMode?: PnlViewMode;
  isPro: boolean;
  feePreference: "maker" | "taker";
  hotkeyMode: HotkeyMode;
  apiKeys: {
    bitunix: ApiKeys;
    binance: ApiKeys;
  };
  // Custom Hotkeys (Action ID -> Key Combo)
  customHotkeys: Record<string, string>;

  // Indicator & Timeframe Settings
  favoriteTimeframes: string[];
  syncRsiTimeframe: boolean;

  // ImgBB Settings
  imgbbApiKey: string;
  imgbbExpiration: number; // 0 = never, otherwise seconds
  isDeepDiveUnlocked?: boolean; // Persist cheat code state
  imgurClientId?: string;

  // Side Panel Settings
  enableSidePanel: boolean;
  sidePanelMode: "chat" | "notes" | "ai";
  sidePanelLayout: SidePanelLayout;
  chatStyle: "minimal" | "bubble" | "terminal";
  panelState: PanelState;

  // Custom AI Instructions
  customSystemPrompt: string; // User defined instructions

  // AI Chat Settings
  aiProvider: AiProvider;
  openaiApiKey: string;
  openaiModel: string;
  geminiApiKey: string;
  geminiModel: string;
  anthropicApiKey: string;
  anthropicModel: string;
  aiConfirmActions: boolean;
  aiTradeHistoryLimit: number; // NEW: Context limit

  // UI Settings
  showSpinButtons: boolean | "hover";
  disclaimerAccepted: boolean;
  useUtcDateParsing: boolean;
  forceEnglishTechnicalTerms: boolean;
  debugMode: boolean;
  syncFavorites: boolean;
  confirmTradeDeletion: boolean;
  confirmBulkDeletion: boolean;
  enableGlassmorphism: boolean;
}

const defaultSettings: Settings = {
  apiProvider: "bitunix",
  marketDataInterval: 10, // Default interval in seconds
  autoUpdatePriceInput: false,
  autoFetchBalance: false,
  showSidebars: true,
  showTechnicals: true,
  showIndicatorParams: false,
  hideUnfilledOrders: false,
  positionViewMode: "detailed",
  isPro: false,
  feePreference: "taker", // Default to Taker fees
  hotkeyMode: "mode2", // Safety Mode as default
  customHotkeys: {},
  apiKeys: {
    bitunix: { key: "", secret: "" },
    binance: { key: "", secret: "" },
  },
  favoriteTimeframes: ["5m", "15m", "1h", "4h"],
  syncRsiTimeframe: true,
  imgbbApiKey: "71a5689343bb63d5c85a76e4375f1d0b",
  imgbbExpiration: 0,
  isDeepDiveUnlocked: false,
  enableSidePanel: false,
  sidePanelMode: "ai",
  sidePanelLayout: "floating", // standard, floating, console
  chatStyle: "minimal", // minimal, bubble, terminal
  panelState: {
    width: 450,
    height: 550,
    x: 20,
    y: 20,
  },
  customSystemPrompt: "",

  // AI Defaults
  aiProvider: "gemini",
  openaiApiKey: "",
  openaiModel: "gpt-4o",
  geminiApiKey: "",
  geminiModel: "gemini-2.5-flash",
  anthropicApiKey: "",
  anthropicModel: "claude-3-5-sonnet-20240620",
  aiConfirmActions: false,
  aiTradeHistoryLimit: 50, // Default limit

  // UI Defaults
  showSpinButtons: "hover",
  disclaimerAccepted: false,
  useUtcDateParsing: true,
  forceEnglishTechnicalTerms: false,
  debugMode: false,
  syncFavorites: true,
  confirmTradeDeletion: true,
  confirmBulkDeletion: true,
  enableGlassmorphism: true,
};

function loadSettingsFromLocalStorage(): Settings {
  if (!browser) return defaultSettings;
  try {
    const d = localStorage.getItem(CONSTANTS.LOCAL_STORAGE_SETTINGS_KEY);
    if (!d) return defaultSettings;
    const parsed = JSON.parse(d);

    const settings = {
      ...defaultSettings,
      ...parsed,
      apiKeys: {
        ...defaultSettings.apiKeys,
        ...(parsed.apiKeys || {}),
      },
    };

    // Migration logic as before...
    if (parsed.marketDataInterval === "manual") {
      settings.autoUpdatePriceInput = false;
      settings.marketDataInterval = "1m";
    }

    if (parsed.priceUpdateMode) {
      if (parsed.priceUpdateMode === "auto") {
        settings.autoUpdatePriceInput = true;
      } else {
        settings.autoUpdatePriceInput = false;
      }
    }

    if (!settings.imgbbApiKey) {
      settings.imgbbApiKey = defaultSettings.imgbbApiKey;
    }

    // AI Migrations
    if (!settings.aiProvider) settings.aiProvider = defaultSettings.aiProvider;

    if (settings.geminiModel === "flash") {
      settings.geminiModel = "gemini-2.5-flash";
    }
    if (settings.geminiModel === "pro") {
      settings.geminiModel = "gemini-2.0-flash-exp";
    }

    // Ensure History Config exists
    if (typeof settings.aiTradeHistoryLimit !== "number") {
      settings.aiTradeHistoryLimit = defaultSettings.aiTradeHistoryLimit;
    }

    // Clean up keys not in interface
    const cleanSettings: Settings = {
      apiProvider: settings.apiProvider,
      marketDataInterval: settings.marketDataInterval,
      autoUpdatePriceInput: settings.autoUpdatePriceInput,
      autoFetchBalance: settings.autoFetchBalance,
      showSidebars: settings.showSidebars ?? defaultSettings.showSidebars,
      showTechnicals: settings.showTechnicals ?? defaultSettings.showTechnicals,
      showIndicatorParams:
        settings.showIndicatorParams ?? defaultSettings.showIndicatorParams,
      hideUnfilledOrders:
        settings.hideUnfilledOrders ?? defaultSettings.hideUnfilledOrders,
      positionViewMode:
        settings.positionViewMode ?? defaultSettings.positionViewMode,
      pnlViewMode: settings.pnlViewMode || "value",
      isPro: settings.isPro ?? defaultSettings.isPro,
      feePreference: settings.feePreference ?? defaultSettings.feePreference,
      hotkeyMode: settings.hotkeyMode ?? defaultSettings.hotkeyMode,
      customHotkeys: settings.customHotkeys || {},
      apiKeys: settings.apiKeys,
      favoriteTimeframes:
        settings.favoriteTimeframes ?? defaultSettings.favoriteTimeframes,
      syncRsiTimeframe:
        settings.syncRsiTimeframe ?? defaultSettings.syncRsiTimeframe,
      imgbbApiKey: settings.imgbbApiKey,
      imgbbExpiration: settings.imgbbExpiration,
      isDeepDiveUnlocked: settings.isDeepDiveUnlocked,
      enableSidePanel:
        settings.enableSidePanel ?? defaultSettings.enableSidePanel,
      sidePanelMode: settings.sidePanelMode ?? defaultSettings.sidePanelMode,
      sidePanelLayout:
        settings.sidePanelLayout ?? defaultSettings.sidePanelLayout,
      chatStyle: settings.chatStyle ?? defaultSettings.chatStyle,
      panelState: settings.panelState ?? defaultSettings.panelState,
      customSystemPrompt:
        settings.customSystemPrompt ?? defaultSettings.customSystemPrompt,
      aiProvider: settings.aiProvider,
      openaiApiKey: settings.openaiApiKey,
      openaiModel: settings.openaiModel,
      geminiApiKey: settings.geminiApiKey,
      geminiModel: settings.geminiModel,
      anthropicApiKey: settings.anthropicApiKey,
      anthropicModel: settings.anthropicModel,
      aiConfirmActions:
        settings.aiConfirmActions ?? defaultSettings.aiConfirmActions,
      aiTradeHistoryLimit:
        settings.aiTradeHistoryLimit ?? defaultSettings.aiTradeHistoryLimit,

      showSpinButtons:
        settings.showSpinButtons ?? defaultSettings.showSpinButtons,
      disclaimerAccepted:
        settings.disclaimerAccepted ?? defaultSettings.disclaimerAccepted,
      useUtcDateParsing:
        settings.useUtcDateParsing ?? defaultSettings.useUtcDateParsing,
      forceEnglishTechnicalTerms:
        settings.forceEnglishTechnicalTerms ??
        defaultSettings.forceEnglishTechnicalTerms,
      debugMode: settings.debugMode ?? defaultSettings.debugMode,
      syncFavorites: settings.syncFavorites ?? defaultSettings.syncFavorites,
      confirmTradeDeletion:
        settings.confirmTradeDeletion ?? defaultSettings.confirmTradeDeletion,
      confirmBulkDeletion:
        settings.confirmBulkDeletion ?? defaultSettings.confirmBulkDeletion,
      enableGlassmorphism:
        settings.enableGlassmorphism ?? defaultSettings.enableGlassmorphism,
    };

    return cleanSettings;
  } catch (e) {
    console.warn("Could not load settings from localStorage.", e);
    return defaultSettings;
  }
}

export const settingsStore = writable<Settings>(loadSettingsFromLocalStorage());

settingsStore.subscribe((value) => {
  if (browser) {
    try {
      localStorage.setItem(
        CONSTANTS.LOCAL_STORAGE_SETTINGS_KEY,
        JSON.stringify(value),
      );
    } catch (e) {
      console.warn("Could not save settings to localStorage.", e);
    }
  }
});
