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
import { cryptoService, type EncryptedBlob } from "../services/cryptoService";
import { EntitlementStore } from "./entitlement.svelte";
import {
  SecretsLoader,
  SENSITIVE_KEYS,
  apiKeyHasMaterial,
  redactApiKeys,
} from "./settings/secretsLoader";
import type { AiAnalysisMode } from "../types/ai";
import {
  resolveApiProvider,
  resolveGeminiModel,
  resolveAnthropicModel,
} from "./settings/migrations";

// Removed MarketDataInterval as it is legacy (WebSockets preferred)
export type HotkeyMode = "mode1" | "mode2" | "mode3" | "custom";
export type PositionViewMode = "detailed" | "focus";
export type PnlViewMode = "value" | "percent" | "bar";
export type AiProvider = "ollama" | "openrouter" | "openai" | "gemini" | "anthropic";
export type BackgroundType =
  | "none"
  | "image"
  | "video"
  | "animation"
  | "threejs"
  | "tradeflow";
export type BackgroundAnimationPreset =
  | "none"
  | "gradient"
  | "particles"
  | "breathing"
  | "waves"
  | "aurora";
export type AnimationIntensity = "low" | "medium" | "high";
export type AnalysisDepth = "quick" | "standard" | "deep";
export type AmbientToplineMode =
  | "symbol_orderflow"
  | "market_momentum"
  | "risk_health";
export type AmbientToplineIntensity = "subtle" | "standard" | "vibrant";

export type MarketMode = "performance" | "balanced" | "pro" | "custom";
export type TechnicalsUpdateMode =
  | "realtime"
  | "fast"
  | "balanced"
  | "conservative";
export type HeatmapMode =
  | "coinglass_new_tab"
  | "coinglass_popup"
  | "coinank_new_tab"
  | "coinank_popup";

export const TECHNICALS_UPDATE_PRESETS = {
  realtime: {
    interval: 100,
    cacheSize: 30,
    cacheTTL: 10,
    historyLimit: 500,
    description: "Maximum responsiveness, higher CPU usage",
  },
  fast: {
    interval: 250,
    cacheSize: 20,
    cacheTTL: 30,
    historyLimit: 750,
    description: "Fast updates, moderate CPU usage",
  },
  balanced: {
    interval: 500,
    cacheSize: 15,
    cacheTTL: 60,
    historyLimit: 750,
    description: "Balanced performance and accuracy",
  },
  conservative: {
    interval: 2000,
    cacheSize: 10,
    cacheTTL: 300,
    historyLimit: 500,
    description: "Lower CPU usage, slower updates",
  },
} as const;

export interface ApiKeys {
  key: string;
  secret: string;
  passphrase?: string;
}

export interface GalaxySettings {
  particleCount: number;
  particleSize: number;
  radius: number;
  branches: number;
  spin: number;
  randomness: number;
  randomnessPower: number;
  concentrationPower: number;
  camPos: { x: number; y: number; z: number };
  galaxyRot: { x: number; y: number; z: number };
  autoCenter: boolean;
  enableGyroscope: boolean;
  rotationSpeed: number;
}

export interface TradeFlowSettings {
  speed: number;
  particleCount: number; // Legacy total count, might derive from width/height
  size: number;
  spread: number;
  layout: "grid";
  colorMode: "theme" | "custom";
  customColorUp: string;
  customColorDown: string;
  minVolume: number;
  // New Settings
  gridWidth: number;
  gridLength: number;
  enableAtmosphere: boolean;
  volumeScale: number; // Factor to scale volume mapping
  flowMode: "equalizer" | "raindrops" | "city" | "sonar" | "block";
  persistenceDuration: number;
  cameraHeight: number;
  cameraDistance: number;
  cameraPositionX: number;
  cameraRotationX: number;
  cameraRotationY: number;
  cameraRotationZ: number;
}

export interface Settings {
  apiProvider: "bitunix" | "bitget";
  appAccessToken?: string;
  autoUpdatePriceInput: boolean;
  autoFetchBalance: boolean;
  showSidebars: boolean;
  showTechnicals: boolean;
  showIndicatorParams: boolean;
  hideUnfilledOrders: boolean;
  /**
   * Whether simulated fills from paper trading (FEAT-0012) are written to the
   * journal. On by default: reviewing them afterwards is most of the point of
   * paper trading. They are always marked `isPaper` and are excluded from
   * every performance statistic and from the FEAT-0013 daily-loss counter,
   * whichever way this is set.
   */
  journalPaperTrades: boolean;
  positionViewMode?: PositionViewMode;
  pnlViewMode?: PnlViewMode;
  isPro: boolean;
  feePreference: "maker" | "taker";
  hotkeyMode: HotkeyMode;
  apiKeys: {
    bitunix: ApiKeys;
    bitget: ApiKeys;
  };
  encryptedApiKeys?: {
    bitunix?: EncryptedBlob;
    bitget?: EncryptedBlob;
  };
  encryptedSecrets?: Record<string, EncryptedBlob>;
  isEncrypted?: boolean;
  customHotkeys: Record<string, string>;
  favoriteTimeframes: string[];
  favoriteSymbols: string[];
  syncRsiTimeframe: boolean;
  imgbbApiKey: string;
  imgbbExpiration: number;
  isDeepDiveUnlocked?: boolean;
  imgurClientId?: string;
  /**
   * Global Chat over SpacetimeDB. Class B under ADR-0001, so it is opt-in and
   * off by default: nothing connects until the user turns this on and supplies
   * a token.
   */
  cloudEnabled: boolean;
  /** SpacetimeDB host, e.g. `http://127.0.0.1:3000` for a local module. */
  cloudHost: string;
  /** SpacetimeDB module name the client subscribes to. */
  cloudDbName: string;
  /**
   * SpacetimeDB connection token. Class A: it stays in this browser and is only
   * ever sent to the host configured above. Encrypted with the master password
   * like every other credential.
   */
  cloudToken: string;
  showSidebarActivity: boolean;
  sidePanelMode: "chat" | "notes" | "ai";
  chatStyle: "minimal" | "bubble" | "terminal";
  maxPrivateNotes: number;
  customSystemPrompt: string;
  aiProvider: AiProvider;
  openaiApiKey: string;
  openaiModel: string;
  geminiApiKey: string;
  geminiModel: string;
  anthropicApiKey: string;
  anthropicModel: string;
  ollamaBaseUrl: string;
  ollamaModel: string;
  openrouterApiKey: string;
  openrouterModel: string;
  analysisDepth: AnalysisDepth;
  aiConfirmActions: boolean;
  aiAllowSettingsChanges: boolean;
  aiTradeHistoryLimit: number;
  aiShareTradeContext: boolean;
  aiConfirmClear: boolean;
  aiAnalysisMode: AiAnalysisMode;
  showSpinButtons: boolean | "hover";
  disclaimerAccepted: boolean;
  useUtcDateParsing: boolean;
  forceEnglishTechnicalTerms: boolean;
  debugMode: boolean;
  syncFavorites: boolean;
  confirmTradeDeletion: boolean;
  confirmBulkDeletion: boolean;
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
  newsOpenBehavior: "smart" | "reader" | "new_tab" | "window";
  enableNewsAnalysis: boolean;
  cmcApiKey?: string;
  enableCmcContext: boolean;
  showMarketOverviewLinks: boolean;
  showMarketOverview: boolean; // Toggle for tile visibility
  showMarketActivity: boolean;
  marketAnalysisInterval: number;
  pauseAnalysisOnBlur: boolean;
  analysisTimeframes: string[]; // e.g. ["5m", "15m", "1h", "4h"]
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
  heatmapMode: HeatmapMode;
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
  galaxySettings: GalaxySettings;
  tradeFlowSettings: TradeFlowSettings;
  /**
   * Opt-out switch for behavioural telemetry (BUG-0286). Tracking runs by
   * default on anonymized, first-party measurement (IP anonymization,
   * self-hosted at s.cachy.app); turning this off stops every event push
   * immediately. Because measurement is anonymous and an opt-out exists, no
   * cookie notice is shown.
   */
  enableTelemetry: boolean;
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

  // Burning Borders
  enableBurningBorders: boolean;
  borderEffect: "fire" | "glow";
  borderEffectColorMode: "theme" | "interactive" | "custom" | "classic";
  borderEffectCustomColor: string;
  burningBordersIntensity: AnimationIntensity;
  burnCharts: boolean;
  burnModals: boolean;
  burnChannels: boolean;
  burnMarketOverviewTiles: boolean;
  burnFlashCards: boolean;
  burnJournal: boolean;
  burnNewsWindows?: boolean;
  burnChannelWindows?: boolean;
  burnSettings?: boolean;
  burnGuide?: boolean;
  fireConfig: {
    speed: number;
    turbulence: number;
    thickness: number;
    coreHeat: number;
  };

  // Ambient Sentiment Topline
  enableAmbientTopline: boolean;
  ambientToplineMode: AmbientToplineMode;
  ambientToplineIntensity: AmbientToplineIntensity;
  ambientToplineBursts: boolean;

  // Market & Performance Settings
  marketMode: MarketMode;
  analyzeAllFavorites: boolean; // if false, only top 4
  marketCacheSize: number; // LRU cache size for market data (default: 20)

  // Technicals Performance Settings
  technicalsUpdateMode: TechnicalsUpdateMode;
  technicalsUpdateInterval?: number; // Custom interval in ms (optional override)
  technicalsCacheSize: number; // Separate cache size for technicals
  technicalsCacheTTL: number; // Cache TTL in seconds
  maxTechnicalsHistory: number; // Max klines to keep in memory
  enableIndicatorOptimization: boolean; // Only calculate enabled indicators
  chartHistoryLimit: number; // Max candles to load on chart (200-20000)
  chartRenderIntervalMs: number; // Candle chart render update interval in ms (20-500)
  repairTimeframe: string; // Timeframe used for ATR/MFE/MAE repair (default: 15m)

  // Individual Indicator Toggles
  // Removed enabledIndicators (handled via indicatorState instead)
  // Window Docking
  enableDockingCentered: boolean;
  dockingPosition: "top" | "bottom";
  autoTrading: boolean;
  multiAccount: boolean;
}

/**
 * Upper bound on favourite symbols. Each favourite costs a live subscription
 * plus a slot in the analyst's rotation, so this is a load ceiling, not a
 * cosmetic one.
 *
 * Single source of truth: favoritesState proxies this same list (BUG-0232 --
 * the two used to be separate stores with different limits, which is why the
 * dashboard showed symbols the analyst never touched).
 */
export const MAX_FAVORITE_SYMBOLS = 12;

const defaultSettings: Settings = {
  apiProvider: "bitunix",
  appAccessToken: "",
  marketAnalysisInterval: 60,
  pauseAnalysisOnBlur: true,
  analysisTimeframes: ["1h", "4h"],
  autoUpdatePriceInput: true,
  autoFetchBalance: false,
  showSidebars: true,
  showTechnicals: false,
  showIndicatorParams: false,
  hideUnfilledOrders: false,
  journalPaperTrades: true,
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
  imgbbApiKey: "25e953ac23d0704c1adc548c9a61b382",
  imgbbExpiration: 0,
  isDeepDiveUnlocked: false,
  // Class B defaults per ADR-0001: off, and pointing at a local module rather
  // than at any Cachy-operated server. Turning it on is a deliberate act.
  cloudEnabled: false,
  cloudHost: "http://127.0.0.1:3000",
  cloudDbName: "cachy-server",
  cloudToken: "",
  sidePanelMode: "ai",
  chatStyle: "minimal",
  customSystemPrompt: "",
  aiProvider: "gemini",
  openaiApiKey: "",
  openaiModel: "gpt-4o",
  geminiApiKey: "",
  geminiModel: "gemini-1.5-flash",
  anthropicApiKey: "",
  anthropicModel: "claude-sonnet-5",
  ollamaBaseUrl: "http://localhost:11434",
  ollamaModel: "",
  openrouterApiKey: "",
  openrouterModel: "",
  analysisDepth: "standard",
  aiConfirmActions: false,
  aiAllowSettingsChanges: false,
  aiTradeHistoryLimit: 50,
  aiShareTradeContext: false,
  aiAnalysisMode: "risk" as AiAnalysisMode,
  showSpinButtons: "hover",
  disclaimerAccepted: false,
  useUtcDateParsing: true,
  forceEnglishTechnicalTerms: false,
  debugMode: false,
  syncFavorites: true,
  confirmTradeDeletion: true,
  confirmBulkDeletion: true,
  maxPrivateNotes: 50,
  aiConfirmClear: true,
  fontFamily: "Inter",
  cryptoPanicApiKey: "",
  newsApiKey: "",
  cryptoPanicPlan: "developer",
  cryptoPanicFilter: "important",
  newsOpenBehavior: "smart",
  enableNewsAnalysis: true,
  cmcApiKey: "",
  enableCmcContext: false,
  showMarketOverviewLinks: true,
  showMarketOverview: true,
  showMarketActivity: true,
  showMarketSentiment: true,
  showSidebarActivity: true,
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
  heatmapMode: "coinglass_new_tab",
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
  backgroundOpacity: 1.0,
  backgroundBlur: 5,
  backgroundAnimationPreset: "none",
  backgroundAnimationIntensity: "medium",
  videoPlaybackSpeed: 1.0,
  tradeFlowSettings: {
    speed: 0.8,
    particleCount: 3000,
    size: 0.08,
    spread: 1.0,
    layout: "grid",
    colorMode: "theme",
    customColorUp: "#00ff88",
    customColorDown: "#ff4444",
    minVolume: 0,
    // New Settings (V3)
    flowMode: "equalizer",
    gridWidth: 80,
    gridLength: 160,
    enableAtmosphere: true,
    volumeScale: 1.0,
    persistenceDuration: 60,
    cameraHeight: 80,
    cameraDistance: 120,
    cameraPositionX: 0,
    cameraRotationX: 0,
    cameraRotationY: 0,
    cameraRotationZ: 0,
  } as TradeFlowSettings,
  galaxySettings: {
    particleCount: 20000,
    particleSize: 0.5,
    radius: 5,
    branches: 3,
    spin: 1.0,
    randomness: 1.0,
    randomnessPower: 3.0,
    concentrationPower: 1.5,
    camPos: { x: 0, y: 2, z: 5 },
    galaxyRot: { x: 0, y: 0, z: 0 },
    autoCenter: true,
    enableGyroscope: false,
    rotationSpeed: 0.1,
  },
  enableTelemetry: true,
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

  enableBurningBorders: false,
  borderEffect: "fire",
  borderEffectColorMode: "interactive",
  borderEffectCustomColor: "#ff8800",
  burningBordersIntensity: "medium",
  burnCharts: false,
  burnModals: false,
  burnChannels: false,
  burnMarketOverviewTiles: true,
  burnFlashCards: true,
  burnJournal: false,
  fireConfig: {
    speed: 1.0,
    turbulence: 1.0,
    thickness: 20.0,
    coreHeat: 0.8,
  },

  enableAmbientTopline: false,
  ambientToplineMode: "symbol_orderflow",
  ambientToplineIntensity: "standard",
  ambientToplineBursts: true,

  marketMode: "balanced",
  analyzeAllFavorites: false, // Default to top 4 only for balanced
  marketCacheSize: 20, // Default LRU cache size

  // Technicals Performance Defaults
  technicalsUpdateMode: "balanced",
  technicalsUpdateInterval: undefined,
  technicalsCacheSize: 20,
  technicalsCacheTTL: 60, // 1 minute
  maxTechnicalsHistory: 750,
  enableIndicatorOptimization: true,
  chartHistoryLimit: 2000,
  chartRenderIntervalMs: 0,
  repairTimeframe: "15m",

  // Core indicators enabled by default
  // Removed enabledIndicators (handled via indicatorState instead)
  autoTrading: false,
  multiAccount: false,
  enableDockingCentered: true,
  dockingPosition: "top",
};

export class SettingsManager {
  tradeFlowSettings = $state<TradeFlowSettings>(
    defaultSettings.tradeFlowSettings,
  );
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
  appAccessToken = $state<string>(defaultSettings.appAccessToken || "");
  autoUpdatePriceInput = $state<boolean>(defaultSettings.autoUpdatePriceInput);
  autoFetchBalance = $state<boolean>(defaultSettings.autoFetchBalance);
  showSidebars = $state<boolean>(defaultSettings.showSidebars);
  showTechnicals = $state<boolean>(defaultSettings.showTechnicals);
  showIndicatorParams = $state<boolean>(defaultSettings.showIndicatorParams);
  hideUnfilledOrders = $state<boolean>(defaultSettings.hideUnfilledOrders);
  journalPaperTrades = $state<boolean>(defaultSettings.journalPaperTrades);
  positionViewMode = $state<PositionViewMode | undefined>(
    defaultSettings.positionViewMode,
  );
  pnlViewMode = $state<PnlViewMode | undefined>(defaultSettings.pnlViewMode);
  feePreference = $state<"maker" | "taker">(defaultSettings.feePreference);
  hotkeyMode = $state<HotkeyMode>(defaultSettings.hotkeyMode);
  /**
   * Edition/entitlement state (isPro, isProLicenseActive, the capability
   * map) lives in its own store (FEAT-0197 PR 2) -- this is the one accessor
   * every consumer outside this file reaches it through.
   */
  readonly entitlement = new EntitlementStore(
    () => this.apiKeys,
    () => this.apiProvider,
    () => this.autoTrading,
    () => this.multiAccount,
    () => this.showMarketActivity,
  );
  /** Encrypted-credential handling and the secretsReady handshake (FEAT-0197 PR 3). */
  private readonly secretsLoader = new SecretsLoader();
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

  cloudEnabled = $state<boolean>(defaultSettings.cloudEnabled);
  cloudHost = $state<string>(defaultSettings.cloudHost);
  cloudDbName = $state<string>(defaultSettings.cloudDbName);
  cloudToken = $state<string>(defaultSettings.cloudToken);
  sidePanelMode = $state<"chat" | "notes" | "ai">(
    defaultSettings.sidePanelMode,
  );
  chatStyle = $state<"minimal" | "bubble" | "terminal">(
    defaultSettings.chatStyle,
  );
  maxPrivateNotes = $state<number>(defaultSettings.maxPrivateNotes);

  customSystemPrompt = $state<string>(defaultSettings.customSystemPrompt);
  aiProvider = $state<AiProvider>(defaultSettings.aiProvider);
  // These three intentionally have no `import.meta.env.VITE_*_API_KEY`
  // fallback. Vite inlines every VITE_-prefixed variable into the client bundle
  // at build time, so such a default would serve the operator's AI keys as plain
  // JavaScript to every visitor of a production build. AI keys are Class A data
  // under ADR-0001: each user enters their own in Settings → AI, and it stays in
  // that browser. See docs/archive/engineering-log-2026-h1.md item 24a.
  openaiApiKey = $state<string>(defaultSettings.openaiApiKey);
  openaiModel = $state<string>(defaultSettings.openaiModel);
  geminiApiKey = $state<string>(defaultSettings.geminiApiKey);
  geminiModel = $state<string>(defaultSettings.geminiModel);
  anthropicApiKey = $state<string>(defaultSettings.anthropicApiKey);
  anthropicModel = $state<string>(defaultSettings.anthropicModel);
  // No API key: Ollama is the user's own local (or self-hosted) instance.
  ollamaBaseUrl = $state<string>(defaultSettings.ollamaBaseUrl);
  ollamaModel = $state<string>(defaultSettings.ollamaModel);
  openrouterApiKey = $state<string>(defaultSettings.openrouterApiKey);
  openrouterModel = $state<string>(defaultSettings.openrouterModel);
  analysisDepth = $state<AnalysisDepth>(defaultSettings.analysisDepth);
  aiConfirmActions = $state<boolean>(defaultSettings.aiConfirmActions);
  aiAllowSettingsChanges = $state<boolean>(defaultSettings.aiAllowSettingsChanges);
  aiTradeHistoryLimit = $state<number>(defaultSettings.aiTradeHistoryLimit);
  aiShareTradeContext = $state<boolean>(defaultSettings.aiShareTradeContext);
  aiConfirmClear = $state<boolean>(defaultSettings.aiConfirmClear);
  aiAnalysisMode = $state<AiAnalysisMode>(defaultSettings.aiAnalysisMode);

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
  newsOpenBehavior = $state<"smart" | "reader" | "new_tab" | "window">(
    defaultSettings.newsOpenBehavior,
  );
  enableNewsAnalysis = $state<boolean>(defaultSettings.enableNewsAnalysis);
  cmcApiKey = $state<string | undefined>(defaultSettings.cmcApiKey);
  enableCmcContext = $state<boolean>(defaultSettings.enableCmcContext);
  showMarketOverviewLinks = $state<boolean>(
    defaultSettings.showMarketOverviewLinks,
  );
  showMarketOverview = $state<boolean>(defaultSettings.showMarketOverview);
  showMarketActivity = $state<boolean>(defaultSettings.showMarketActivity);
  marketAnalysisInterval = $state<number>(
    defaultSettings.marketAnalysisInterval,
  );
  pauseAnalysisOnBlur = $state<boolean>(defaultSettings.pauseAnalysisOnBlur);
  analysisTimeframes = $state<string[]>(defaultSettings.analysisTimeframes);
  showSidebarActivity = $state<boolean>(defaultSettings.showSidebarActivity);
  get effectiveShowSidebarActivity() {
    const hasBitgetKeys = Boolean(
      this.apiKeys?.bitget?.key &&
      this.apiKeys?.bitget?.secret &&
      this.apiKeys?.bitget?.passphrase,
    );
    const hasBitunixKeys = Boolean(
      this.apiKeys?.bitunix?.key && this.apiKeys?.bitunix?.secret,
    );
    const hasApiKeys =
      this.apiProvider === "bitget" ? hasBitgetKeys : hasBitunixKeys;

    return (this.entitlement.isPro || hasApiKeys) && this.showSidebarActivity;
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
  heatmapMode = $state<HeatmapMode>(defaultSettings.heatmapMode);
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
  galaxySettings = $state(defaultSettings.galaxySettings);
  enableTelemetry = $state<boolean>(defaultSettings.enableTelemetry);
  enableNetworkLogs = $state<boolean>(defaultSettings.enableNetworkLogs);
  logSettings = $state(defaultSettings.logSettings);

  // Social Media
  discordBotToken = $state<string | undefined>(defaultSettings.discordBotToken);
  discordChannels = $state<string[]>(defaultSettings.discordChannels);

  enableBurningBorders = $state<boolean>(defaultSettings.enableBurningBorders);
  borderEffect = $state<"fire" | "glow">(
    defaultSettings.borderEffect || "fire",
  );
  borderEffectColorMode = $state<
    "theme" | "interactive" | "custom" | "classic"
  >(defaultSettings.borderEffectColorMode);
  borderEffectCustomColor = $state<string>(
    defaultSettings.borderEffectCustomColor,
  );
  burningBordersIntensity = $state<AnimationIntensity>(
    defaultSettings.burningBordersIntensity,
  );
  burnCharts = $state<boolean>(defaultSettings.burnCharts);
  burnModals = $state<boolean>(defaultSettings.burnModals);
  burnChannels = $state<boolean>(defaultSettings.burnChannels);
  burnMarketOverviewTiles = $state<boolean>(
    defaultSettings.burnMarketOverviewTiles,
  );
  burnFlashCards = $state<boolean>(defaultSettings.burnFlashCards);
  burnJournal = $state<boolean>(defaultSettings.burnJournal);

  enableAmbientTopline = $state<boolean>(defaultSettings.enableAmbientTopline);
  ambientToplineMode = $state<AmbientToplineMode>(
    defaultSettings.ambientToplineMode,
  );
  ambientToplineIntensity = $state<AmbientToplineIntensity>(
    defaultSettings.ambientToplineIntensity,
  );
  ambientToplineBursts = $state<boolean>(defaultSettings.ambientToplineBursts);

  fireConfig = $state(defaultSettings.fireConfig);

  updateFireConfig(newConfig: Partial<Settings["fireConfig"]>) {
    this.fireConfig = { ...this.fireConfig, ...newConfig };
  }

  resetGalaxySettings() {
    this.galaxySettings = {
      ...defaultSettings.galaxySettings,
    };
    this.backgroundOpacity = 1;
    this.backgroundBlur = 0;
  }

  resetTradeFlowSettings() {
    this.tradeFlowSettings = {
      ...defaultSettings.tradeFlowSettings,
    };
  }

  // Market & Performance State
  private _marketMode = $state<MarketMode>(defaultSettings.marketMode);
  analyzeAllFavorites = $state<boolean>(defaultSettings.analyzeAllFavorites);
  marketCacheSize = $state<number>(defaultSettings.marketCacheSize);

  // Technicals Performance State
  technicalsUpdateMode = $state<TechnicalsUpdateMode>(
    defaultSettings.technicalsUpdateMode,
  );
  technicalsUpdateInterval = $state<number | undefined>(
    defaultSettings.technicalsUpdateInterval,
  );
  technicalsCacheSize = $state<number>(defaultSettings.technicalsCacheSize);
  technicalsCacheTTL = $state<number>(defaultSettings.technicalsCacheTTL);
  maxTechnicalsHistory = $state<number>(defaultSettings.maxTechnicalsHistory);
  enableIndicatorOptimization = $state<boolean>(
    defaultSettings.enableIndicatorOptimization,
  );
  chartHistoryLimit = $state<number>(defaultSettings.chartHistoryLimit);
  chartRenderIntervalMs = $state<number>(defaultSettings.chartRenderIntervalMs);
  repairTimeframe = $state<string>(defaultSettings.repairTimeframe);
  autoTrading = $state<boolean>(defaultSettings.autoTrading);
  multiAccount = $state<boolean>(defaultSettings.multiAccount);

  enableDockingCentered = $state<boolean>(
    defaultSettings.enableDockingCentered,
  );
  dockingPosition = $state<"top" | "bottom">(defaultSettings.dockingPosition);

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
    } else if (mode === "balanced") {
      this.marketAnalysisInterval = 300; // 5 minutes
      this.enableNewsAnalysis = true;
      this.showMarketActivity = true;
      this.analyzeAllFavorites = false; // Only Top 4
    } else if (mode === "pro") {
      this.marketAnalysisInterval = 60; // 1 minute
      this.enableNewsAnalysis = true;
      this.showMarketActivity = true;
      this.analyzeAllFavorites = true; // All 12
    }
    // "custom" touches nothing, user decides
  }
  // Private state
  private effectActive = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private effectCleanup: (() => void) | null = null;
  private saveLock = false; // Prevents concurrent saves

  /**
   * True while the obfuscation-mode background decryption of
   * `encryptedApiKeys` is still in flight (BUG-0280). Until it settles the
   * live credential fields are not yet refilled, so a save must preserve
   * existing blobs instead of reading the empty fields as "user cleared
   * the keys" and deleting them.
   */
  private apiKeyDecryptPending = false;

  /**
   * Set by `load()` when legacy plaintext exchange credentials were found in
   * storage (pre-BUG-0280 blobs). The constructor fires one immediate save
   * so the migration to device-key ciphertext happens on first launch, not
   * at the next unrelated settings change.
   */
  private migrateLegacyApiKeys = false;

  // Security State
  encryptedApiKeys = $state<Settings["encryptedApiKeys"]>(undefined);
  encryptedSecrets = $state<Settings["encryptedSecrets"]>(undefined);
  isEncrypted = $state(false);
  isLocked = $state(false);
  decryptionFailures = $state(0);

  /**
   * True when the device-key canary could not be decrypted: the browser lost
   * the IndexedDB key and every stored secret is unrecoverable until
   * re-entered. Distinct from `decryptionFailures > 0`, which also covers
   * single corrupted blobs while the key itself is fine.
   */
  deviceKeyLost = $state(false);

  /**
   * Resolves once `load()` has restored the encrypted secrets into memory.
   *
   * Decrypting them is asynchronous — it needs the device key from IndexedDB
   * and then WebCrypto — while the auto-fetches on mount are not. Without this
   * gate they raced the decryption and went out with an empty
   * `appAccessToken`, so every `checkAppAuth`-guarded route answered 401 on
   * page load while the very same request succeeded once clicked by hand.
   *
   * `appFetch` awaits this before sending. It always settles: in
   * master-password mode there is nothing to wait for (the vault is locked and
   * stays locked until the user unlocks it), and a failed decryption resolves
   * too rather than blocking every request forever.
   */
  readonly secretsReady: Promise<void>;
  private resolveSecretsReady: () => void = () => {};

  constructor() {
    this.secretsReady = new Promise((resolve) => {
      this.resolveSecretsReady = resolve;
    });

    if (!browser) {
      // Server-side render: no localStorage to restore from.
      this.resolveSecretsReady();
      return;
    }

    {
      // 1. Load settings synchronously (effectActive is false, so no saves)
      this.load();

      // 2. Register $effect for auto-saving and notifications
      this.effectActive = true;

      this.effectCleanup = $effect.root(() => {
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
            }, 500);
          });
        });
      });

      // BUG-0280 one-time migration: legacy plaintext exchange keys found on
      // load are re-encrypted immediately instead of waiting for the next
      // unrelated settings change (the save itself is a no-op write once the
      // stored blob is already ciphertext, so later boots stay read-only).
      if (this.migrateLegacyApiKeys) void this.save();

      if (import.meta.env.DEV) {
        console.warn("[Settings] Store ready. Provider:", this.apiProvider);
      }

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
            // Re-enable in next tick to allow reactivity to settle
            setTimeout(() => {
              this.effectActive = true;
            }, 0);
          } else {
            if (import.meta.env.DEV) {
              console.warn("[Settings] Ignoring storage event during save");
            }
          }
        }
      });
    }
  }

  // --- Security Methods ---

  async unlock(password: string): Promise<boolean> {
    const success = await cryptoService.unlockSession(password);
    if (!success) return false;

    let aborted = false;
    try {
      const tasks: Promise<void>[] = [];

      // 1. Decrypt Exchange Keys
      if (this.encryptedApiKeys) {
        const eak = this.encryptedApiKeys;
        if (eak.bitunix) {
          tasks.push(
            (async () => {
              const json = await cryptoService.decrypt(eak.bitunix!);
              if (aborted) return;
              this.apiKeys.bitunix = JSON.parse(json);
            })(),
          );
        }
        if (eak.bitget) {
          tasks.push(
            (async () => {
              const json = await cryptoService.decrypt(eak.bitget!);
              if (aborted) return;
              this.apiKeys.bitget = JSON.parse(json);
            })(),
          );
        }
      }

      // 2. Decrypt Generic Secrets
      let failures = 0;
      if (this.encryptedSecrets) {
        const decryptTasks = Object.entries(this.encryptedSecrets)
          .filter(([key]) => SENSITIVE_KEYS.includes(key as keyof Settings))
          .map(async ([key, blob]) => {
            try {
              const decrypted = await cryptoService.decrypt(
                blob as EncryptedBlob,
              ); // Use session key
              if (aborted) return;
              // @ts-expect-error -- dynamic index over SENSITIVE_KEYS, which TypeScript cannot narrow to a writable key
              this[key] = decrypted;
            } catch (e) {
              failures++;
              console.error("[Settings] Failed to decrypt secret " + key, e);
            }
          });
        tasks.push(...decryptTasks);
      }

      await Promise.all(tasks);
      this.decryptionFailures = failures;

      this.isLocked = false;
      return true;
    } catch (e) {
      aborted = true;
      console.error("Unlock failed", e);
      this.lock();
      return false;
    }
  }

  lock() {
    if (this.isEncrypted) {
      this.apiKeys = {
        bitunix: { key: "", secret: "" },
        bitget: { key: "", secret: "", passphrase: "" },
      };

      // Clear generic secrets from memory
      for (const key of SENSITIVE_KEYS) {
        // @ts-expect-error -- dynamic index over SENSITIVE_KEYS, which TypeScript cannot narrow to a writable key
        this[key] = "";
      }

      cryptoService.lockSession();
      this.isLocked = true;
    }
  }

  async setMasterPassword(password: string) {
    if (!browser) return;
    const success = await cryptoService.unlockSession(password);
    if (!success)
      throw new Error("Failed to unlock session with provided password");

    try {
      // 1. Encrypt Exchange Keys into temp variables
      let bitunixBlob: EncryptedBlob | undefined;
      let bitgetBlob: EncryptedBlob | undefined;
      const newSecrets: Record<string, EncryptedBlob> = {};

      const tasks: Promise<void>[] = [];

      tasks.push(
        (async () => {
          bitunixBlob = await cryptoService.encrypt(
            JSON.stringify(this.apiKeys.bitunix),
          );
        })(),
      );

      tasks.push(
        (async () => {
          bitgetBlob = await cryptoService.encrypt(
            JSON.stringify(this.apiKeys.bitget),
          );
        })(),
      );

      // 2. Encrypt Generic Secrets (move from Device Key/Plain to Master Key)
      // We assume current 'this[key]' contains valid plain text (decrypted via Device Key or user input)
      const genericEncryptionTasks = SENSITIVE_KEYS.map(async (key) => {
        // @ts-expect-error -- dynamic index over SENSITIVE_KEYS, which TypeScript cannot narrow to a readable key
        const value = this[key];
        if (typeof value === "string" && value.length > 0) {
          // Encrypt with Session Key (implied)
          const blob = await cryptoService.encrypt(value);
          newSecrets[key] = blob;
        }
      });
      tasks.push(...genericEncryptionTasks);

      // Only commit state after all encryptions succeed (atomic update)
      await Promise.all(tasks);

      this.encryptedApiKeys = { bitunix: bitunixBlob, bitget: bitgetBlob };
      this.encryptedSecrets = newSecrets;
      this.isEncrypted = true;
      this.isLocked = false;
      await this.save();
    } catch (e) {
      // Clean up the session key so we don't leave a dangling unlocked session
      cryptoService.lockSession();
      console.error("[Settings] Failed to set master password", e);
      throw e;
    }
  }

  private load() {
    // Set when the background decryption below takes over responsibility for
    // resolving `secretsReady`. Every other path through load() resolves it
    // itself, so a caller awaiting it is never left hanging.
    let secretsPending = false;

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

      // Set the private field directly during load to avoid dual logging
      this._apiProvider = resolveApiProvider(merged.apiProvider);

      // Granular updates for apiKeys to preserve object references if components bind to them
      const apiKeyResult = this.secretsLoader.applyApiKeys(merged, this.apiKeys);
      this.isEncrypted = apiKeyResult.isEncrypted;
      this.isLocked = apiKeyResult.isLocked;
      this.encryptedApiKeys = apiKeyResult.encryptedApiKeys;
      this.apiKeys = apiKeyResult.apiKeys;

      // BUG-0280 migration flag: storage predating the fix kept exchange
      // credentials as plaintext whenever no master password was set. They
      // stay usable in memory (above); the constructor's immediate save
      // re-persists them as device-key ciphertext on first launch.
      this.migrateLegacyApiKeys =
        !this.isEncrypted &&
        !(merged.encryptedApiKeys && Object.keys(merged.encryptedApiKeys).length > 0) &&
        (apiKeyHasMaterial(merged.apiKeys?.bitunix) ||
          apiKeyHasMaterial(merged.apiKeys?.bitget));

      // Security: Load Encrypted Secrets (Generic) and the device-key-
      // encrypted exchange keys (BUG-0280). Both decrypt against the device
      // key in obfuscation mode. load() stays synchronous: fire-and-forget
      // background tasks with a single `secretsReady` release once every
      // task settled, success or failure.
      if (!this.isEncrypted) {
        this.decryptionFailures = 0;
        const backgroundTasks: Promise<unknown>[] = [];
        let apiKeyFailures = 0;

        const eak = merged.encryptedApiKeys;
        if (eak && Object.keys(eak).length > 0) {
          this.apiKeyDecryptPending = true;
          backgroundTasks.push(
            this.secretsLoader
              .decryptApiKeysWithDeviceKey(eak)
              .then((restored) => {
                apiKeyFailures = restored.failures;
                // Refill only fields nothing else has populated; typed-but-
                // unsaved credentials win over the stored ciphertext.
                if (
                  restored.bitunix &&
                  !apiKeyHasMaterial(this.apiKeys.bitunix)
                ) {
                  this.apiKeys.bitunix = restored.bitunix;
                }
                if (
                  restored.bitget &&
                  !apiKeyHasMaterial(this.apiKeys.bitget)
                ) {
                  this.apiKeys.bitget = restored.bitget;
                }
              })
              .catch((e) => {
                console.error(
                  "[Settings] Failed to initialize API key decryption",
                  e,
                );
              })
              .finally(() => {
                this.apiKeyDecryptPending = false;
              }),
          );
        }

        if (merged.encryptedSecrets) {
          this.encryptedSecrets = merged.encryptedSecrets;

          backgroundTasks.push(
            this.secretsLoader
              .isDeviceKeyLost(this.encryptedSecrets)
              .then((lost) => {
                this.deviceKeyLost = lost;
              })
              .catch(() => {
                // Canary check is best-effort; a failed probe must not block
                // decryption or flip the flag without evidence.
                this.deviceKeyLost = false;
              }),
          );

          backgroundTasks.push(
            this.secretsLoader
              .decryptSecrets(this.encryptedSecrets, (key, value) => {
                // @ts-expect-error -- dynamic index over SENSITIVE_KEYS, which TypeScript cannot narrow to a writable key
                this[key] = value;
              })
              .then((failures) => {
                this.decryptionFailures = failures;
                if (failures === 0) this.deviceKeyLost = false;
              })
              .catch((e) => {
                this.decryptionFailures = SENSITIVE_KEYS.length;
                console.error(
                  "[Settings] Failed to initialize background decryption",
                  e,
                );
              }),
          );
        }

        if (backgroundTasks.length > 0) {
          secretsPending = true;
          void Promise.all(backgroundTasks).finally(() => {
            // Release waiters even when decryption failed — a request
            // without the token gets a clean 401, a request that never
            // fires hangs the UI.
            this.decryptionFailures += apiKeyFailures;
            this.resolveSecretsReady();
          });
        }
      }

      this.applyCoreFields(merged);
      this.applyDisplayFields(merged, parsed);
    } catch (e) {
      if (import.meta.env.DEV) {
        console.error("[Settings] Load failed, using defaults:", e);
      }
      // Save defaults to fix corrupted localStorage
      this.save();
    } finally {
      // The background decryption resolves this itself once it is done.
      if (!secretsPending) this.resolveSecretsReady();
    }
  }

  /** General, security and AI/market/technicals fields. Part of load()'s merge+assign step. */
  private applyCoreFields(merged: Settings) {
    this.appAccessToken = merged.appAccessToken ?? "";
    this.autoUpdatePriceInput = merged.autoUpdatePriceInput;
    this.autoFetchBalance = merged.autoFetchBalance;
    this.showSidebars = merged.showSidebars;
    this.showTechnicals = merged.showTechnicals;
    this.showIndicatorParams = merged.showIndicatorParams;
    this.hideUnfilledOrders = merged.hideUnfilledOrders;
    this.journalPaperTrades = merged.journalPaperTrades ?? defaultSettings.journalPaperTrades;
    this.positionViewMode = merged.positionViewMode;
    this.pnlViewMode = merged.pnlViewMode;
    this.entitlement.isPro = merged.isPro;
    this.feePreference = merged.feePreference;
    this.hotkeyMode = merged.hotkeyMode;

    this.customHotkeys = merged.customHotkeys || {};
    this.favoriteTimeframes = merged.favoriteTimeframes;
    // Strict limit on favorites to prevent memory overflow (User Agreement: 12)
    this.favoriteSymbols = (merged.favoriteSymbols || []).slice(0, MAX_FAVORITE_SYMBOLS);
    this.syncRsiTimeframe = merged.syncRsiTimeframe;
    this.imgbbApiKey = merged.imgbbApiKey;
    this.imgbbExpiration = merged.imgbbExpiration;
    this.isDeepDiveUnlocked = merged.isDeepDiveUnlocked;
    this.imgurClientId = merged.imgurClientId;
    this.cloudEnabled = merged.cloudEnabled;
    this.cloudHost = merged.cloudHost;
    this.cloudDbName = merged.cloudDbName;
    this.cloudToken = merged.cloudToken;
    this.sidePanelMode = merged.sidePanelMode;
    this.chatStyle = merged.chatStyle;
    this.maxPrivateNotes = merged.maxPrivateNotes;
    this.customSystemPrompt = merged.customSystemPrompt;
    this.aiProvider = merged.aiProvider;
    this.autoTrading = merged.autoTrading;
    this.multiAccount = merged.multiAccount;
    this.openaiApiKey = merged.openaiApiKey;
    this.openaiModel = merged.openaiModel;
    this.geminiApiKey = merged.geminiApiKey;
    this.geminiModel = resolveGeminiModel(merged.geminiModel);
    this.anthropicApiKey = merged.anthropicApiKey;
    this.anthropicModel = resolveAnthropicModel(merged.anthropicModel);
    this.ollamaBaseUrl = merged.ollamaBaseUrl || defaultSettings.ollamaBaseUrl;
    this.ollamaModel = merged.ollamaModel ?? defaultSettings.ollamaModel;
    this.openrouterApiKey = merged.openrouterApiKey ?? defaultSettings.openrouterApiKey;
    this.openrouterModel = merged.openrouterModel ?? defaultSettings.openrouterModel;
    this.analysisDepth = merged.analysisDepth;
    this.aiConfirmActions = merged.aiConfirmActions;
    this.aiAllowSettingsChanges = merged.aiAllowSettingsChanges;
    this.aiTradeHistoryLimit = merged.aiTradeHistoryLimit;
    this.aiShareTradeContext = merged.aiShareTradeContext ?? defaultSettings.aiShareTradeContext;
    this.aiConfirmClear = merged.aiConfirmClear;
    this.aiAnalysisMode = merged.aiAnalysisMode ?? defaultSettings.aiAnalysisMode;
    this.cryptoPanicApiKey = merged.cryptoPanicApiKey;
    this.newsApiKey = merged.newsApiKey;
    this.cryptoPanicPlan =
      merged.cryptoPanicPlan || defaultSettings.cryptoPanicPlan;
    this.cryptoPanicFilter =
      merged.cryptoPanicFilter || defaultSettings.cryptoPanicFilter;
    this.newsOpenBehavior =
      merged.newsOpenBehavior || defaultSettings.newsOpenBehavior;
    this.enableNewsAnalysis = merged.enableNewsAnalysis;
    this.cmcApiKey = merged.cmcApiKey;
    this.enableCmcContext = merged.enableCmcContext;

    this._marketMode = merged.marketMode || defaultSettings.marketMode;
    this.analyzeAllFavorites =
      merged.analyzeAllFavorites ?? defaultSettings.analyzeAllFavorites;
    this.marketCacheSize =
      merged.marketCacheSize ?? defaultSettings.marketCacheSize;

    this.technicalsUpdateMode =
      merged.technicalsUpdateMode ?? defaultSettings.technicalsUpdateMode;
    this.technicalsUpdateInterval = merged.technicalsUpdateInterval;
    this.technicalsCacheSize =
      merged.technicalsCacheSize ?? defaultSettings.technicalsCacheSize;
    this.technicalsCacheTTL =
      merged.technicalsCacheTTL ?? defaultSettings.technicalsCacheTTL;
    this.maxTechnicalsHistory =
      merged.maxTechnicalsHistory ?? defaultSettings.maxTechnicalsHistory;
    this.enableIndicatorOptimization =
      merged.enableIndicatorOptimization ??
      defaultSettings.enableIndicatorOptimization;
    this.chartHistoryLimit =
      merged.chartHistoryLimit ?? defaultSettings.chartHistoryLimit;
    this.chartRenderIntervalMs =
      merged.chartRenderIntervalMs ?? defaultSettings.chartRenderIntervalMs;
    this.repairTimeframe =
      merged.repairTimeframe || defaultSettings.repairTimeframe;
  }

  /** Display/UI, background customization and Burning Borders fields. Part of load()'s merge+assign step. */
  private applyDisplayFields(merged: Settings, rawParsed?: Partial<Settings>) {
    this.showSpinButtons = merged.showSpinButtons;
    this.disclaimerAccepted = merged.disclaimerAccepted;
    this.useUtcDateParsing = merged.useUtcDateParsing;
    this.forceEnglishTechnicalTerms = merged.forceEnglishTechnicalTerms;
    this.debugMode = merged.debugMode;
    this.syncFavorites = merged.syncFavorites;
    this.confirmTradeDeletion = merged.confirmTradeDeletion;
    this.confirmBulkDeletion = merged.confirmBulkDeletion;
    this.fontFamily = merged.fontFamily || defaultSettings.fontFamily;
    this.showMarketOverviewLinks = merged.showMarketOverviewLinks;
    this.showMarketOverview =
      merged.showMarketOverview ?? defaultSettings.showMarketOverview;
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
    this.heatmapMode = merged.heatmapMode || defaultSettings.heatmapMode;
    this.showBrokerLink =
      merged.showBrokerLink ?? defaultSettings.showBrokerLink;
    this.rssPresets = merged.rssPresets || defaultSettings.rssPresets || [];
    this.customRssFeeds =
      merged.customRssFeeds || defaultSettings.customRssFeeds || [];
    this.entitlement.isProLicenseActive =
      merged.isProLicenseActive ?? defaultSettings.isProLicenseActive;

    this.enableGlassmorphism =
      merged.enableGlassmorphism ?? defaultSettings.enableGlassmorphism;
    this.glassBlur = merged.glassBlur ?? defaultSettings.glassBlur;
    this.glassSaturate =
      merged.glassSaturate ?? defaultSettings.glassSaturate;
    this.glassOpacity = merged.glassOpacity ?? defaultSettings.glassOpacity;

    // Background Customization
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

    // Deep merge galaxy settings to ensure new fields (camPos, galaxyRot) are populated if missing in old storage
    this.galaxySettings = {
      ...defaultSettings.galaxySettings,
      ...(merged.galaxySettings || {}),
    };

    // Deep merge TradeFlow settings for persistence
    this.tradeFlowSettings = {
      ...defaultSettings.tradeFlowSettings,
      ...(merged.tradeFlowSettings || {}),
    };

    this.enableTelemetry =
      merged.enableTelemetry ?? defaultSettings.enableTelemetry;
    this.enableNetworkLogs =
      merged.enableNetworkLogs ?? defaultSettings.enableNetworkLogs;

    // Social Media
    this.discordBotToken = merged.discordBotToken;
    this.discordChannels =
      merged.discordChannels || defaultSettings.discordChannels;

    // Burning Borders Persistence
    this.enableBurningBorders =
      merged.enableBurningBorders ?? defaultSettings.enableBurningBorders;
    this.borderEffect = merged.borderEffect ?? defaultSettings.borderEffect;
    this.borderEffectColorMode =
      merged.borderEffectColorMode ?? defaultSettings.borderEffectColorMode;
    this.borderEffectCustomColor =
      merged.borderEffectCustomColor ??
      defaultSettings.borderEffectCustomColor;
    this.burningBordersIntensity =
      merged.burningBordersIntensity ??
      defaultSettings.burningBordersIntensity;
    this.burnCharts = rawParsed?.burnCharts ?? merged.burnCharts ?? defaultSettings.burnCharts;
    this.burnModals = rawParsed?.burnModals ?? merged.burnModals ?? defaultSettings.burnModals;
    this.burnChannels =
      rawParsed?.burnChannels ??
      rawParsed?.burnChannelWindows ??
      rawParsed?.burnNewsWindows ??
      merged.burnChannels ??
      defaultSettings.burnChannels;
    this.burnMarketOverviewTiles =
      rawParsed?.burnMarketOverviewTiles ??
      merged.burnMarketOverviewTiles ??
      defaultSettings.burnMarketOverviewTiles;
    this.burnFlashCards =
      rawParsed?.burnFlashCards ??
      merged.burnFlashCards ??
      defaultSettings.burnFlashCards;
    this.burnJournal = rawParsed?.burnJournal ?? merged.burnJournal ?? defaultSettings.burnJournal;
    this.fireConfig = {
      ...defaultSettings.fireConfig,
      ...(merged.fireConfig || {}),
    };

    this.enableAmbientTopline =
      merged.enableAmbientTopline ?? defaultSettings.enableAmbientTopline;
    this.ambientToplineMode =
      merged.ambientToplineMode || defaultSettings.ambientToplineMode;
    this.ambientToplineIntensity =
      merged.ambientToplineIntensity || defaultSettings.ambientToplineIntensity;
    this.ambientToplineBursts =
      merged.ambientToplineBursts ?? defaultSettings.ambientToplineBursts;

    this.enableDockingCentered =
      merged.enableDockingCentered ?? defaultSettings.enableDockingCentered;
    this.dockingPosition =
      merged.dockingPosition ?? defaultSettings.dockingPosition;

    // Legacy manual sync migration removed. WebSockets handle this now.
  }

  private async save() {
    if (!browser || !this.effectActive || this.saveLock) return;

    this.saveLock = true;

    try {
      const data = this.toJSON();

      // Determine encryption key: Device Key (obfuscation) or Session Key (master password)
      let encryptionPassword: string | CryptoKey | undefined = undefined;
      let canEncrypt = true;

      if (!this.isEncrypted) {
        // Obfuscation Mode: Use Device Key
        encryptionPassword = await this.secretsLoader.getDeviceKey(
          Object.keys(this.encryptedSecrets || {}).length > 0,
        );
      } else {
        // Master Password Mode: Use Session Key (implicit)
        // If locked, we cannot encrypt new data.
        if (this.isLocked || !cryptoService.isUnlocked()) {
          canEncrypt = false;
        }
      }

      await this.secretsLoader.applyFieldEncryption(
        data,
        canEncrypt,
        encryptionPassword,
      );

      // BUG-0280: encrypt the exchange credentials from the live state (the
      // serialized block above only ever carries placeholders). While the
      // background device-key decryption is still refilling the fields, an
      // existing blob must survive instead of being read as "cleared".
      await this.secretsLoader.applyApiKeyEncryption(
        data,
        $state.snapshot(this.apiKeys),
        canEncrypt,
        encryptionPassword,
        !this.apiKeyDecryptPending,
      );

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
      appAccessToken: this.appAccessToken,
      marketAnalysisInterval: this.marketAnalysisInterval,
      pauseAnalysisOnBlur: this.pauseAnalysisOnBlur,
      analysisTimeframes: $state.snapshot(this.analysisTimeframes),
      autoUpdatePriceInput: this.autoUpdatePriceInput,
      autoFetchBalance: this.autoFetchBalance,
      showSidebars: this.showSidebars,
      showTechnicals: this.showTechnicals,
      showIndicatorParams: this.showIndicatorParams,
      hideUnfilledOrders: this.hideUnfilledOrders,
      journalPaperTrades: this.journalPaperTrades,
      positionViewMode: this.positionViewMode,
      pnlViewMode: this.pnlViewMode,
      isPro: this.entitlement.isPro,
      feePreference: this.feePreference,
      hotkeyMode: this.hotkeyMode,
      // BUG-0280: exchange credentials never serialize, in either mode --
      // the block carries only placeholders. The $state.snapshot(...)
      // argument still deep-reads the live keys so the autosave $effect
      // keeps tracking credential edits.
      apiKeys: redactApiKeys($state.snapshot(this.apiKeys)),
      encryptedApiKeys: this.encryptedApiKeys
        ? $state.snapshot(this.encryptedApiKeys)
        : undefined,
      encryptedSecrets: this.encryptedSecrets
        ? $state.snapshot(this.encryptedSecrets)
        : undefined,
      isEncrypted: this.isEncrypted,
      customHotkeys: $state.snapshot(this.customHotkeys),
      favoriteTimeframes: $state.snapshot(this.favoriteTimeframes),
      favoriteSymbols: $state.snapshot(this.favoriteSymbols),
      syncRsiTimeframe: this.syncRsiTimeframe,
      imgbbApiKey: this.imgbbApiKey,
      imgbbExpiration: this.imgbbExpiration,
      isDeepDiveUnlocked: this.isDeepDiveUnlocked,
      imgurClientId: this.imgurClientId,
      cloudEnabled: this.cloudEnabled,
      cloudHost: this.cloudHost,
      cloudDbName: this.cloudDbName,
      cloudToken: this.cloudToken,
      sidePanelMode: this.sidePanelMode,
      chatStyle: this.chatStyle,
      maxPrivateNotes: this.maxPrivateNotes,
      customSystemPrompt: this.customSystemPrompt,
      aiProvider: this.aiProvider,
      openaiApiKey: this.openaiApiKey,
      openaiModel: this.openaiModel,
      geminiApiKey: this.geminiApiKey,
      geminiModel: this.geminiModel,
      anthropicApiKey: this.anthropicApiKey,
      anthropicModel: this.anthropicModel,
      ollamaBaseUrl: this.ollamaBaseUrl,
      ollamaModel: this.ollamaModel,
      openrouterApiKey: this.openrouterApiKey,
      openrouterModel: this.openrouterModel,
      analysisDepth: this.analysisDepth,
      aiConfirmActions: this.aiConfirmActions,
      aiAllowSettingsChanges: this.aiAllowSettingsChanges,
      aiTradeHistoryLimit: this.aiTradeHistoryLimit,
      aiShareTradeContext: this.aiShareTradeContext,
      aiConfirmClear: this.aiConfirmClear,
      aiAnalysisMode: this.aiAnalysisMode,
      showSpinButtons: this.showSpinButtons,
      disclaimerAccepted: this.disclaimerAccepted,
      useUtcDateParsing: this.useUtcDateParsing,
      forceEnglishTechnicalTerms: this.forceEnglishTechnicalTerms,
      debugMode: this.debugMode,
      syncFavorites: this.syncFavorites,
      confirmTradeDeletion: this.confirmTradeDeletion,
      confirmBulkDeletion: this.confirmBulkDeletion,
      enableBurningBorders: this.enableBurningBorders,
      borderEffect: this.borderEffect,
      borderEffectColorMode: this.borderEffectColorMode,
      borderEffectCustomColor: this.borderEffectCustomColor,
      burningBordersIntensity: this.burningBordersIntensity,
      burnCharts: this.burnCharts,
      burnModals: this.burnModals,
      burnChannels: this.burnChannels,
      burnMarketOverviewTiles: this.burnMarketOverviewTiles,
      burnFlashCards: this.burnFlashCards,
      burnJournal: this.burnJournal,
      enableAmbientTopline: this.enableAmbientTopline,
      ambientToplineMode: this.ambientToplineMode,
      ambientToplineIntensity: this.ambientToplineIntensity,
      ambientToplineBursts: this.ambientToplineBursts,
      fireConfig: $state.snapshot(this.fireConfig),
      fontFamily: this.fontFamily,
      cryptoPanicApiKey: this.cryptoPanicApiKey,
      newsApiKey: this.newsApiKey,
      cryptoPanicPlan: this.cryptoPanicPlan,
      cryptoPanicFilter: this.cryptoPanicFilter,
      newsOpenBehavior: this.newsOpenBehavior,
      enableNewsAnalysis: this.enableNewsAnalysis,
      cmcApiKey: this.cmcApiKey,
      enableCmcContext: this.enableCmcContext,
      showMarketOverviewLinks: this.showMarketOverviewLinks,
      showMarketOverview: this.showMarketOverview,
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
      heatmapMode: this.heatmapMode,
      showBrokerLink: this.showBrokerLink,
      rssPresets: $state.snapshot(this.rssPresets),
      customRssFeeds: $state.snapshot(this.customRssFeeds),
      isProLicenseActive: this.entitlement.isProLicenseActive,
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
      galaxySettings: $state.snapshot(this.galaxySettings),
      tradeFlowSettings: $state.snapshot(this.tradeFlowSettings),
      enableTelemetry: this.enableTelemetry,
      enableNetworkLogs: this.enableNetworkLogs,
      logSettings: $state.snapshot(this.logSettings),
      discordBotToken: this.discordBotToken,
      discordChannels: $state.snapshot(this.discordChannels),
      marketMode: this.marketMode,
      analyzeAllFavorites: this.analyzeAllFavorites,
      marketCacheSize: this.marketCacheSize,
      technicalsUpdateMode: this.technicalsUpdateMode,
      technicalsUpdateInterval: this.technicalsUpdateInterval,
      technicalsCacheSize: this.technicalsCacheSize,
      technicalsCacheTTL: this.technicalsCacheTTL,
      maxTechnicalsHistory: this.maxTechnicalsHistory,
      autoTrading: this.autoTrading,
      multiAccount: this.multiAccount,
      enableIndicatorOptimization: this.enableIndicatorOptimization,
      chartHistoryLimit: this.chartHistoryLimit,
      chartRenderIntervalMs: this.chartRenderIntervalMs,
      repairTimeframe: this.repairTimeframe,
      enableDockingCentered: this.enableDockingCentered,
      dockingPosition: this.dockingPosition,
    };
  }

  update(fn: (s: Settings) => Partial<Settings>) {
    const current = this.toJSON();
    const updates = fn(current);
    Object.assign(this, updates);
  }

  destroy() {
    this.effectActive = false;
    if (this.effectCleanup) {
      this.effectCleanup();
      this.effectCleanup = null;
    }
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
  }
}

export const settingsState = new SettingsManager();

// HMR: Cleanup on module disposal to prevent timers and effect leaks
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    settingsState.destroy();
  });
}
