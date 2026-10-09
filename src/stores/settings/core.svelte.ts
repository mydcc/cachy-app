/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 *
 * Core settings sub-store — ADR-0024 decision 2, second group.
 *
 * Holds the 97 core-owned `$state` fields: 98 `PERSISTENCE_SCHEMA` rows
 * carry `section: "core"`, but `isPro` lives on the entitlement
 * collaborator (never a manager field), so 97 land here. An inventory test
 * in `core.test.ts` pins that subtraction.
 * `SettingsManager` keeps all 97 names via delegating getters/setters, so
 * no consumer file changes.
 *
 * Import rule for sub-stores: defaults and types come from
 * `./settingsTypes` only, never from `settings.svelte.ts`.
 *
 * Ownership rules (ADR-0024 "What is now forbidden"):
 * - no sub-store reads `settingsState` — coordination goes through ports;
 * - no sub-store writes another sub-store's field;
 * - every field here has a `PERSISTENCE_SCHEMA` row.
 */

import { defaultSettings } from "./settingsTypes";
import type { AiAnalysisMode } from "../../types/ai";
import type { ProviderConfig } from "./aiProviders";
import type {
    AiProvider,
    AnalysisDepth,
    BrokenAlertReport,
    ChartCrosshairMode,
    ChartCrosshairStyle,
    ChartDecimalsMode,
    ChartPriceScaleMode,
    HotkeyMode,
    MarketMode,
    PnlViewMode,
    PositionViewMode,
    TechnicalsUpdateMode,
} from "./settingsTypes";

export class CoreSettingsStore {
  appAccessToken = $state<string>(defaultSettings.appAccessToken || "");
  marketAnalysisInterval = $state<number>(
    defaultSettings.marketAnalysisInterval,
  );
  pauseAnalysisOnBlur = $state<boolean>(defaultSettings.pauseAnalysisOnBlur);
  analysisTimeframes = $state<string[]>(structuredClone(defaultSettings.analysisTimeframes));
  autoUpdatePriceInput = $state<boolean>(defaultSettings.autoUpdatePriceInput);
  autoFetchBalance = $state<boolean>(defaultSettings.autoFetchBalance);
  showSidebars = $state<boolean>(defaultSettings.showSidebars);
  showTooltips = $state<boolean>(defaultSettings.showTooltips);
  showTechnicals = $state<boolean>(defaultSettings.showTechnicals);
  showIndicatorParams = $state<boolean>(defaultSettings.showIndicatorParams);
  technicalsFullHeight = $state<boolean>(defaultSettings.technicalsFullHeight);
  hideUnfilledOrders = $state<boolean>(defaultSettings.hideUnfilledOrders);
  journalPaperTrades = $state<boolean>(defaultSettings.journalPaperTrades);
  showStalePriceBadge = $state<boolean>(defaultSettings.showStalePriceBadge);
  positionViewMode = $state<PositionViewMode | undefined>(
    defaultSettings.positionViewMode,
  );
  pnlViewMode = $state<PnlViewMode>(defaultSettings.pnlViewMode);
  feePreference = $state<"maker" | "taker">(defaultSettings.feePreference);
  // Shallow clone: the $state proxy must not share object references with the
  // module-level constant, or editing a rate here would rewrite the default.
  // structuredClone like every other object-valued init (see `accounts`).
  feeRates = $state(structuredClone(defaultSettings.feeRates));
  hotkeyMode = $state<HotkeyMode>(defaultSettings.hotkeyMode);
  customHotkeys = $state(structuredClone(defaultSettings.customHotkeys));
  favoriteTimeframes = $state(structuredClone(defaultSettings.favoriteTimeframes));
  favoriteSymbols = $state(structuredClone(defaultSettings.favoriteSymbols));
  syncRsiTimeframe = $state<boolean>(defaultSettings.syncRsiTimeframe);
  imgbbApiKey = $state<string>(defaultSettings.imgbbApiKey);
  imgbbExpiration = $state<number>(defaultSettings.imgbbExpiration);
  isDeepDiveUnlocked = $state<boolean | undefined>(
    defaultSettings.isDeepDiveUnlocked,
  );
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
  openaiBaseUrl = $state<string>(defaultSettings.openaiBaseUrl);
  geminiApiKey = $state<string>(defaultSettings.geminiApiKey);
  geminiModel = $state<string>(defaultSettings.geminiModel);
  geminiBaseUrl = $state<string>(defaultSettings.geminiBaseUrl);
  anthropicApiKey = $state<string>(defaultSettings.anthropicApiKey);
  anthropicModel = $state<string>(defaultSettings.anthropicModel);
  anthropicBaseUrl = $state<string>(defaultSettings.anthropicBaseUrl);
  // No API key: Ollama is the user's own local (or self-hosted) instance.
  ollamaBaseUrl = $state<string>(defaultSettings.ollamaBaseUrl);
  ollamaModel = $state<string>(defaultSettings.ollamaModel);
  openrouterApiKey = $state<string>(defaultSettings.openrouterApiKey);
  openrouterModel = $state<string>(defaultSettings.openrouterModel);
  openrouterBaseUrl = $state<string>(defaultSettings.openrouterBaseUrl);
  userProviders = $state<ProviderConfig[]>(structuredClone(defaultSettings.userProviders));
  activeProviderId = $state<string>(defaultSettings.activeProviderId);
  analysisDepth = $state<AnalysisDepth>(defaultSettings.analysisDepth);
  aiConfirmActions = $state<boolean>(defaultSettings.aiConfirmActions);
  aiAllowSettingsChanges = $state<boolean>(defaultSettings.aiAllowSettingsChanges);
  aiAllowedActions = $state<string[]>(structuredClone(defaultSettings.aiAllowedActions));
  aiTradeHistoryLimit = $state<number>(defaultSettings.aiTradeHistoryLimit);
  aiShareTradeContext = $state<boolean>(defaultSettings.aiShareTradeContext);
  aiConfirmClear = $state<boolean>(defaultSettings.aiConfirmClear);
  aiAnalysisMode = $state<AiAnalysisMode>(defaultSettings.aiAnalysisMode);
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
  rssFilterBySymbol = $state<boolean>(defaultSettings.rssFilterBySymbol);
  marketMode = $state<MarketMode>(defaultSettings.marketMode);
  analyzeAllFavorites = $state<boolean>(defaultSettings.analyzeAllFavorites);
  marketCacheSize = $state<number>(defaultSettings.marketCacheSize);
  // Alerts State
  brokenAlertReport = $state<BrokenAlertReport>(
    defaultSettings.brokenAlertReport,
  );
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
  autoTrading = $state<boolean>(defaultSettings.autoTrading);
  multiAccount = $state<boolean>(defaultSettings.multiAccount);
  enableIndicatorOptimization = $state<boolean>(
    defaultSettings.enableIndicatorOptimization,
  );
  chartHistoryLimit = $state<number>(defaultSettings.chartHistoryLimit);
  chartRenderIntervalMs = $state<number>(defaultSettings.chartRenderIntervalMs);
  repairTimeframe = $state<string>(defaultSettings.repairTimeframe);
  // Chart view state
  chartPriceScaleMode = $state<ChartPriceScaleMode>(
    defaultSettings.chartPriceScaleMode,
  );
  chartAutoScale = $state<boolean>(defaultSettings.chartAutoScale);
  chartInvertScale = $state<boolean>(defaultSettings.chartInvertScale);
  chartDecimalsMode = $state<ChartDecimalsMode>(
    defaultSettings.chartDecimalsMode,
  );
  chartFixedDecimals = $state<number>(defaultSettings.chartFixedDecimals);
  chartShowGrid = $state<boolean>(defaultSettings.chartShowGrid);
  chartLastValueVisible = $state<boolean>(
    defaultSettings.chartLastValueVisible,
  );
  chartCandleBorders = $state<boolean>(defaultSettings.chartCandleBorders);
  chartWatermark = $state<boolean>(defaultSettings.chartWatermark);
  chartCrosshairMode = $state<ChartCrosshairMode>(
    defaultSettings.chartCrosshairMode,
  );
  chartCrosshairStyle = $state<ChartCrosshairStyle>(
    defaultSettings.chartCrosshairStyle,
  );
  chartSecondsVisible = $state<boolean>(defaultSettings.chartSecondsVisible);
  chartFixEdges = $state<boolean>(defaultSettings.chartFixEdges);
  chartCountdownEnabled = $state<boolean>(
    defaultSettings.chartCountdownEnabled,
  );
}
