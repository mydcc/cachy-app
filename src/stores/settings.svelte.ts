/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { untrack } from "svelte";
import { browser } from "$app/environment";
import { CONSTANTS } from "../lib/constants";
import { StorageHelper } from "../utils/storageHelper";

export type MarketDataInterval = number; // Seconds
export type HotkeyMode = "mode1" | "mode2" | "mode3" | "custom";
export type PositionViewMode = "detailed" | "focus";
export type PnlViewMode = "value" | "percent" | "bar";
export type SidePanelLayout = "standard" | "floating";
export type AiProvider = "openai" | "gemini" | "anthropic";
export type BackgroundType = "none" | "image" | "video" | "animation";
export type BackgroundAnimationPreset =
  | "none"
  | "gradient"
  | "particles"
  | "breathing"
  | "waves"
  | "aurora";
export type AnimationIntensity = "low" | "medium" | "high";
export type AnalysisDepth = "quick" | "standard" | "deep";

export type MarketMode = "performance" | "balanced" | "pro" | "custom";


export interface ApiKeys {
  key: string;
  secret: string;
  passphrase?: string;
}

export interface PanelState {
  width: number;
  height: number;
  x: number;
  y: number;
}

export interface Settings {
  apiProvider: "bitunix" | "bitget";
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
    bitget: ApiKeys;
  };
  customHotkeys: Record<string, string>;
  favoriteTimeframes: string[];
  favoriteSymbols: string[];
  syncRsiTimeframe: boolean;
  imgbbApiKey: string;
  imgbbExpiration: number;
  isDeepDiveUnlocked?: boolean;
  imgurClientId?: string;
  enableSidePanel: boolean;
  showSidebarActivity: boolean;
  sidePanelMode: "chat" | "notes" | "ai";
  sidePanelLayout: SidePanelLayout;
  chatStyle: "minimal" | "bubble" | "terminal";
  panelState: PanelState;
  maxPrivateNotes: number;
  customSystemPrompt: string;
  aiProvider: AiProvider;
  openaiApiKey: string;
  openaiModel: string;
  geminiApiKey: string;
  geminiModel: string;
  anthropicApiKey: string;
  anthropicModel: string;
  analysisDepth: AnalysisDepth;
  aiConfirmActions: boolean;
  aiTradeHistoryLimit: number;
  aiConfirmClear: boolean;
  showSpinButtons: boolean | "hover";
  disclaimerAccepted: boolean;
  useUtcDateParsing: boolean;
  forceEnglishTechnicalTerms: boolean;
  debugMode: boolean;
  syncFavorites: boolean;
  confirmTradeDeletion: boolean;
  confirmBulkDeletion: boolean;
  chatFontSize: number;
  panelIsExpanded: boolean;
  minChatProfitFactor: number;
  fontFamily: string;
  cryptoPanicApiKey?: string;
  newsApiKey?: string;
  cryptoPanicPlan: "developer" | "growth" | "enterprise";
  cryptoPanicFilter:
  | "all"
  | "rising"
  | "hot"
  | "bullish"
  | "bearish"
  | "important"
  | "saved";
  enableNewsAnalysis: boolean;
  cmcApiKey?: string;
  enableCmcContext: boolean;
  showMarketOverviewLinks: boolean;
  showMarketActivity: boolean;
  marketAnalysisInterval: number;
  pauseAnalysisOnBlur: boolean;
  showMarketSentiment: boolean;
  showTechnicalsSummary: boolean;
  showTechnicalsConfluence: boolean;
  showTechnicalsVolatility: boolean;
  showTechnicalsOscillators: boolean;
  showTechnicalsMAs: boolean;
  showTechnicalsAdvanced: boolean;
  showTechnicalsSignals: boolean;
  showTechnicalsPivots: boolean;
  showTvLink: boolean;
  showCgHeatLink: boolean;
  showBrokerLink: boolean;
  rssPresets?: string[];
  customRssFeeds?: string[];
  rssFilterBySymbol?: boolean;
  isProLicenseActive: boolean;
  enableGlassmorphism: boolean;
  glassBlur: number;
  glassSaturate: number;
  glassOpacity: number;
  backgroundType: BackgroundType;
  backgroundUrl: string | null;
  backgroundOpacity: number;
  backgroundBlur: number;
  backgroundAnimationPreset: BackgroundAnimationPreset;
  backgroundAnimationIntensity: AnimationIntensity;
  videoPlaybackSpeed: number;
  enableNetworkLogs: boolean;
  logSettings?: {
    technicals: boolean;
    network: boolean;
    ai: boolean;
    market: boolean;
    general: boolean;
    governance: boolean;
    technicalsVerbose?: boolean;
  };
  discordBotToken?: string;
  discordChannels: string[];

  // Market & Performance Settings
  marketMode: MarketMode;
  analyzeAllFavorites: boolean; // if false, only top 4
  enableNewsScraper: boolean; // if false, only on-demand
  marketCacheSize: number; // LRU cache size for market data (default: 20)
}

const defaultSettings: Settings = {
  apiProvider: "bitunix",
  marketDataInterval: 10,
  marketAnalysisInterval: 60,
  pauseAnalysisOnBlur: true,
  autoUpdatePriceInput: true,
  autoFetchBalance: false,
  showSidebars: true,
  showTechnicals: false,
  showIndicatorParams: false,
  hideUnfilledOrders: false,
  positionViewMode: "detailed",
  isPro: false,
  feePreference: "taker",
  hotkeyMode: "mode2",
  customHotkeys: {},
  apiKeys: {
    bitunix: { key: "", secret: "" },
    bitget: { key: "", secret: "", passphrase: "" },
  },
  favoriteTimeframes: ["5m", "15m", "1h", "4h"],
  favoriteSymbols: ["BTCUSDT", "ETHUSDT", "SOLUSDT", "LINKUSDT"],
  syncRsiTimeframe: true,
  imgbbApiKey: "71a5689343bb63d5c85a76e4375f1d0b",
  imgbbExpiration: 0,
  isDeepDiveUnlocked: false,
  enableSidePanel: false,
  sidePanelMode: "ai",
  sidePanelLayout: "floating",
  chatStyle: "minimal",
  panelState: {
    width: 450,
    height: 550,
    x: 20,
    y: 20,
  },
  customSystemPrompt: "",
  aiProvider: "gemini",
  openaiApiKey: "",
  openaiModel: "gpt-4o",
  geminiApiKey: "",
  geminiModel: "gemini-1.5-flash",
  anthropicApiKey: "",
  anthropicModel: "claude-3-5-sonnet-20240620",
  analysisDepth: "standard",
  aiConfirmActions: false,
  aiTradeHistoryLimit: 50,
  showSpinButtons: "hover",
  disclaimerAccepted: false,
  useUtcDateParsing: true,
  forceEnglishTechnicalTerms: false,
  debugMode: false,
  syncFavorites: true,
  confirmTradeDeletion: true,
  confirmBulkDeletion: true,
  chatFontSize: 13,
  panelIsExpanded: false,
  maxPrivateNotes: 50,
  aiConfirmClear: true,
  minChatProfitFactor: 0.0,
  fontFamily: "Inter",
  cryptoPanicApiKey: "",
  newsApiKey: "",
  cryptoPanicPlan: "developer",
  cryptoPanicFilter: "important",
  enableNewsAnalysis: true,
  cmcApiKey: "",
  enableCmcContext: false,
  showMarketOverviewLinks: true,
  showMarketActivity: true,
  showMarketSentiment: true,
  showSidebarActivity: false,
  showTechnicalsSummary: true,
  showTechnicalsConfluence: true,
  showTechnicalsVolatility: true,
  showTechnicalsOscillators: true,
  showTechnicalsMAs: true,
  showTechnicalsAdvanced: true,
  showTechnicalsSignals: true,
  showTechnicalsPivots: true,
  showTvLink: true,
  showCgHeatLink: true,
  showBrokerLink: true,
  rssPresets: ["coindesk", "cointelegraph"],
  customRssFeeds: [],
  rssFilterBySymbol: false,
  isProLicenseActive: false,
  enableGlassmorphism: false,
  glassBlur: 8,
  glassSaturate: 100,
  glassOpacity: 0.7,
  backgroundType: "none",
  backgroundUrl: null,
  backgroundOpacity: 0.3,
  backgroundBlur: 5,
  backgroundAnimationPreset: "none",
  backgroundAnimationIntensity: "medium",
  videoPlaybackSpeed: 1.0,
  enableNetworkLogs: false,
  logSettings: {
    technicals: false,
    network: false,
    ai: true,
    market: false,
    general: true,
    governance: true,
    technicalsVerbose: false,
  },
  discordBotToken: "",
  discordChannels: [],

  marketMode: "balanced",
  analyzeAllFavorites: false, // Default to top 4 only for balanced
  enableNewsScraper: false, // Default to disabled (no Nitter)
  marketCacheSize: 20, // Default LRU cache size
};

class SettingsManager {
  // Using $state for all properties
  private _apiProvider = $state<"bitunix" | "bitget">(
    defaultSettings.apiProvider,
  );
  get apiProvider() {
    return this._apiProvider;
  }
  set apiProvider(v: "bitunix" | "bitget") {
    if (v !== this._apiProvider) {
      if (import.meta.env.DEV) {
        console.warn(`[Settings] apiProvider: ${this._apiProvider} -> ${v}`);
      }
      this._apiProvider = v;
      // Let $effect handle saving, don't call save() directly
    }
  }
  marketDataInterval = $state<number>(defaultSettings.marketDataInterval);
  autoUpdatePriceInput = $state<boolean>(defaultSettings.autoUpdatePriceInput);
  autoFetchBalance = $state<boolean>(defaultSettings.autoFetchBalance);
  showSidebars = $state<boolean>(defaultSettings.showSidebars);
  showTechnicals = $state<boolean>(defaultSettings.showTechnicals);
  showIndicatorParams = $state<boolean>(defaultSettings.showIndicatorParams);
  hideUnfilledOrders = $state<boolean>(defaultSettings.hideUnfilledOrders);
  positionViewMode = $state<PositionViewMode | undefined>(
    defaultSettings.positionViewMode,
  );
  pnlViewMode = $state<PnlViewMode | undefined>(defaultSettings.pnlViewMode);
  isPro = $state<boolean>(defaultSettings.isPro);
  feePreference = $state<"maker" | "taker">(defaultSettings.feePreference);
  hotkeyMode = $state<HotkeyMode>(defaultSettings.hotkeyMode);
  isProLicenseActive = $state<boolean>(defaultSettings.isProLicenseActive);
  glassBlur = $state<number>(defaultSettings.glassBlur);
  glassSaturate = $state<number>(defaultSettings.glassSaturate);
  glassOpacity = $state<number>(defaultSettings.glassOpacity);

  apiKeys = $state(defaultSettings.apiKeys);
  customHotkeys = $state(defaultSettings.customHotkeys);
  favoriteTimeframes = $state(defaultSettings.favoriteTimeframes);
  favoriteSymbols = $state(defaultSettings.favoriteSymbols);

  syncRsiTimeframe = $state<boolean>(defaultSettings.syncRsiTimeframe);
  imgbbApiKey = $state<string>(defaultSettings.imgbbApiKey);
  imgbbExpiration = $state<number>(defaultSettings.imgbbExpiration);
  isDeepDiveUnlocked = $state<boolean | undefined>(
    defaultSettings.isDeepDiveUnlocked,
  );
  imgurClientId = $state<string | undefined>(defaultSettings.imgurClientId);

  enableSidePanel = $state<boolean>(defaultSettings.enableSidePanel);
  sidePanelMode = $state<"chat" | "notes" | "ai">(
    defaultSettings.sidePanelMode,
  );
  sidePanelLayout = $state<SidePanelLayout>(defaultSettings.sidePanelLayout);
  chatStyle = $state<"minimal" | "bubble" | "terminal">(
    defaultSettings.chatStyle,
  );
  panelState = $state(defaultSettings.panelState);
  maxPrivateNotes = $state<number>(defaultSettings.maxPrivateNotes);

  customSystemPrompt = $state<string>(defaultSettings.customSystemPrompt);
  aiProvider = $state<AiProvider>(defaultSettings.aiProvider);
  openaiApiKey = $state<string>(defaultSettings.openaiApiKey);
  openaiModel = $state<string>(defaultSettings.openaiModel);
  geminiApiKey = $state<string>(defaultSettings.geminiApiKey);
  geminiModel = $state<string>(defaultSettings.geminiModel);
  anthropicApiKey = $state<string>(defaultSettings.anthropicApiKey);
  anthropicModel = $state<string>(defaultSettings.anthropicModel);
  analysisDepth = $state<AnalysisDepth>(defaultSettings.analysisDepth);
  aiConfirmActions = $state<boolean>(defaultSettings.aiConfirmActions);
  aiTradeHistoryLimit = $state<number>(defaultSettings.aiTradeHistoryLimit);
  aiConfirmClear = $state<boolean>(defaultSettings.aiConfirmClear);

  rssFilterBySymbol = $state<boolean | undefined>(
    defaultSettings.rssFilterBySymbol,
  );

  showSpinButtons = $state<boolean | "hover">(defaultSettings.showSpinButtons);
  disclaimerAccepted = $state<boolean>(defaultSettings.disclaimerAccepted);
  useUtcDateParsing = $state<boolean>(defaultSettings.useUtcDateParsing);
  forceEnglishTechnicalTerms = $state<boolean>(
    defaultSettings.forceEnglishTechnicalTerms,
  );
  debugMode = $state<boolean>(defaultSettings.debugMode);
  syncFavorites = $state<boolean>(defaultSettings.syncFavorites);
  confirmTradeDeletion = $state<boolean>(defaultSettings.confirmTradeDeletion);
  confirmBulkDeletion = $state<boolean>(defaultSettings.confirmBulkDeletion);
  chatFontSize = $state<number>(defaultSettings.chatFontSize);
  panelIsExpanded = $state<boolean>(defaultSettings.panelIsExpanded);
  minChatProfitFactor = $state<number>(defaultSettings.minChatProfitFactor);
  fontFamily = $state<string>(defaultSettings.fontFamily);
  cryptoPanicApiKey = $state<string | undefined>(
    defaultSettings.cryptoPanicApiKey,
  );
  newsApiKey = $state<string | undefined>(defaultSettings.newsApiKey);
  cryptoPanicPlan = $state<"developer" | "growth" | "enterprise">(
    defaultSettings.cryptoPanicPlan,
  );
  cryptoPanicFilter = $state<
    "all" | "rising" | "hot" | "bullish" | "bearish" | "important" | "saved"
  >(defaultSettings.cryptoPanicFilter);
  enableNewsAnalysis = $state<boolean>(defaultSettings.enableNewsAnalysis);
  cmcApiKey = $state<string | undefined>(defaultSettings.cmcApiKey);
  enableCmcContext = $state<boolean>(defaultSettings.enableCmcContext);
  showMarketOverviewLinks = $state<boolean>(
    defaultSettings.showMarketOverviewLinks,
  );
  showMarketActivity = $state<boolean>(defaultSettings.showMarketActivity);
  marketAnalysisInterval = $state<number>(defaultSettings.marketAnalysisInterval);
  pauseAnalysisOnBlur = $state<boolean>(defaultSettings.pauseAnalysisOnBlur);
  showSidebarActivity = $state<boolean>(defaultSettings.showSidebarActivity);
  get effectiveShowSidebarActivity() {
    return this.isPro && this.showSidebarActivity;
  }

  get capabilities() {
    // Check if user has API credentials
    // For Bitget, we need key, secret AND passphrase
    const hasBitgetKeys = Boolean(
      this.apiKeys?.bitget?.key &&
      this.apiKeys?.bitget?.secret &&
      this.apiKeys?.bitget?.passphrase
    );

    // For Bitunix, just key and secret
    const hasBitunixKeys = Boolean(
      this.apiKeys?.bitunix?.key &&
      this.apiKeys?.bitunix?.secret
    );

    const hasApiKeys = this.apiProvider === "bitget" ? hasBitgetKeys : hasBitunixKeys;

    return {
      // ========== PUBLIC FEATURES (Community + Pro) ==========
      // Market data via WebSocket/API - available for all users
      marketData: this.showMarketActivity,

      // Position calculator - always available (core feature)
      positionCalculator: true,

      // Technical indicators (RSI, Bollinger, etc.) - free for all
      technicals: true,

      // News sentiment analysis - free for all
      newsSentiment: true,

      // ========== PRO FEATURES (PowerToggle + API Secret) ==========
      // Trade execution - requires Pro license AND API credentials
      tradeExecution: this.isPro && hasApiKeys,

      // Live account data from private WebSocket
      livePositions: this.isPro && hasApiKeys,
      liveOrders: this.isPro && hasApiKeys,
      liveBalance: this.isPro && hasApiKeys,

      // Pro-only settings (require live data access)
      pnlSettings: this.isPro && hasApiKeys,
      feeSettings: this.isPro && hasApiKeys,

      // Future features (prepared for expansion)
      autoTrading: false, // Coming soon
      multiAccount: false, // Coming soon
    };
  }
  showMarketSentiment = $state<boolean>(defaultSettings.showMarketSentiment);
  showTechnicalsSummary = $state<boolean>(
    defaultSettings.showTechnicalsSummary,
  );
  showTechnicalsConfluence = $state<boolean>(
    defaultSettings.showTechnicalsConfluence,
  );
  showTechnicalsVolatility = $state<boolean>(
    defaultSettings.showTechnicalsVolatility,
  );
  showTechnicalsOscillators = $state<boolean>(
    defaultSettings.showTechnicalsOscillators,
  );
  showTechnicalsMAs = $state<boolean>(defaultSettings.showTechnicalsMAs);
  showTechnicalsAdvanced = $state<boolean>(
    defaultSettings.showTechnicalsAdvanced,
  );
  showTechnicalsSignals = $state<boolean>(
    defaultSettings.showTechnicalsSignals,
  );
  showTechnicalsPivots = $state<boolean>(defaultSettings.showTechnicalsPivots);
  showTvLink = $state<boolean>(defaultSettings.showTvLink);
  showCgHeatLink = $state<boolean>(defaultSettings.showCgHeatLink);
  showBrokerLink = $state<boolean>(defaultSettings.showBrokerLink);
  rssPresets = $state<string[]>(defaultSettings.rssPresets || []);
  customRssFeeds = $state<string[]>(defaultSettings.customRssFeeds || []);

  // Background Customization
  enableGlassmorphism = $state<boolean>(defaultSettings.enableGlassmorphism);
  backgroundType = $state<BackgroundType>(defaultSettings.backgroundType);
  backgroundUrl = $state<string | null>(defaultSettings.backgroundUrl);
  backgroundOpacity = $state<number>(defaultSettings.backgroundOpacity);
  backgroundBlur = $state<number>(defaultSettings.backgroundBlur);
  backgroundAnimationPreset = $state<BackgroundAnimationPreset>(
    defaultSettings.backgroundAnimationPreset,
  );
  backgroundAnimationIntensity = $state<AnimationIntensity>(
    defaultSettings.backgroundAnimationIntensity,
  );
  videoPlaybackSpeed = $state<number>(defaultSettings.videoPlaybackSpeed);
  enableNetworkLogs = $state<boolean>(defaultSettings.enableNetworkLogs);
  logSettings = $state(defaultSettings.logSettings);

  // Social Media
  discordBotToken = $state<string | undefined>(defaultSettings.discordBotToken);
  discordChannels = $state<string[]>(defaultSettings.discordChannels);

  // Market & Performance State
  private _marketMode = $state<MarketMode>(defaultSettings.marketMode);
  analyzeAllFavorites = $state<boolean>(defaultSettings.analyzeAllFavorites);
  enableNewsScraper = $state<boolean>(defaultSettings.enableNewsScraper);
  marketCacheSize = $state<number>(defaultSettings.marketCacheSize);

  get marketMode() {
    return this._marketMode;
  }

  set marketMode(v: MarketMode) {
    if (v !== this._marketMode) {
      this._marketMode = v;
      this.applyMarketMode(v);
    }
  }

  // Pre-defined profiles
  private applyMarketMode(mode: MarketMode) {
    if (mode === "performance") {
      this.marketAnalysisInterval = 0; // Disabled background analysis usually, or very slow
      this.enableNewsAnalysis = false;
      this.showMarketActivity = false;
      this.analyzeAllFavorites = false;
      this.enableNewsScraper = false;
    } else if (mode === "balanced") {
      this.marketAnalysisInterval = 300; // 5 minutes
      this.enableNewsAnalysis = true;
      this.showMarketActivity = true;
      this.analyzeAllFavorites = false; // Only Top 4
      this.enableNewsScraper = false;
    } else if (mode === "pro") {
      this.marketAnalysisInterval = 60; // 1 minute
      this.enableNewsAnalysis = true;
      this.showMarketActivity = true;
      this.analyzeAllFavorites = true; // All 12
      this.enableNewsScraper = true; // Full power
    }
    // "custom" touches nothing, user decides
  }
  // Private state
  private effectActive = false; // Controls whether $effect should trigger saves
  private listeners: Set<(value: Settings) => void> = new Set();
  private notifyTimer: any = null;
  private saveTimer: any = null;
  private saveLock = false; // Prevents concurrent saves

  constructor() {
    if (browser) {
      // 1. Load settings synchronously (effectActive is false, so no saves)
      this.load();

      // 2. Register $effect AFTER load completes (next microtask)
      queueMicrotask(() => {
        this.effectActive = true;

        $effect.root(() => {
          $effect(() => {
            if (!this.effectActive) return;

            // Track ALL properties by calling toJSON()
            // This ensures any property change triggers the effect
            this.toJSON();

            untrack(() => {
              // Debounce saves to prevent excessive writes
              if (this.saveTimer) clearTimeout(this.saveTimer);
              this.saveTimer = setTimeout(() => {
                this.save();
                this.notifyListeners();
              }, 500); // Increased from 200ms to 500ms
            });
          });
        });

        if (import.meta.env.DEV) {
          console.warn("[Settings] Store ready. Provider:", this.apiProvider);
        }
      });

      // 3. Listen for changes from other tabs
      window.addEventListener("storage", (e) => {
        if (e.key === CONSTANTS.LOCAL_STORAGE_SETTINGS_KEY && e.newValue) {
          // Only sync if not currently saving (prevents overwriting)
          if (!this.saveLock) {
            if (import.meta.env.DEV) {
              console.warn("[Settings] Syncing from other tab...");
            }
            this.effectActive = false; // Disable effect temporarily
            this.load();
            this.effectActive = true; // Re-enable
          } else {
            if (import.meta.env.DEV) {
              console.warn("[Settings] Ignoring storage event during save");
            }
          }
        }
      });
    }
  }

  private load() {
    try {
      const d = localStorage.getItem(CONSTANTS.LOCAL_STORAGE_SETTINGS_KEY);
      if (!d) {
        // No settings found, save defaults
        this.save();
        return;
      }

      const parsed = JSON.parse(d);

      // Deep merge apiKeys
      const mergedApiKeys = {
        bitunix: {
          ...defaultSettings.apiKeys.bitunix,
          ...(parsed.apiKeys?.bitunix || {}),
        },
        bitget: {
          ...defaultSettings.apiKeys.bitget,
          ...(parsed.apiKeys?.bitget || {}),
        },
      };

      const merged = { ...defaultSettings, ...parsed, apiKeys: mergedApiKeys };

      // Migration: Ensure bitunix is default once if not already migrated
      const migrationKey = "cachy_v0.94_broker_migrated_v2";
      const migrationDone = localStorage.getItem(migrationKey);

      // No untrack needed - effectActive is false during load
      let loadedProvider = merged.apiProvider;

      if (!migrationDone) {
        if (import.meta.env.DEV) {
          console.warn(
            "[Settings] First load of v0.94: Forcing Bitunix as default.",
          );
        }
        loadedProvider = "bitunix";
        localStorage.setItem(migrationKey, "true");
      }

      // If user had Binance before, fallback to Bitget or Bitunix?
      // Since Binance is gone, if provider was "binance", set to "bitunix" or "bitget".
      if (loadedProvider === "binance") {
        if (import.meta.env.DEV) {
          console.warn("[Settings] Binance provider found (deprecated). Resetting to Bitunix.");
        }
        loadedProvider = "bitunix";
      }

      const finalProvider = loadedProvider === "bitget" ? "bitget" : "bitunix";

      // Set the private field directly during load to avoid dual logging
      this._apiProvider = finalProvider;

      if (loadedProvider && loadedProvider !== finalProvider) {
        if (import.meta.env.DEV) {
          console.warn(
            `[Settings] Invalid provider "${loadedProvider}" reset to "${finalProvider}"`,
          );
        }
      }
      this.marketDataInterval = merged.marketDataInterval;
      this.autoUpdatePriceInput = merged.autoUpdatePriceInput;
      this.autoFetchBalance = merged.autoFetchBalance;
      this.showSidebars = merged.showSidebars;
      this.showTechnicals = merged.showTechnicals;
      this.showIndicatorParams = merged.showIndicatorParams;
      this.hideUnfilledOrders = merged.hideUnfilledOrders;
      this.positionViewMode = merged.positionViewMode;
      this.pnlViewMode = merged.pnlViewMode;
      this.isPro = merged.isPro;
      this.feePreference = merged.feePreference;
      this.hotkeyMode = merged.hotkeyMode;
      // Granular updates for apiKeys to preserve object references if components bind to them
      if (merged.apiKeys) {
        if (merged.apiKeys.bitunix) this.apiKeys.bitunix = merged.apiKeys.bitunix;
        if (merged.apiKeys.bitget) this.apiKeys.bitget = merged.apiKeys.bitget;
      }

      this.customHotkeys = merged.customHotkeys || {};
      this.favoriteTimeframes = merged.favoriteTimeframes;
      // Strict limit on favorites to prevent memory overflow (User Agreement: 12)
      this.favoriteSymbols = (merged.favoriteSymbols || []).slice(0, 12);
      this.syncRsiTimeframe = merged.syncRsiTimeframe;
      this.imgbbApiKey = merged.imgbbApiKey;
      this.imgbbExpiration = merged.imgbbExpiration;
      this.isDeepDiveUnlocked = merged.isDeepDiveUnlocked;
      this.imgurClientId = merged.imgurClientId;
      this.enableSidePanel = merged.enableSidePanel;
      this.sidePanelMode = merged.sidePanelMode;
      this.sidePanelLayout = merged.sidePanelLayout;
      this.chatStyle = merged.chatStyle;

      // Copy panelState properties individually to preserve $state reactivity
      if (merged.panelState) {
        this.panelState.width = merged.panelState.width ?? this.panelState.width;
        this.panelState.height = merged.panelState.height ?? this.panelState.height;
        this.panelState.x = merged.panelState.x ?? this.panelState.x;
        this.panelState.y = merged.panelState.y ?? this.panelState.y;
      }
      this.maxPrivateNotes = merged.maxPrivateNotes;
      this.customSystemPrompt = merged.customSystemPrompt;
      this.aiProvider = merged.aiProvider;
      this.openaiApiKey = merged.openaiApiKey;
      this.openaiModel = merged.openaiModel;
      this.geminiApiKey = merged.geminiApiKey;
      this.geminiModel = merged.geminiModel;
      this.anthropicApiKey = merged.anthropicApiKey;
      this.anthropicModel = merged.anthropicModel;
      this.analysisDepth = merged.analysisDepth || defaultSettings.analysisDepth;
      this.aiConfirmActions = merged.aiConfirmActions;
      this.aiTradeHistoryLimit = merged.aiTradeHistoryLimit;
      this.aiConfirmClear = merged.aiConfirmClear;
      this.showSpinButtons = merged.showSpinButtons;
      this.disclaimerAccepted = merged.disclaimerAccepted;
      this.useUtcDateParsing = merged.useUtcDateParsing;
      this.forceEnglishTechnicalTerms = merged.forceEnglishTechnicalTerms;
      this.debugMode = merged.debugMode;
      this.syncFavorites = merged.syncFavorites;
      this.confirmTradeDeletion = merged.confirmTradeDeletion;
      this.confirmBulkDeletion = merged.confirmBulkDeletion;
      this.chatFontSize = merged.chatFontSize;
      this.panelIsExpanded = merged.panelIsExpanded;
      this.minChatProfitFactor = merged.minChatProfitFactor;
      this.fontFamily = merged.fontFamily;
      this.cryptoPanicApiKey = merged.cryptoPanicApiKey;
      this.newsApiKey = merged.newsApiKey;
      this.cryptoPanicPlan =
        merged.cryptoPanicPlan || defaultSettings.cryptoPanicPlan;
      this.cryptoPanicFilter =
        merged.cryptoPanicFilter || defaultSettings.cryptoPanicFilter;
      this.enableNewsAnalysis = merged.enableNewsAnalysis;
      this.cmcApiKey = merged.cmcApiKey;
      this.enableCmcContext = merged.enableCmcContext;
      this.showMarketOverviewLinks = merged.showMarketOverviewLinks;
      this.showMarketActivity = merged.showMarketActivity;
      this.showSidebarActivity =
        merged.showSidebarActivity ?? defaultSettings.showSidebarActivity;
      this.showMarketSentiment = merged.showMarketSentiment;
      this.showTechnicalsSummary = merged.showTechnicalsSummary;
      this.showTechnicalsConfluence = merged.showTechnicalsConfluence;
      this.showTechnicalsVolatility = merged.showTechnicalsVolatility;
      this.showTechnicalsOscillators = merged.showTechnicalsOscillators;
      this.showTechnicalsMAs = merged.showTechnicalsMAs;
      this.showTechnicalsAdvanced = merged.showTechnicalsAdvanced;
      this.showTechnicalsSignals = merged.showTechnicalsSignals;
      this.showTechnicalsPivots =
        merged.showTechnicalsPivots ?? defaultSettings.showTechnicalsPivots;
      this.logSettings = merged.logSettings || defaultSettings.logSettings;
      this.showTvLink = merged.showTvLink ?? defaultSettings.showTvLink;
      this.showCgHeatLink =
        merged.showCgHeatLink ?? defaultSettings.showCgHeatLink;
      this.showBrokerLink =
        merged.showBrokerLink ?? defaultSettings.showBrokerLink;
      this.rssPresets = merged.rssPresets || defaultSettings.rssPresets;
      this.customRssFeeds =
        merged.customRssFeeds || defaultSettings.customRssFeeds;
      this.isProLicenseActive =
        merged.isProLicenseActive ?? defaultSettings.isProLicenseActive;
      this.glassBlur = merged.glassBlur ?? defaultSettings.glassBlur;
      this.glassSaturate = merged.glassSaturate ?? defaultSettings.glassSaturate;
      this.glassOpacity = merged.glassOpacity ?? defaultSettings.glassOpacity;

      // Background Customization
      this.enableGlassmorphism =
        merged.enableGlassmorphism ?? defaultSettings.enableGlassmorphism;
      this.backgroundType =
        merged.backgroundType ?? defaultSettings.backgroundType;
      this.backgroundUrl =
        merged.backgroundUrl ?? defaultSettings.backgroundUrl;
      this.backgroundOpacity =
        merged.backgroundOpacity ?? defaultSettings.backgroundOpacity;
      this.backgroundBlur =
        merged.backgroundBlur ?? defaultSettings.backgroundBlur;
      this.backgroundAnimationPreset =
        merged.backgroundAnimationPreset ??
        defaultSettings.backgroundAnimationPreset;
      this.backgroundAnimationIntensity =
        merged.backgroundAnimationIntensity ??
        defaultSettings.backgroundAnimationIntensity;
      this.videoPlaybackSpeed =
        merged.videoPlaybackSpeed ?? defaultSettings.videoPlaybackSpeed;
      this.enableNetworkLogs =
        merged.enableNetworkLogs ?? defaultSettings.enableNetworkLogs;

      // Social Media
      this.discordBotToken = merged.discordBotToken;
      this.discordChannels =
        merged.discordChannels || defaultSettings.discordChannels;

      this._marketMode = merged.marketMode || defaultSettings.marketMode;
      this.analyzeAllFavorites = merged.analyzeAllFavorites ?? defaultSettings.analyzeAllFavorites;
      this.enableNewsScraper = merged.enableNewsScraper ?? defaultSettings.enableNewsScraper;
      this.marketCacheSize = merged.marketCacheSize ?? defaultSettings.marketCacheSize;


      if (parsed.marketDataInterval === "manual") {
        this.autoUpdatePriceInput = false;
        this.marketDataInterval = 60;
      }

      // Migration for Gemini Model: Ensure we use a stable version
      // We do this at the very end to ensure it's not overwritten by 'merged.geminiModel'
      if (this.geminiModel === "gemma" || !this.geminiModel) {
        if (import.meta.env.DEV) {
          console.warn(
            "[Settings] Migrating geminiModel to gemini-1.5-flash for stability.",
          );
        }
        this.geminiModel = "gemini-1.5-flash";
      }
    } catch (e) {
      if (import.meta.env.DEV) {
        console.error("[Settings] Load failed, using defaults:", e);
      }
      // Save defaults to fix corrupted localStorage
      this.save();
    }
  }

  private save() {
    if (!browser || !this.effectActive || this.saveLock) return;

    this.saveLock = true;

    try {
      const data = this.toJSON();
      const current = localStorage.getItem(
        CONSTANTS.LOCAL_STORAGE_SETTINGS_KEY,
      );
      const newData = JSON.stringify(data);

      // Only save if actually different (prevent unnecessary writes)
      if (current !== newData) {
        const success = StorageHelper.safeSave(
          CONSTANTS.LOCAL_STORAGE_SETTINGS_KEY,
          newData,
        );

        if (!success) {
          if (import.meta.env.DEV) {
            console.error("[Settings] Failed to save after retry");
          }
        }
      }
    } catch (e) {
      if (import.meta.env.DEV) {
        console.error("[Settings] Save failed:", e);
      }
    } finally {
      this.saveLock = false;
    }
  }

  toJSON(): Settings {
    return {
      apiProvider: this.apiProvider,
      marketDataInterval: this.marketDataInterval,
      marketAnalysisInterval: this.marketAnalysisInterval,
      pauseAnalysisOnBlur: this.pauseAnalysisOnBlur,
      autoUpdatePriceInput: this.autoUpdatePriceInput,
      autoFetchBalance: this.autoFetchBalance,
      showSidebars: this.showSidebars,
      showTechnicals: this.showTechnicals,
      showIndicatorParams: this.showIndicatorParams,
      hideUnfilledOrders: this.hideUnfilledOrders,
      positionViewMode: this.positionViewMode,
      pnlViewMode: this.pnlViewMode,
      isPro: this.isPro,
      feePreference: this.feePreference,
      hotkeyMode: this.hotkeyMode,
      apiKeys: $state.snapshot(this.apiKeys),
      customHotkeys: $state.snapshot(this.customHotkeys),
      favoriteTimeframes: $state.snapshot(this.favoriteTimeframes),
      favoriteSymbols: $state.snapshot(this.favoriteSymbols),
      syncRsiTimeframe: this.syncRsiTimeframe,
      imgbbApiKey: this.imgbbApiKey,
      imgbbExpiration: this.imgbbExpiration,
      isDeepDiveUnlocked: this.isDeepDiveUnlocked,
      imgurClientId: this.imgurClientId,
      enableSidePanel: this.enableSidePanel,
      sidePanelMode: this.sidePanelMode,
      sidePanelLayout: this.sidePanelLayout,
      chatStyle: this.chatStyle,
      panelState: $state.snapshot(this.panelState),
      maxPrivateNotes: this.maxPrivateNotes,
      customSystemPrompt: this.customSystemPrompt,
      aiProvider: this.aiProvider,
      openaiApiKey: this.openaiApiKey,
      openaiModel: this.openaiModel,
      geminiApiKey: this.geminiApiKey,
      geminiModel: this.geminiModel,
      anthropicApiKey: this.anthropicApiKey,
      anthropicModel: this.anthropicModel,
      analysisDepth: this.analysisDepth,
      aiConfirmActions: this.aiConfirmActions,
      aiTradeHistoryLimit: this.aiTradeHistoryLimit,
      aiConfirmClear: this.aiConfirmClear,
      showSpinButtons: this.showSpinButtons,
      disclaimerAccepted: this.disclaimerAccepted,
      useUtcDateParsing: this.useUtcDateParsing,
      forceEnglishTechnicalTerms: this.forceEnglishTechnicalTerms,
      debugMode: this.debugMode,
      syncFavorites: this.syncFavorites,
      confirmTradeDeletion: this.confirmTradeDeletion,
      confirmBulkDeletion: this.confirmBulkDeletion,
      chatFontSize: this.chatFontSize,
      panelIsExpanded: this.panelIsExpanded,
      minChatProfitFactor: this.minChatProfitFactor,
      fontFamily: this.fontFamily,
      cryptoPanicApiKey: this.cryptoPanicApiKey,
      newsApiKey: this.newsApiKey,
      cryptoPanicPlan: this.cryptoPanicPlan,
      cryptoPanicFilter: this.cryptoPanicFilter,
      enableNewsAnalysis: this.enableNewsAnalysis,
      cmcApiKey: this.cmcApiKey,
      enableCmcContext: this.enableCmcContext,
      showMarketOverviewLinks: this.showMarketOverviewLinks,
      showMarketActivity: this.showMarketActivity,
      showSidebarActivity: this.showSidebarActivity,
      showMarketSentiment: this.showMarketSentiment,
      showTechnicalsSummary: this.showTechnicalsSummary,
      showTechnicalsConfluence: this.showTechnicalsConfluence,
      showTechnicalsVolatility: this.showTechnicalsVolatility,
      showTechnicalsOscillators: this.showTechnicalsOscillators,
      showTechnicalsMAs: this.showTechnicalsMAs,
      showTechnicalsAdvanced: this.showTechnicalsAdvanced,
      showTechnicalsSignals: this.showTechnicalsSignals,
      showTechnicalsPivots: this.showTechnicalsPivots,
      showTvLink: this.showTvLink,
      showCgHeatLink: this.showCgHeatLink,
      showBrokerLink: this.showBrokerLink,
      rssPresets: $state.snapshot(this.rssPresets),
      customRssFeeds: $state.snapshot(this.customRssFeeds),
      isProLicenseActive: this.isProLicenseActive,
      glassBlur: this.glassBlur,
      glassSaturate: this.glassSaturate,
      glassOpacity: this.glassOpacity,
      enableGlassmorphism: this.enableGlassmorphism,
      backgroundType: this.backgroundType,
      backgroundUrl: this.backgroundUrl,
      backgroundOpacity: this.backgroundOpacity,
      backgroundBlur: this.backgroundBlur,
      backgroundAnimationPreset: this.backgroundAnimationPreset,
      backgroundAnimationIntensity: this.backgroundAnimationIntensity,
      videoPlaybackSpeed: this.videoPlaybackSpeed,
      enableNetworkLogs: this.enableNetworkLogs,
      logSettings: $state.snapshot(this.logSettings),
      discordBotToken: this.discordBotToken,
      discordChannels: $state.snapshot(this.discordChannels),
      marketMode: this.marketMode,
      analyzeAllFavorites: this.analyzeAllFavorites,
      enableNewsScraper: this.enableNewsScraper,
      marketCacheSize: this.marketCacheSize,
    };
  }

  subscribe(fn: (value: Settings) => void): () => void {
    fn(this.toJSON());
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private notifyListeners() {
    if (this.notifyTimer) clearTimeout(this.notifyTimer);
    this.notifyTimer = setTimeout(() => {
      const snapshot = this.toJSON();
      this.listeners.forEach((fn) => fn(snapshot));
      this.notifyTimer = null;
    }, 50);
  }

  update(fn: (s: Settings) => Partial<Settings>) {
    const current = this.toJSON();
    const updates = fn(current);
    Object.assign(this, updates);
  }
}

export const settingsState = new SettingsManager();
