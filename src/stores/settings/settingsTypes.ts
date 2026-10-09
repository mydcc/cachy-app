/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

/**
 * Settings domain types and presets, extracted from
 * settings.svelte.ts (FEAT-0342). Pure types plus two dependency-free
 * preset constants; the stateful SettingsManager stays in place.
 */

import type { AiAnalysisMode } from "../../types/ai";
import { VENUE_DEFAULT_FEE_RATES } from "../../lib/constants";
import { AI_ALLOWED_ACTIONS_DEFAULT } from "../../lib/ai/actionPolicy";
import type { EncryptedBlob } from "../../services/cryptoService";
import type { ExchangeAccount } from "./accounts";
import { defaultAccountState } from "./accounts";
import type { ProviderConfig } from "./aiProviders";
import type { VisualQuality } from "../../lib/three/quality";

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

/**
 * What happens when an alert turns out to be inert — it reads an indicator the
 * alert path cannot compute, so it can never fire.
 *
 * `notify` is the default because the failure is silent by nature: the alert
 * still sits in the panel looking armed. `log` exists for a trader who would
 * rather not be interrupted; the failure is recorded either way, so choosing
 * `log` hides the interruption, not the information.
 */
export type BrokenAlertReport = "notify" | "log";
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

/**
 * Scale mode of the candlestick chart's price axis. Deliberately limited to
 * Linear and Logarithmic: the rebasing modes (Percentage / IndexedTo100)
 * re-render every value relative to the first visible bar, which makes
 * absolute price lines (Entry/Liquidation/TP/SL) unreadable on an execution
 * chart - see the "%" scale confusion that shipped with them.
 */
export type ChartPriceScaleMode = "linear" | "log";
export type ChartCrosshairMode = "normal" | "magnet" | "hidden";
export type ChartCrosshairStyle = "solid" | "dashed" | "dotted";
export type ChartDecimalsMode = "auto" | "fixed";

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

/**
 * Galaxy tunables for the Trade Flow "galaxy" mode.
 *
 * Deliberately a separate shape from {@link GalaxySettings} even though the
 * first block of fields is identical: the standalone Galaxy 3D background and
 * the market-driven Trade Flow galaxy are two independent effects, and tuning
 * one must never move the other. It is nested inside `TradeFlowSettings` rather
 * than flattened because `particleCount` and `size` already exist there with a
 * completely different meaning (grid particles, not stars).
 *
 * The camera uses the same settings as the standalone galaxy (`camPos`,
 * `galaxyRot`, `autoCenter`, `enableGyroscope`). `camPos` is kept in the
 * standalone's units (default z: 5 against its radius-5 disc) and the worker
 * scales it by the 12x world ratio, so the two galaxies frame identically and
 * their camera sliders carry the same values. The world itself stays larger —
 * `radius: 60` instead of 5 and `particleSize: 6` instead of 0.5 — so the
 * market effects keep their tuned proportions.
 */
export interface GalaxyFlowSettings {
  particleCount: number;
  particleSize: number;
  radius: number;
  branches: number;
  spin: number;
  randomness: number;
  randomnessPower: number;
  concentrationPower: number;
  rotationSpeed: number;
  galaxyRot: { x: number; y: number; z: number };
  /**
   * Camera position, in the standalone galaxy's units. The worker multiplies it
   * by the world scale, so the default `{0, 2, 5}` frames this galaxy exactly
   * like the standalone one.
   */
  camPos: { x: number; y: number; z: number };
  /** Point the camera at the galaxy core instead of using the raw camera rotation. */
  autoCenter: boolean;
  /** Control the camera with device motion (mobile). Independent of the 3D galaxy's switch. */
  enableGyroscope: boolean;
  /** Scales every trade shockwave. 0 = the galaxy ignores trades entirely. */
  marketReactivity: number;
  /** How strongly the rolling buy/sell ratio tints the arms. */
  sentimentTint: number;
  /** How much market heat (rate + notional + volatility) speeds the galaxy up. */
  activityRotation: number;
  /**
   * Turns the disc's radius into a price axis: a trade's shockwave is born at
   * its position in the recent price range (core = bottom of the range, rim =
   * top) instead of always at the core, and buys sweep outward while sells
   * sweep inward. Off reproduces the plain radial burst.
   */
  priceAxis: boolean;
  /**
   * Reference rings at the last price and at ±1 ATR around it, drawn on the
   * radial price axis. Needs `priceAxis` and an available ATR reading.
   */
  atrBands: boolean;
  /**
   * Ring distance, in ATR multiples around the last price. 1 = ±1 ATR (the
   * classic band). Values beyond the ±2 ATR axis span clamp to the disc rim,
   * which reads correctly as "price is further from its recent centre".
   */
  atrBandWidth: number;
  /** Multiplier on the reference rings' opacity. 1 = the tuned default look. */
  atrBandStrength: number;
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
  /**
   * How strongly the dynamic atmosphere (lights, fog, sky, tint) reacts, on top
   * of the on/off toggle. 0 = visually neutral, 1 = the tuned default.
   */
  atmosphereIntensity: number;
  /**
   * Reaction-speed multiplier. Scales the smoothing time constants and the sky
   * drift, so 2 reacts twice as fast without changing the resting look.
   */
  atmosphereSpeed: number;
  volumeScale: number; // Factor to scale volume mapping
  flowMode: "equalizer" | "raindrops" | "city" | "sonar" | "block" | "galaxy";
  persistenceDuration: number;
  /** Tunables for the "galaxy" flow mode. Independent of `galaxySettings`. */
  galaxyFlow: GalaxyFlowSettings;
  /**
   * Slow scene rotation, purely decorative. Off by default: it destroys the
   * readability of the time/price axes (a block's height can only be compared
   * against the grid while the frame stands still).
   */
  enableRotation: boolean;
  cameraHeight: number;
  cameraDistance: number;
  cameraPositionX: number;
  cameraRotationX: number;
  cameraRotationY: number;
  cameraRotationZ: number;
  /**
   * How the background stays alive when the live trade feed goes quiet.
   * - "live": only real trades (default).
   * - "ambient": inject subtle synthetic ticks when no real trade arrived
   *   for a while, so the effect never freezes completely.
   * - "replay": continuously replay the most recent real trades as synthetic
   *   ticks even while the live feed is active.
   */
  tradeFlowSource: "live" | "ambient" | "replay";
  /**
   * What drives the scene's amplitude (fog, lights, nebula, galaxy spin).
   * - "atr": the real Average True Range of the shared analysis timeframe, divided by
   *   price so it is comparable across symbols.
   * - "trades": the price spread of the last ~100 trade prints, computed in the
   *   worker. Always available, but a cruder stand-in for volatility.
   * ATR falls back to the trade estimate whenever no indicator value exists yet.
   */
  volatilitySource: "trades" | "atr";
  /**
   * What drives the scene's colour mood.
   * - "sentiment": rolling buy/sell ratio of the last 100 trades (seconds of history).
   * - "rsi": RSI of the shared analysis timeframe — a far longer view of the same question.
   * RSI falls back to sentiment whenever no indicator value exists yet.
   */
  moodSource: "sentiment" | "rsi";
}

export interface Settings {
  apiProvider: "bitunix" | "bitget";
  appAccessToken?: string;
  autoUpdatePriceInput: boolean;
  autoFetchBalance: boolean;
  showSidebars: boolean;
  showTooltips: boolean;
  showTechnicals: boolean;
  showIndicatorParams: boolean;
  technicalsFullHeight: boolean;
  hideUnfilledOrders: boolean;
  /**
   * Whether simulated fills from paper trading (FEAT-0012) are written to the
   * journal. On by default: reviewing them afterwards is most of the point of
   * paper trading. They are always marked `isPaper` and are excluded from
   * every performance statistic and from the FEAT-0013 daily-loss counter,
   * whichever way this is set.
   */
  journalPaperTrades: boolean;
  /**
   * BUG-0512: when no price source is provably fresh, keep showing the
   * last-known price with an unmissable STALE badge (true) or show honestly
   * unpriced instead (false). Default true: a labelled number keeps the row
   * live while never looking live. Class A: never leaves the device.
   */
  showStalePriceBadge: boolean;
  positionViewMode?: PositionViewMode;
  pnlViewMode: PnlViewMode;
  isPro: boolean;
  feePreference: "maker" | "taker";
  /**
   * Personal per-venue fee rates, PERCENTAGES — "0.0600" means 0.06%, same
   * unit as `DEFAULT_FEES` (BUG-0329). Source of truth for the simulated
   * calculation in the frontend; the user overrides the static defaults
   * with their level-/rebate-adjusted rates (FEAT-0253). Class A: never
   * leaves the device.
   */
  feeRates: Record<
    "bitunix" | "bitget",
    { maker: string; taker: string }
  >;
  hotkeyMode: HotkeyMode;
  /**
   * Named exchange accounts (FEAT-0333), replacing the venue-indexed
   * `apiKeys` / `encryptedApiKeys`. Those two survive only in
   * `LegacyCredentialShape`, which nothing but the migration reads — a
   * reader that has not been converted is a type error rather than a silent
   * `undefined`.
   */
  accounts: ExchangeAccount[];
  activeAccountId: string;
  encryptedAccountKeys?: Record<string, EncryptedBlob>;
  /** Which credential shape this payload was written with. See the constant. */
  credentialSchemaVersion?: number;
  encryptedSecrets?: Record<string, EncryptedBlob>;
  isEncrypted?: boolean;
  customHotkeys: Record<string, string>;
  favoriteTimeframes: string[];
  favoriteSymbols: string[];
  syncRsiTimeframe: boolean;
  imgbbApiKey: string;
  imgbbExpiration: number;
  isDeepDiveUnlocked?: boolean;
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
  openaiBaseUrl: string;
  geminiApiKey: string;
  geminiModel: string;
  geminiBaseUrl: string;
  anthropicApiKey: string;
  anthropicModel: string;
  anthropicBaseUrl: string;
  ollamaBaseUrl: string;
  ollamaModel: string;
  openrouterApiKey: string;
  openrouterModel: string;
  openrouterBaseUrl: string;
  /**
   * User-created AI providers (FEAT-0467). Class A when a key is set: the
   * credentials are encrypted into `encryptedProviderConfigs` before they
   * reach storage, and the serialized `userProviders` block stays redacted.
   */
  userProviders: ProviderConfig[];
  activeProviderId: string;
  encryptedProviderConfigs?: EncryptedBlob;
  analysisDepth: AnalysisDepth;
  aiConfirmActions: boolean;
  aiAllowSettingsChanges: boolean;
  /** Action ids the AI may request; see `lib/ai/actionPolicy`. */
  aiAllowedActions: string[];
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
  rssFilterBySymbol: boolean;
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

  // Rendering quality
  /** WebGL pixel-ratio tier; `auto` adapts to measured FPS. */
  visualQuality: VisualQuality;

  // Market & Performance Settings
  marketMode: MarketMode;
  analyzeAllFavorites: boolean; // if false, only top 4
  marketCacheSize: number; // LRU cache size for market data (default: 20)

  // Alerts
  brokenAlertReport: BrokenAlertReport;

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

  // Chart view appearance/behavior (Settings → Chart). Defaults mirror the
  // options previously hard-coded in CandleChartView so existing users see
  // no visual change.
  chartPriceScaleMode: ChartPriceScaleMode;
  chartAutoScale: boolean;
  chartInvertScale: boolean;
  chartDecimalsMode: ChartDecimalsMode;
  chartFixedDecimals: number; // Used when chartDecimalsMode === "fixed" (0-8)
  chartShowGrid: boolean;
  chartLastValueVisible: boolean;
  chartCandleBorders: boolean;
  chartWatermark: boolean;
  chartCrosshairMode: ChartCrosshairMode;
  chartCrosshairStyle: ChartCrosshairStyle;
  chartSecondsVisible: boolean;
  chartFixEdges: boolean;
  chartCountdownEnabled: boolean;

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


/**
 * Read-only export for contract tests (or-mode inventory, save/load parity):
 * importing the manager would pull the reactive graph into a node test, but
 * the defaults themselves are a plain module-level object. Never mutate —
 * several tests assert the live defaults are still pristine.
 */
export const defaultSettings: Settings = {
  apiProvider: "bitunix",
  appAccessToken: "",
  marketAnalysisInterval: 60,
  pauseAnalysisOnBlur: true,
  analysisTimeframes: ["1h", "4h"],
  autoUpdatePriceInput: true,
  autoFetchBalance: false,
  showSidebars: true,
  showTooltips: true,
  showTechnicals: false,
  showIndicatorParams: false,
  technicalsFullHeight: false,
  hideUnfilledOrders: false,
  journalPaperTrades: true,
  showStalePriceBadge: true,
  positionViewMode: "detailed",
  pnlViewMode: "value",
  isPro: false,
  feePreference: "taker",
  // Fresh per-venue copies, not the module constant: a future
  // reset-to-defaults must never hand out (and later mutate) the shared
  // VENUE_DEFAULT_FEE_RATES objects (FEAT-0253 review finding).
  feeRates: {
    bitunix: { ...VENUE_DEFAULT_FEE_RATES.bitunix },
    bitget: { ...VENUE_DEFAULT_FEE_RATES.bitget },
  },
  hotkeyMode: "mode2",
  customHotkeys: {},
  ...defaultAccountState(),
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
  openaiBaseUrl: "",
  geminiApiKey: "",
  geminiModel: "gemini-1.5-flash",
  geminiBaseUrl: "",
  anthropicApiKey: "",
  anthropicModel: "claude-sonnet-5",
  anthropicBaseUrl: "",
  ollamaBaseUrl: "http://localhost:11434",
  ollamaModel: "",
  openrouterApiKey: "",
  openrouterModel: "",
  openrouterBaseUrl: "",
  userProviders: [],
  activeProviderId: "",
  analysisDepth: "standard",
  aiConfirmActions: false,
  aiAllowSettingsChanges: false,
  aiAllowedActions: [...AI_ALLOWED_ACTIONS_DEFAULT],
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
    atmosphereIntensity: 1.0,
    atmosphereSpeed: 1.0,
    enableRotation: false,
    volumeScale: 1.0,
    persistenceDuration: 60,
    cameraHeight: 80,
    cameraDistance: 120,
    cameraPositionX: 0,
    cameraRotationX: 0,
    cameraRotationY: 0,
    cameraRotationZ: 0,
    tradeFlowSource: "live",
    volatilitySource: "atr",
    moodSource: "sentiment",
    galaxyFlow: {
      particleCount: 20000,
      particleSize: 6.0,
      radius: 60,
      branches: 3,
      spin: 1.0,
      randomness: 1.0,
      randomnessPower: 3.0,
      concentrationPower: 1.5,
      rotationSpeed: 0.1,
      galaxyRot: { x: 0, y: 0, z: 0 },
      camPos: { x: 0, y: 2, z: 5 },
      autoCenter: true,
      enableGyroscope: false,
      marketReactivity: 1.0,
      sentimentTint: 0.35,
      activityRotation: 1.0,
      priceAxis: true,
      atrBands: true,
      atrBandWidth: 1.0,
      atrBandStrength: 1.0,
    },
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

  visualQuality: "auto",

  marketMode: "balanced",
  analyzeAllFavorites: false, // Default to top 4 only for balanced
  marketCacheSize: 20, // Default LRU cache size

  // Alert Defaults
  brokenAlertReport: "notify",

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

  // Chart view defaults = the previous hard-coded CandleChartView behavior
  chartPriceScaleMode: "log",
  chartAutoScale: true,
  chartInvertScale: false,
  chartDecimalsMode: "auto",
  chartFixedDecimals: 2,
  chartShowGrid: true,
  chartLastValueVisible: true,
  chartCandleBorders: false,
  chartWatermark: false,
  chartCrosshairMode: "normal",
  chartCrosshairStyle: "solid",
  chartSecondsVisible: false,
  chartFixEdges: false,
  chartCountdownEnabled: false,

  // Core indicators enabled by default
  // Removed enabledIndicators (handled via indicatorState instead)
  autoTrading: false,
  multiAccount: false,
  enableDockingCentered: true,
  dockingPosition: "top",
};