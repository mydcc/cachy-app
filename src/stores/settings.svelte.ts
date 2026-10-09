/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { untrack } from "svelte";
import { browser } from "$app/env";
import { CONSTANTS } from "../lib/constants";
import { StorageHelper } from "../utils/storageHelper";
import { uiState } from "./ui.svelte";
import { cryptoService, type EncryptedBlob } from "../services/cryptoService";
import { setTelemetryConsentProvider } from "../services/trackingService";
import { setLoggerConfigProvider } from "../services/loggerConfig";
import { setNewsSettingsProvider } from "../services/newsSettings";
import { EntitlementStore } from "./entitlement.svelte";
// Class A both sides, and no back edge: `paperTrading.svelte.ts` imports
// nothing from here, so reading the mode cannot cycle.
import { paperState } from "./paperTrading.svelte";
import {
  SecretsLoader,
  SENSITIVE_KEYS,
  apiKeyHasMaterial,
} from "./settings/secretsLoader";
import type { SwitchAuthorization } from "../lib/confirmationPolicy";
import { safeLocalStorage } from "../utils/storageWrapper";
import {
  accountForExchange,
  blankKeysFor,
  defaultAccountName,
  activeAccountFor,
  keysForActiveAccount,
  buildAccount,
  removeAccountFrom,
  redactAccounts,
  LEGACY_ACCOUNT_IDS,
  type ExchangeAccount,
  type ExchangeProvider,
  type LegacyCredentialShape,
} from "./settings/accounts";
import { resetChart, resetGalaxy, resetTradeFlow } from "./settings/resets";
import {
  ensureProviderRegistryState,
  redactUserProviders,
  sanitizeUserProviders,
} from "./settings/aiProviders";
import {
  resolveApiProvider,
} from "./settings/migrations";
import {
    applySchemaField,
    loadSchemaEntries,
    PERSISTENCE_SCHEMA,
    readSerializedField,
    type FieldSchema,
    type LoadTarget,
    type SaveSource,
} from "./settings/persistenceSchema";
import { trackAutosaveReads } from "./settings/tracking";
import { DisplaySettingsStore } from "./settings/display.svelte";
import { CoreSettingsStore } from "./settings/core.svelte";

// Domain types and presets live in ./settings/settingsTypes (FEAT-0342);
// re-exported here so existing importers keep working.
import type {
  MarketMode,
  Settings,
} from "./settings/settingsTypes";
export type {
  HotkeyMode,
  PositionViewMode,
  PnlViewMode,
  AiProvider,
  BackgroundType,
  BackgroundAnimationPreset,
  AnimationIntensity,
  AnalysisDepth,
  AmbientToplineMode,
  AmbientToplineIntensity,
  MarketMode,
  BrokenAlertReport,
  TechnicalsUpdateMode,
  HeatmapMode,
  ChartPriceScaleMode,
  ChartCrosshairMode,
  ChartCrosshairStyle,
  ChartDecimalsMode,
  ApiKeys,
  GalaxySettings,
  GalaxyFlowSettings,
  TradeFlowSettings,
  Settings,
} from "./settings/settingsTypes";
export { TECHNICALS_UPDATE_PRESETS, MAX_FAVORITE_SYMBOLS } from "./settings/settingsTypes";

import { defaultSettings } from "./settings/settingsTypes";
export { defaultSettings };

/**
 * The keys `defaultSettings` declares, frozen at module load.
 *
 * This exists so the declared set is comparable at all: `defaultSettings` was
 * module-private, so nothing outside this module could check it against
 * `toJSON()`. The contract that matters is checked in
 * `settings.persistenceContract.test` — a setting declared here but absent from
 * `toJSON()` is never read by the constructor's autosave `$effect`, so
 * changing it never schedules a save and the change is gone on reload.
 *
 * The check compares *names*. It does not verify that a matching `$state` field
 * exists, that it is reactive, or that the `toJSON()` entry reads that field —
 * see the test's docstring for the blind spots this deliberately does not
 * pretend to close.
 */
export const SETTINGS_KEYS = Object.freeze(Object.keys(defaultSettings));

export class SettingsManager {
  get tradeFlowSettings(): DisplaySettingsStore["tradeFlowSettings"] {
    return this.display.tradeFlowSettings;
  }
  set tradeFlowSettings(v: DisplaySettingsStore["tradeFlowSettings"]) {
    this.display.tradeFlowSettings = v;
  }
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

      // FEAT-0026: carry the active account with the venue.
      //
      // `apiProvider` and `activeAccountId` are one fact under two names.
      // This setter used to move only one of them, which left the pair
      // representable in a disagreeing state — and a disagreeing pair makes
      // the account id the order gate compares describe an account other
      // than the one being signed for. `setActiveAccount` is the coherent
      // path and moves both; this keeps the venue-only path from breaking
      // that invariant behind its back.
      //
      // A venue with no account leaves the id alone rather than blanking it:
      // an empty active id makes every reader fall back to empty
      // credentials, which reads to a user as their keys having vanished.
      const onVenue = this.accounts?.find((account) => account.exchange === v);
      if (onVenue) this.activeAccountId = onVenue.id;
      // Let $effect handle saving, don't call save() directly
    }
  }
  get appAccessToken(): CoreSettingsStore["appAccessToken"] {
    return this.core.appAccessToken;
  }
  set appAccessToken(v: CoreSettingsStore["appAccessToken"]) {
    this.core.appAccessToken = v;
  }
  get autoUpdatePriceInput(): CoreSettingsStore["autoUpdatePriceInput"] {
    return this.core.autoUpdatePriceInput;
  }
  set autoUpdatePriceInput(v: CoreSettingsStore["autoUpdatePriceInput"]) {
    this.core.autoUpdatePriceInput = v;
  }
  get autoFetchBalance(): CoreSettingsStore["autoFetchBalance"] {
    return this.core.autoFetchBalance;
  }
  set autoFetchBalance(v: CoreSettingsStore["autoFetchBalance"]) {
    this.core.autoFetchBalance = v;
  }
  get showSidebars(): CoreSettingsStore["showSidebars"] {
    return this.core.showSidebars;
  }
  set showSidebars(v: CoreSettingsStore["showSidebars"]) {
    this.core.showSidebars = v;
  }
  get showTooltips(): CoreSettingsStore["showTooltips"] {
    return this.core.showTooltips;
  }
  set showTooltips(v: CoreSettingsStore["showTooltips"]) {
    this.core.showTooltips = v;
  }
  get showTechnicals(): CoreSettingsStore["showTechnicals"] {
    return this.core.showTechnicals;
  }
  set showTechnicals(v: CoreSettingsStore["showTechnicals"]) {
    this.core.showTechnicals = v;
  }
  get showIndicatorParams(): CoreSettingsStore["showIndicatorParams"] {
    return this.core.showIndicatorParams;
  }
  set showIndicatorParams(v: CoreSettingsStore["showIndicatorParams"]) {
    this.core.showIndicatorParams = v;
  }
  get technicalsFullHeight(): CoreSettingsStore["technicalsFullHeight"] {
    return this.core.technicalsFullHeight;
  }
  set technicalsFullHeight(v: CoreSettingsStore["technicalsFullHeight"]) {
    this.core.technicalsFullHeight = v;
  }
  get hideUnfilledOrders(): CoreSettingsStore["hideUnfilledOrders"] {
    return this.core.hideUnfilledOrders;
  }
  set hideUnfilledOrders(v: CoreSettingsStore["hideUnfilledOrders"]) {
    this.core.hideUnfilledOrders = v;
  }
  get journalPaperTrades(): CoreSettingsStore["journalPaperTrades"] {
    return this.core.journalPaperTrades;
  }
  set journalPaperTrades(v: CoreSettingsStore["journalPaperTrades"]) {
    this.core.journalPaperTrades = v;
  }
  get showStalePriceBadge(): CoreSettingsStore["showStalePriceBadge"] {
    return this.core.showStalePriceBadge;
  }
  set showStalePriceBadge(v: CoreSettingsStore["showStalePriceBadge"]) {
    this.core.showStalePriceBadge = v;
  }
  get positionViewMode(): CoreSettingsStore["positionViewMode"] {
    return this.core.positionViewMode;
  }
  set positionViewMode(v: CoreSettingsStore["positionViewMode"]) {
    this.core.positionViewMode = v;
  }
  get pnlViewMode(): CoreSettingsStore["pnlViewMode"] {
    return this.core.pnlViewMode;
  }
  set pnlViewMode(v: CoreSettingsStore["pnlViewMode"]) {
    this.core.pnlViewMode = v;
  }
  get feePreference(): CoreSettingsStore["feePreference"] {
    return this.core.feePreference;
  }
  set feePreference(v: CoreSettingsStore["feePreference"]) {
    this.core.feePreference = v;
  }
  get feeRates(): CoreSettingsStore["feeRates"] {
    return this.core.feeRates;
  }
  set feeRates(v: CoreSettingsStore["feeRates"]) {
    this.core.feeRates = v;
  }
  get hotkeyMode(): CoreSettingsStore["hotkeyMode"] {
    return this.core.hotkeyMode;
  }
  set hotkeyMode(v: CoreSettingsStore["hotkeyMode"]) {
    this.core.hotkeyMode = v;
  }
  /** Display section (ADR-0024 decision 2): 65 display-owned `$state` fields live here (66 display schema rows minus entitlement-owned `isProLicenseActive`); the getters/setters below keep `settingsState.<field>` working. Private on purpose — consumers use the manager spelling, never `settingsState.display.*`. Declared above `entitlement` so no lazy closure can ever observe it uninitialised. */
  private readonly display = new DisplaySettingsStore();
  /** Core section (ADR-0024 decision 2): 97 core-owned `$state` fields live here (98 core schema rows minus entitlement-owned `isPro`); same facade pattern as `display`, same privacy rule. */
  private readonly core = new CoreSettingsStore();
  /**
   * Edition/entitlement state (isPro, isProLicenseActive, the capability
   * map) lives in its own store (FEAT-0197 PR 2) -- this is the one accessor
   * every consumer outside this file reaches it through.
   */
  readonly entitlement = new EntitlementStore(
    () => this.accounts,
    () => this.activeAccountId,
    () => this.apiProvider,
    () => this.autoTrading,
    () => this.multiAccount,
    () => this.showMarketActivity,
  );
  /** Encrypted-credential handling and the secretsReady handshake (FEAT-0197 PR 3). */
  private readonly secretsLoader = new SecretsLoader();
  get glassBlur(): DisplaySettingsStore["glassBlur"] {
    return this.display.glassBlur;
  }
  set glassBlur(v: DisplaySettingsStore["glassBlur"]) {
    this.display.glassBlur = v;
  }
  get glassSaturate(): DisplaySettingsStore["glassSaturate"] {
    return this.display.glassSaturate;
  }
  set glassSaturate(v: DisplaySettingsStore["glassSaturate"]) {
    this.display.glassSaturate = v;
  }
  get glassOpacity(): DisplaySettingsStore["glassOpacity"] {
    return this.display.glassOpacity;
  }
  set glassOpacity(v: DisplaySettingsStore["glassOpacity"]) {
    this.display.glassOpacity = v;
  }

  // Object-valued defaults are cloned, never aliased: handing live state a
  // reference into `defaultSettings` lets the next in-place edit rewrite the
  // shipped default for the rest of the session (same class as the galaxy
  // reset aliasing — see `resetGalaxy`). Scalars need no clone.
  accounts = $state(structuredClone(defaultSettings.accounts));
  activeAccountId = $state<string>(defaultSettings.activeAccountId);
  get customHotkeys(): CoreSettingsStore["customHotkeys"] {
    return this.core.customHotkeys;
  }
  set customHotkeys(v: CoreSettingsStore["customHotkeys"]) {
    this.core.customHotkeys = v;
  }
  get favoriteTimeframes(): CoreSettingsStore["favoriteTimeframes"] {
    return this.core.favoriteTimeframes;
  }
  set favoriteTimeframes(v: CoreSettingsStore["favoriteTimeframes"]) {
    this.core.favoriteTimeframes = v;
  }
  get favoriteSymbols(): CoreSettingsStore["favoriteSymbols"] {
    return this.core.favoriteSymbols;
  }
  set favoriteSymbols(v: CoreSettingsStore["favoriteSymbols"]) {
    this.core.favoriteSymbols = v;
  }

  get syncRsiTimeframe(): CoreSettingsStore["syncRsiTimeframe"] {
    return this.core.syncRsiTimeframe;
  }
  set syncRsiTimeframe(v: CoreSettingsStore["syncRsiTimeframe"]) {
    this.core.syncRsiTimeframe = v;
  }
  get imgbbApiKey(): CoreSettingsStore["imgbbApiKey"] {
    return this.core.imgbbApiKey;
  }
  set imgbbApiKey(v: CoreSettingsStore["imgbbApiKey"]) {
    this.core.imgbbApiKey = v;
  }
  get imgbbExpiration(): CoreSettingsStore["imgbbExpiration"] {
    return this.core.imgbbExpiration;
  }
  set imgbbExpiration(v: CoreSettingsStore["imgbbExpiration"]) {
    this.core.imgbbExpiration = v;
  }
  get isDeepDiveUnlocked(): CoreSettingsStore["isDeepDiveUnlocked"] {
    return this.core.isDeepDiveUnlocked;
  }
  set isDeepDiveUnlocked(v: CoreSettingsStore["isDeepDiveUnlocked"]) {
    this.core.isDeepDiveUnlocked = v;
  }

  get cloudEnabled(): CoreSettingsStore["cloudEnabled"] {
    return this.core.cloudEnabled;
  }
  set cloudEnabled(v: CoreSettingsStore["cloudEnabled"]) {
    this.core.cloudEnabled = v;
  }
  get cloudHost(): CoreSettingsStore["cloudHost"] {
    return this.core.cloudHost;
  }
  set cloudHost(v: CoreSettingsStore["cloudHost"]) {
    this.core.cloudHost = v;
  }
  get cloudDbName(): CoreSettingsStore["cloudDbName"] {
    return this.core.cloudDbName;
  }
  set cloudDbName(v: CoreSettingsStore["cloudDbName"]) {
    this.core.cloudDbName = v;
  }
  get cloudToken(): CoreSettingsStore["cloudToken"] {
    return this.core.cloudToken;
  }
  set cloudToken(v: CoreSettingsStore["cloudToken"]) {
    this.core.cloudToken = v;
  }
  get sidePanelMode(): CoreSettingsStore["sidePanelMode"] {
    return this.core.sidePanelMode;
  }
  set sidePanelMode(v: CoreSettingsStore["sidePanelMode"]) {
    this.core.sidePanelMode = v;
  }
  get chatStyle(): CoreSettingsStore["chatStyle"] {
    return this.core.chatStyle;
  }
  set chatStyle(v: CoreSettingsStore["chatStyle"]) {
    this.core.chatStyle = v;
  }
  get maxPrivateNotes(): CoreSettingsStore["maxPrivateNotes"] {
    return this.core.maxPrivateNotes;
  }
  set maxPrivateNotes(v: CoreSettingsStore["maxPrivateNotes"]) {
    this.core.maxPrivateNotes = v;
  }

  get customSystemPrompt(): CoreSettingsStore["customSystemPrompt"] {
    return this.core.customSystemPrompt;
  }
  set customSystemPrompt(v: CoreSettingsStore["customSystemPrompt"]) {
    this.core.customSystemPrompt = v;
  }
  get aiProvider(): CoreSettingsStore["aiProvider"] {
    return this.core.aiProvider;
  }
  set aiProvider(v: CoreSettingsStore["aiProvider"]) {
    this.core.aiProvider = v;
  }
  get openaiApiKey(): CoreSettingsStore["openaiApiKey"] {
    return this.core.openaiApiKey;
  }
  set openaiApiKey(v: CoreSettingsStore["openaiApiKey"]) {
    this.core.openaiApiKey = v;
  }
  get openaiModel(): CoreSettingsStore["openaiModel"] {
    return this.core.openaiModel;
  }
  set openaiModel(v: CoreSettingsStore["openaiModel"]) {
    this.core.openaiModel = v;
  }
  get openaiBaseUrl(): CoreSettingsStore["openaiBaseUrl"] {
    return this.core.openaiBaseUrl;
  }
  set openaiBaseUrl(v: CoreSettingsStore["openaiBaseUrl"]) {
    this.core.openaiBaseUrl = v;
  }
  get geminiApiKey(): CoreSettingsStore["geminiApiKey"] {
    return this.core.geminiApiKey;
  }
  set geminiApiKey(v: CoreSettingsStore["geminiApiKey"]) {
    this.core.geminiApiKey = v;
  }
  get geminiModel(): CoreSettingsStore["geminiModel"] {
    return this.core.geminiModel;
  }
  set geminiModel(v: CoreSettingsStore["geminiModel"]) {
    this.core.geminiModel = v;
  }
  get geminiBaseUrl(): CoreSettingsStore["geminiBaseUrl"] {
    return this.core.geminiBaseUrl;
  }
  set geminiBaseUrl(v: CoreSettingsStore["geminiBaseUrl"]) {
    this.core.geminiBaseUrl = v;
  }
  get anthropicApiKey(): CoreSettingsStore["anthropicApiKey"] {
    return this.core.anthropicApiKey;
  }
  set anthropicApiKey(v: CoreSettingsStore["anthropicApiKey"]) {
    this.core.anthropicApiKey = v;
  }
  get anthropicModel(): CoreSettingsStore["anthropicModel"] {
    return this.core.anthropicModel;
  }
  set anthropicModel(v: CoreSettingsStore["anthropicModel"]) {
    this.core.anthropicModel = v;
  }
  get anthropicBaseUrl(): CoreSettingsStore["anthropicBaseUrl"] {
    return this.core.anthropicBaseUrl;
  }
  set anthropicBaseUrl(v: CoreSettingsStore["anthropicBaseUrl"]) {
    this.core.anthropicBaseUrl = v;
  }
  get ollamaBaseUrl(): CoreSettingsStore["ollamaBaseUrl"] {
    return this.core.ollamaBaseUrl;
  }
  set ollamaBaseUrl(v: CoreSettingsStore["ollamaBaseUrl"]) {
    this.core.ollamaBaseUrl = v;
  }
  get ollamaModel(): CoreSettingsStore["ollamaModel"] {
    return this.core.ollamaModel;
  }
  set ollamaModel(v: CoreSettingsStore["ollamaModel"]) {
    this.core.ollamaModel = v;
  }
  get openrouterApiKey(): CoreSettingsStore["openrouterApiKey"] {
    return this.core.openrouterApiKey;
  }
  set openrouterApiKey(v: CoreSettingsStore["openrouterApiKey"]) {
    this.core.openrouterApiKey = v;
  }
  get openrouterModel(): CoreSettingsStore["openrouterModel"] {
    return this.core.openrouterModel;
  }
  set openrouterModel(v: CoreSettingsStore["openrouterModel"]) {
    this.core.openrouterModel = v;
  }
  get openrouterBaseUrl(): CoreSettingsStore["openrouterBaseUrl"] {
    return this.core.openrouterBaseUrl;
  }
  set openrouterBaseUrl(v: CoreSettingsStore["openrouterBaseUrl"]) {
    this.core.openrouterBaseUrl = v;
  }
  get userProviders(): CoreSettingsStore["userProviders"] {
    return this.core.userProviders;
  }
  set userProviders(v: CoreSettingsStore["userProviders"]) {
    this.core.userProviders = v;
  }
  get activeProviderId(): CoreSettingsStore["activeProviderId"] {
    return this.core.activeProviderId;
  }
  set activeProviderId(v: CoreSettingsStore["activeProviderId"]) {
    this.core.activeProviderId = v;
  }
  get analysisDepth(): CoreSettingsStore["analysisDepth"] {
    return this.core.analysisDepth;
  }
  set analysisDepth(v: CoreSettingsStore["analysisDepth"]) {
    this.core.analysisDepth = v;
  }
  get aiConfirmActions(): CoreSettingsStore["aiConfirmActions"] {
    return this.core.aiConfirmActions;
  }
  set aiConfirmActions(v: CoreSettingsStore["aiConfirmActions"]) {
    this.core.aiConfirmActions = v;
  }
  get aiAllowSettingsChanges(): CoreSettingsStore["aiAllowSettingsChanges"] {
    return this.core.aiAllowSettingsChanges;
  }
  set aiAllowSettingsChanges(v: CoreSettingsStore["aiAllowSettingsChanges"]) {
    this.core.aiAllowSettingsChanges = v;
  }
  get aiAllowedActions(): CoreSettingsStore["aiAllowedActions"] {
    return this.core.aiAllowedActions;
  }
  set aiAllowedActions(v: CoreSettingsStore["aiAllowedActions"]) {
    this.core.aiAllowedActions = v;
  }
  get aiTradeHistoryLimit(): CoreSettingsStore["aiTradeHistoryLimit"] {
    return this.core.aiTradeHistoryLimit;
  }
  set aiTradeHistoryLimit(v: CoreSettingsStore["aiTradeHistoryLimit"]) {
    this.core.aiTradeHistoryLimit = v;
  }
  get aiShareTradeContext(): CoreSettingsStore["aiShareTradeContext"] {
    return this.core.aiShareTradeContext;
  }
  set aiShareTradeContext(v: CoreSettingsStore["aiShareTradeContext"]) {
    this.core.aiShareTradeContext = v;
  }
  get aiConfirmClear(): CoreSettingsStore["aiConfirmClear"] {
    return this.core.aiConfirmClear;
  }
  set aiConfirmClear(v: CoreSettingsStore["aiConfirmClear"]) {
    this.core.aiConfirmClear = v;
  }
  get aiAnalysisMode(): CoreSettingsStore["aiAnalysisMode"] {
    return this.core.aiAnalysisMode;
  }
  set aiAnalysisMode(v: CoreSettingsStore["aiAnalysisMode"]) {
    this.core.aiAnalysisMode = v;
  }

  get rssFilterBySymbol(): CoreSettingsStore["rssFilterBySymbol"] {
    return this.core.rssFilterBySymbol;
  }
  set rssFilterBySymbol(v: CoreSettingsStore["rssFilterBySymbol"]) {
    this.core.rssFilterBySymbol = v;
  }

  get showSpinButtons(): DisplaySettingsStore["showSpinButtons"] {
    return this.display.showSpinButtons;
  }
  set showSpinButtons(v: DisplaySettingsStore["showSpinButtons"]) {
    this.display.showSpinButtons = v;
  }
  get disclaimerAccepted(): DisplaySettingsStore["disclaimerAccepted"] {
    return this.display.disclaimerAccepted;
  }
  set disclaimerAccepted(v: DisplaySettingsStore["disclaimerAccepted"]) {
    this.display.disclaimerAccepted = v;
  }
  get useUtcDateParsing(): DisplaySettingsStore["useUtcDateParsing"] {
    return this.display.useUtcDateParsing;
  }
  set useUtcDateParsing(v: DisplaySettingsStore["useUtcDateParsing"]) {
    this.display.useUtcDateParsing = v;
  }
  get forceEnglishTechnicalTerms(): DisplaySettingsStore["forceEnglishTechnicalTerms"] {
    return this.display.forceEnglishTechnicalTerms;
  }
  set forceEnglishTechnicalTerms(v: DisplaySettingsStore["forceEnglishTechnicalTerms"]) {
    this.display.forceEnglishTechnicalTerms = v;
  }
  get debugMode(): DisplaySettingsStore["debugMode"] {
    return this.display.debugMode;
  }
  set debugMode(v: DisplaySettingsStore["debugMode"]) {
    this.display.debugMode = v;
  }
  get syncFavorites(): DisplaySettingsStore["syncFavorites"] {
    return this.display.syncFavorites;
  }
  set syncFavorites(v: DisplaySettingsStore["syncFavorites"]) {
    this.display.syncFavorites = v;
  }
  get confirmTradeDeletion(): DisplaySettingsStore["confirmTradeDeletion"] {
    return this.display.confirmTradeDeletion;
  }
  set confirmTradeDeletion(v: DisplaySettingsStore["confirmTradeDeletion"]) {
    this.display.confirmTradeDeletion = v;
  }
  get confirmBulkDeletion(): DisplaySettingsStore["confirmBulkDeletion"] {
    return this.display.confirmBulkDeletion;
  }
  set confirmBulkDeletion(v: DisplaySettingsStore["confirmBulkDeletion"]) {
    this.display.confirmBulkDeletion = v;
  }
  get fontFamily(): DisplaySettingsStore["fontFamily"] {
    return this.display.fontFamily;
  }
  set fontFamily(v: DisplaySettingsStore["fontFamily"]) {
    this.display.fontFamily = v;
  }
  get cryptoPanicApiKey(): CoreSettingsStore["cryptoPanicApiKey"] {
    return this.core.cryptoPanicApiKey;
  }
  set cryptoPanicApiKey(v: CoreSettingsStore["cryptoPanicApiKey"]) {
    this.core.cryptoPanicApiKey = v;
  }
  get newsApiKey(): CoreSettingsStore["newsApiKey"] {
    return this.core.newsApiKey;
  }
  set newsApiKey(v: CoreSettingsStore["newsApiKey"]) {
    this.core.newsApiKey = v;
  }
  get cryptoPanicPlan(): CoreSettingsStore["cryptoPanicPlan"] {
    return this.core.cryptoPanicPlan;
  }
  set cryptoPanicPlan(v: CoreSettingsStore["cryptoPanicPlan"]) {
    this.core.cryptoPanicPlan = v;
  }
  get cryptoPanicFilter(): CoreSettingsStore["cryptoPanicFilter"] {
    return this.core.cryptoPanicFilter;
  }
  set cryptoPanicFilter(v: CoreSettingsStore["cryptoPanicFilter"]) {
    this.core.cryptoPanicFilter = v;
  }
  get newsOpenBehavior(): CoreSettingsStore["newsOpenBehavior"] {
    return this.core.newsOpenBehavior;
  }
  set newsOpenBehavior(v: CoreSettingsStore["newsOpenBehavior"]) {
    this.core.newsOpenBehavior = v;
  }
  get enableNewsAnalysis(): CoreSettingsStore["enableNewsAnalysis"] {
    return this.core.enableNewsAnalysis;
  }
  set enableNewsAnalysis(v: CoreSettingsStore["enableNewsAnalysis"]) {
    this.core.enableNewsAnalysis = v;
  }
  get cmcApiKey(): CoreSettingsStore["cmcApiKey"] {
    return this.core.cmcApiKey;
  }
  set cmcApiKey(v: CoreSettingsStore["cmcApiKey"]) {
    this.core.cmcApiKey = v;
  }
  get enableCmcContext(): CoreSettingsStore["enableCmcContext"] {
    return this.core.enableCmcContext;
  }
  set enableCmcContext(v: CoreSettingsStore["enableCmcContext"]) {
    this.core.enableCmcContext = v;
  }
  get showMarketOverviewLinks(): DisplaySettingsStore["showMarketOverviewLinks"] {
    return this.display.showMarketOverviewLinks;
  }
  set showMarketOverviewLinks(v: DisplaySettingsStore["showMarketOverviewLinks"]) {
    this.display.showMarketOverviewLinks = v;
  }
  get showMarketOverview(): DisplaySettingsStore["showMarketOverview"] {
    return this.display.showMarketOverview;
  }
  set showMarketOverview(v: DisplaySettingsStore["showMarketOverview"]) {
    this.display.showMarketOverview = v;
  }
  get showMarketActivity(): DisplaySettingsStore["showMarketActivity"] {
    return this.display.showMarketActivity;
  }
  set showMarketActivity(v: DisplaySettingsStore["showMarketActivity"]) {
    this.display.showMarketActivity = v;
  }
  get marketAnalysisInterval(): CoreSettingsStore["marketAnalysisInterval"] {
    return this.core.marketAnalysisInterval;
  }
  set marketAnalysisInterval(v: CoreSettingsStore["marketAnalysisInterval"]) {
    this.core.marketAnalysisInterval = v;
  }
  get pauseAnalysisOnBlur(): CoreSettingsStore["pauseAnalysisOnBlur"] {
    return this.core.pauseAnalysisOnBlur;
  }
  set pauseAnalysisOnBlur(v: CoreSettingsStore["pauseAnalysisOnBlur"]) {
    this.core.pauseAnalysisOnBlur = v;
  }
  get analysisTimeframes(): CoreSettingsStore["analysisTimeframes"] {
    return this.core.analysisTimeframes;
  }
  set analysisTimeframes(v: CoreSettingsStore["analysisTimeframes"]) {
    this.core.analysisTimeframes = v;
  }
  get showSidebarActivity(): DisplaySettingsStore["showSidebarActivity"] {
    return this.display.showSidebarActivity;
  }
  set showSidebarActivity(v: DisplaySettingsStore["showSidebarActivity"]) {
    this.display.showSidebarActivity = v;
  }
  /**
   * The live account object for a venue, safe to bind a credential input to.
   *
   * Total by the migration's invariant — `defaultAccountState()` and
   * `migrateAccounts` both guarantee one account per venue. The repair branch
   * should be unreachable; it appends to the live array rather than returning
   * a detached object, because a credential form bound to a detached account
   * would swallow everything a user types into it.
   */
  accountFor(exchange: ExchangeProvider): ExchangeAccount {
    const existing = accountForExchange(this.accounts, exchange);
    if (existing) return existing;

    // FEAT-0026 removed the push. This used to create the missing account
    // *in the live array*, which the 500 ms autosave then persisted — so
    // removing an account and opening Settings quietly brought it back. A
    // detached object keeps every existing reader working without being able
    // to resurrect anything.
    //
    // Prefer `activeAccountFor` in new code: this answers "which account is
    // on this venue", which stopped being the same question as "which
    // account is active" the moment a venue could hold two.
    return {
      id: LEGACY_ACCOUNT_IDS[exchange],
      name: defaultAccountName(exchange),
      exchange,
      keys: blankKeysFor(exchange),
    };
  }

  /**
   * Switch the active account — FEAT-0026.
   *
   * The `auth` parameter is the point. `account-switch` is confirmable but
   * not gated, so nothing structural stopped a call site from switching
   * without asking; only two functions can produce a `SwitchAuthorization`
   * and both consult the policy first, so skipping the prompt no longer
   * compiles. See the note on the token in `lib/confirmationPolicy.ts`.
   *
   * Writes `activeAccountId` and `_apiProvider` together, because a reader
   * that saw one without the other would resolve credentials for a venue the
   * active account is not on. Refuses an id that resolves to nothing rather
   * than storing it: a dangling active id makes every reader fall back to
   * empty credentials, which reads to a user as "my keys are gone".
   *
   * Returns whether the state changed, so a caller can skip the reconnect
   * and the confirmation on a no-op.
   */
  setActiveAccount(id: string, auth: SwitchAuthorization): boolean {
    void auth; // Required for its type, not its value.

    const target = this.accounts.find((account) => account.id === id);
    if (!target) return false;
    if (this.activeAccountId === id && this._apiProvider === target.exchange) {
      return false;
    }

    this.activeAccountId = id;
    this._apiProvider = target.exchange;
    this.save();
    return true;
  }

  /**
   * Add an account on a venue — FEAT-0026.
   *
   * Appended rather than replacing the array, so no existing account object
   * loses its identity: the credential inputs bind straight into those
   * objects, and swapping one out mid-typing detaches the field the user is
   * in. Returns the new account so a caller can focus it.
   */
  addAccount(exchange: ExchangeProvider): ExchangeAccount {
    const created = buildAccount(this.accounts, exchange);
    this.accounts.push(created);
    this.save();
    return created;
  }

  /**
   * Rename an account.
   *
   * Mutates `name` in place, which is the documented exception to this
   * project's immutability rule and the same exception `applyAccounts` takes:
   * replacing the object detaches the credential inputs bound to it. `$state`
   * proxies deeply, so the mutation is reactive, and `toJSON`'s
   * `$state.snapshot` picks it up.
   *
   * An empty name is refused rather than stored — an unnamed account in a
   * switch list is exactly the ambiguity this feature exists to remove.
   */
  renameAccount(id: string, name: string): boolean {
    const trimmed = name.trim();
    if (!trimmed) return false;

    const account = this.accounts.find((a) => a.id === id);
    if (!account) return false;

    account.name = trimmed;
    this.save();
    return true;
  }

  /**
   * Remove an account, its stored ciphertext, and its claim on being active.
   *
   * Refused when it would leave none — "at least one account exists" is the
   * invariant that replaced FEAT-0333's per-venue totality.
   *
   * Deleting the ciphertext here as well as the account is the point: the
   * save path prunes orphaned blobs too, but a user who removes an account
   * and never saves again should not leave Class A material on disk in the
   * meantime.
   *
   * Removing the *active* account rotates the session, because every cached
   * position, order and balance on screen belongs to it.
   */
  removeAccount(id: string): boolean {
    const next = removeAccountFrom(
      { accounts: $state.snapshot(this.accounts) as ExchangeAccount[], activeAccountId: this.activeAccountId },
      id,
    );
    if (!next) return false;

    const wasActive = this.activeAccountId === id;

    // Keep the surviving objects themselves, not the snapshot's copies, so
    // bound credential inputs stay attached.
    this.accounts = this.accounts.filter((account) => account.id !== id);
    if (this.encryptedAccountKeys) delete this.encryptedAccountKeys[id];

    if (wasActive) {
      this.activeAccountId = next.activeAccountId;
      const target = this.accounts.find((a) => a.id === next.activeAccountId);
      if (target) this._apiProvider = target.exchange;
    }

    // No `accountSession.reset()` here, deliberately.
    //
    // The clearing belongs to the reactive effect in `appEffects`, which
    // watches `activeAccountId` and the credential string. `activeAccountId`
    // also moves via the cross-tab storage listener calling `load()` and via
    // a restored backup, and only that effect observes all three — a clear
    // wired into this mutator would cover one path and quietly miss two.
    //
    // Calling it here also imported `accountSession` into this module, which
    // pulls in `accountState`, `omsService`, `tpSlState` and `tradeState` and
    // closed an import cycle. That cycle left a binding undefined in the
    // exchange-adapter path, which is how it was found: three passing
    // component tests started failing with the transport never reached.

    this.save();
    return true;
  }

  get effectiveShowSidebarActivity() {
    const bitget = keysForActiveAccount(this.accounts, this.activeAccountId, "bitget");
    const bitunix = keysForActiveAccount(this.accounts, this.activeAccountId, "bitunix");
    const hasBitgetKeys = Boolean(
      bitget.key && bitget.secret && bitget.passphrase,
    );
    const hasBitunixKeys = Boolean(bitunix.key && bitunix.secret);
    const hasApiKeys =
      this.apiProvider === "bitget" ? hasBitgetKeys : hasBitunixKeys;

    /*
     * FEAT-0327: a paper account is an account to show.
     *
     * The credential test asks "is there anything in this panel" and answers
     * it with "does a venue know us", which was the same question until paper
     * trading existed. It is not any more: someone practising before funding
     * an account has positions, orders and a balance, and none of it was
     * reachable — the panel this feature exists to be watched in was hidden
     * from exactly the people using it.
     */
    return (
      (this.entitlement.isPro || hasApiKeys || paperState.enabled) &&
      this.showSidebarActivity
    );
  }

  get showMarketSentiment(): DisplaySettingsStore["showMarketSentiment"] {
    return this.display.showMarketSentiment;
  }
  set showMarketSentiment(v: DisplaySettingsStore["showMarketSentiment"]) {
    this.display.showMarketSentiment = v;
  }
  get showTechnicalsSummary(): DisplaySettingsStore["showTechnicalsSummary"] {
    return this.display.showTechnicalsSummary;
  }
  set showTechnicalsSummary(v: DisplaySettingsStore["showTechnicalsSummary"]) {
    this.display.showTechnicalsSummary = v;
  }
  get showTechnicalsConfluence(): DisplaySettingsStore["showTechnicalsConfluence"] {
    return this.display.showTechnicalsConfluence;
  }
  set showTechnicalsConfluence(v: DisplaySettingsStore["showTechnicalsConfluence"]) {
    this.display.showTechnicalsConfluence = v;
  }
  get showTechnicalsVolatility(): DisplaySettingsStore["showTechnicalsVolatility"] {
    return this.display.showTechnicalsVolatility;
  }
  set showTechnicalsVolatility(v: DisplaySettingsStore["showTechnicalsVolatility"]) {
    this.display.showTechnicalsVolatility = v;
  }
  get showTechnicalsOscillators(): DisplaySettingsStore["showTechnicalsOscillators"] {
    return this.display.showTechnicalsOscillators;
  }
  set showTechnicalsOscillators(v: DisplaySettingsStore["showTechnicalsOscillators"]) {
    this.display.showTechnicalsOscillators = v;
  }
  get showTechnicalsMAs(): DisplaySettingsStore["showTechnicalsMAs"] {
    return this.display.showTechnicalsMAs;
  }
  set showTechnicalsMAs(v: DisplaySettingsStore["showTechnicalsMAs"]) {
    this.display.showTechnicalsMAs = v;
  }
  get showTechnicalsAdvanced(): DisplaySettingsStore["showTechnicalsAdvanced"] {
    return this.display.showTechnicalsAdvanced;
  }
  set showTechnicalsAdvanced(v: DisplaySettingsStore["showTechnicalsAdvanced"]) {
    this.display.showTechnicalsAdvanced = v;
  }
  get showTechnicalsSignals(): DisplaySettingsStore["showTechnicalsSignals"] {
    return this.display.showTechnicalsSignals;
  }
  set showTechnicalsSignals(v: DisplaySettingsStore["showTechnicalsSignals"]) {
    this.display.showTechnicalsSignals = v;
  }
  get showTechnicalsPivots(): DisplaySettingsStore["showTechnicalsPivots"] {
    return this.display.showTechnicalsPivots;
  }
  set showTechnicalsPivots(v: DisplaySettingsStore["showTechnicalsPivots"]) {
    this.display.showTechnicalsPivots = v;
  }
  get showTvLink(): DisplaySettingsStore["showTvLink"] {
    return this.display.showTvLink;
  }
  set showTvLink(v: DisplaySettingsStore["showTvLink"]) {
    this.display.showTvLink = v;
  }
  get showCgHeatLink(): DisplaySettingsStore["showCgHeatLink"] {
    return this.display.showCgHeatLink;
  }
  set showCgHeatLink(v: DisplaySettingsStore["showCgHeatLink"]) {
    this.display.showCgHeatLink = v;
  }
  get heatmapMode(): DisplaySettingsStore["heatmapMode"] {
    return this.display.heatmapMode;
  }
  set heatmapMode(v: DisplaySettingsStore["heatmapMode"]) {
    this.display.heatmapMode = v;
  }
  get showBrokerLink(): DisplaySettingsStore["showBrokerLink"] {
    return this.display.showBrokerLink;
  }
  set showBrokerLink(v: DisplaySettingsStore["showBrokerLink"]) {
    this.display.showBrokerLink = v;
  }
  get rssPresets(): DisplaySettingsStore["rssPresets"] {
    return this.display.rssPresets;
  }
  set rssPresets(v: DisplaySettingsStore["rssPresets"]) {
    this.display.rssPresets = v;
  }
  get customRssFeeds(): DisplaySettingsStore["customRssFeeds"] {
    return this.display.customRssFeeds;
  }
  set customRssFeeds(v: DisplaySettingsStore["customRssFeeds"]) {
    this.display.customRssFeeds = v;
  }

  get enableGlassmorphism(): DisplaySettingsStore["enableGlassmorphism"] {
    return this.display.enableGlassmorphism;
  }
  set enableGlassmorphism(v: DisplaySettingsStore["enableGlassmorphism"]) {
    this.display.enableGlassmorphism = v;
  }
  get backgroundType(): DisplaySettingsStore["backgroundType"] {
    return this.display.backgroundType;
  }
  set backgroundType(v: DisplaySettingsStore["backgroundType"]) {
    this.display.backgroundType = v;
  }
  get backgroundUrl(): DisplaySettingsStore["backgroundUrl"] {
    return this.display.backgroundUrl;
  }
  set backgroundUrl(v: DisplaySettingsStore["backgroundUrl"]) {
    this.display.backgroundUrl = v;
  }
  get backgroundOpacity(): DisplaySettingsStore["backgroundOpacity"] {
    return this.display.backgroundOpacity;
  }
  set backgroundOpacity(v: DisplaySettingsStore["backgroundOpacity"]) {
    this.display.backgroundOpacity = v;
  }
  get backgroundBlur(): DisplaySettingsStore["backgroundBlur"] {
    return this.display.backgroundBlur;
  }
  set backgroundBlur(v: DisplaySettingsStore["backgroundBlur"]) {
    this.display.backgroundBlur = v;
  }
  get backgroundAnimationPreset(): DisplaySettingsStore["backgroundAnimationPreset"] {
    return this.display.backgroundAnimationPreset;
  }
  set backgroundAnimationPreset(v: DisplaySettingsStore["backgroundAnimationPreset"]) {
    this.display.backgroundAnimationPreset = v;
  }
  get backgroundAnimationIntensity(): DisplaySettingsStore["backgroundAnimationIntensity"] {
    return this.display.backgroundAnimationIntensity;
  }
  set backgroundAnimationIntensity(v: DisplaySettingsStore["backgroundAnimationIntensity"]) {
    this.display.backgroundAnimationIntensity = v;
  }
  get videoPlaybackSpeed(): DisplaySettingsStore["videoPlaybackSpeed"] {
    return this.display.videoPlaybackSpeed;
  }
  set videoPlaybackSpeed(v: DisplaySettingsStore["videoPlaybackSpeed"]) {
    this.display.videoPlaybackSpeed = v;
  }
  get galaxySettings(): DisplaySettingsStore["galaxySettings"] {
    return this.display.galaxySettings;
  }
  set galaxySettings(v: DisplaySettingsStore["galaxySettings"]) {
    this.display.galaxySettings = v;
  }
  get enableTelemetry(): DisplaySettingsStore["enableTelemetry"] {
    return this.display.enableTelemetry;
  }
  set enableTelemetry(v: DisplaySettingsStore["enableTelemetry"]) {
    this.display.enableTelemetry = v;
  }
  get enableNetworkLogs(): DisplaySettingsStore["enableNetworkLogs"] {
    return this.display.enableNetworkLogs;
  }
  set enableNetworkLogs(v: DisplaySettingsStore["enableNetworkLogs"]) {
    this.display.enableNetworkLogs = v;
  }
  get logSettings(): DisplaySettingsStore["logSettings"] {
    return this.display.logSettings;
  }
  set logSettings(v: DisplaySettingsStore["logSettings"]) {
    this.display.logSettings = v;
  }

  get discordBotToken(): DisplaySettingsStore["discordBotToken"] {
    return this.display.discordBotToken;
  }
  set discordBotToken(v: DisplaySettingsStore["discordBotToken"]) {
    this.display.discordBotToken = v;
  }
  get discordChannels(): DisplaySettingsStore["discordChannels"] {
    return this.display.discordChannels;
  }
  set discordChannels(v: DisplaySettingsStore["discordChannels"]) {
    this.display.discordChannels = v;
  }

  get enableBurningBorders(): DisplaySettingsStore["enableBurningBorders"] {
    return this.display.enableBurningBorders;
  }
  set enableBurningBorders(v: DisplaySettingsStore["enableBurningBorders"]) {
    this.display.enableBurningBorders = v;
  }
  get borderEffect(): DisplaySettingsStore["borderEffect"] {
    return this.display.borderEffect;
  }
  set borderEffect(v: DisplaySettingsStore["borderEffect"]) {
    this.display.borderEffect = v;
  }
  get borderEffectColorMode(): DisplaySettingsStore["borderEffectColorMode"] {
    return this.display.borderEffectColorMode;
  }
  set borderEffectColorMode(v: DisplaySettingsStore["borderEffectColorMode"]) {
    this.display.borderEffectColorMode = v;
  }
  get borderEffectCustomColor(): DisplaySettingsStore["borderEffectCustomColor"] {
    return this.display.borderEffectCustomColor;
  }
  set borderEffectCustomColor(v: DisplaySettingsStore["borderEffectCustomColor"]) {
    this.display.borderEffectCustomColor = v;
  }
  get burningBordersIntensity(): DisplaySettingsStore["burningBordersIntensity"] {
    return this.display.burningBordersIntensity;
  }
  set burningBordersIntensity(v: DisplaySettingsStore["burningBordersIntensity"]) {
    this.display.burningBordersIntensity = v;
  }
  get burnCharts(): DisplaySettingsStore["burnCharts"] {
    return this.display.burnCharts;
  }
  set burnCharts(v: DisplaySettingsStore["burnCharts"]) {
    this.display.burnCharts = v;
  }
  get burnModals(): DisplaySettingsStore["burnModals"] {
    return this.display.burnModals;
  }
  set burnModals(v: DisplaySettingsStore["burnModals"]) {
    this.display.burnModals = v;
  }
  get burnChannels(): DisplaySettingsStore["burnChannels"] {
    return this.display.burnChannels;
  }
  set burnChannels(v: DisplaySettingsStore["burnChannels"]) {
    this.display.burnChannels = v;
  }
  get burnMarketOverviewTiles(): DisplaySettingsStore["burnMarketOverviewTiles"] {
    return this.display.burnMarketOverviewTiles;
  }
  set burnMarketOverviewTiles(v: DisplaySettingsStore["burnMarketOverviewTiles"]) {
    this.display.burnMarketOverviewTiles = v;
  }
  get burnFlashCards(): DisplaySettingsStore["burnFlashCards"] {
    return this.display.burnFlashCards;
  }
  set burnFlashCards(v: DisplaySettingsStore["burnFlashCards"]) {
    this.display.burnFlashCards = v;
  }
  get burnJournal(): DisplaySettingsStore["burnJournal"] {
    return this.display.burnJournal;
  }
  set burnJournal(v: DisplaySettingsStore["burnJournal"]) {
    this.display.burnJournal = v;
  }

  get enableAmbientTopline(): DisplaySettingsStore["enableAmbientTopline"] {
    return this.display.enableAmbientTopline;
  }
  set enableAmbientTopline(v: DisplaySettingsStore["enableAmbientTopline"]) {
    this.display.enableAmbientTopline = v;
  }
  get ambientToplineMode(): DisplaySettingsStore["ambientToplineMode"] {
    return this.display.ambientToplineMode;
  }
  set ambientToplineMode(v: DisplaySettingsStore["ambientToplineMode"]) {
    this.display.ambientToplineMode = v;
  }
  get ambientToplineIntensity(): DisplaySettingsStore["ambientToplineIntensity"] {
    return this.display.ambientToplineIntensity;
  }
  set ambientToplineIntensity(v: DisplaySettingsStore["ambientToplineIntensity"]) {
    this.display.ambientToplineIntensity = v;
  }
  get ambientToplineBursts(): DisplaySettingsStore["ambientToplineBursts"] {
    return this.display.ambientToplineBursts;
  }
  set ambientToplineBursts(v: DisplaySettingsStore["ambientToplineBursts"]) {
    this.display.ambientToplineBursts = v;
  }

  get visualQuality(): DisplaySettingsStore["visualQuality"] {
    return this.display.visualQuality;
  }
  set visualQuality(v: DisplaySettingsStore["visualQuality"]) {
    this.display.visualQuality = v;
  }

  get fireConfig(): DisplaySettingsStore["fireConfig"] {
    return this.display.fireConfig;
  }
  set fireConfig(v: DisplaySettingsStore["fireConfig"]) {
    this.display.fireConfig = v;
  }

  updateFireConfig(newConfig: Partial<DisplaySettingsStore["fireConfig"]>) {
    this.fireConfig = { ...this.fireConfig, ...newConfig };
  }

  resetGalaxySettings() {
    resetGalaxy(this, defaultSettings);
  }

  resetTradeFlowSettings() {
    resetTradeFlow(this, defaultSettings);
  }

  /** Restores every Settings → Chart field to its default (reset button). */
  resetChartSettings() {
    resetChart(this, defaultSettings);
  }

  // Market & Performance State (owns no $state itself: `marketMode` state
  // lives in the core sub-store, the getter/setter below keeps the side
  // effect in `applyMarketMode` on the manager).
  get analyzeAllFavorites(): CoreSettingsStore["analyzeAllFavorites"] {
    return this.core.analyzeAllFavorites;
  }
  set analyzeAllFavorites(v: CoreSettingsStore["analyzeAllFavorites"]) {
    this.core.analyzeAllFavorites = v;
  }
  get marketCacheSize(): CoreSettingsStore["marketCacheSize"] {
    return this.core.marketCacheSize;
  }
  set marketCacheSize(v: CoreSettingsStore["marketCacheSize"]) {
    this.core.marketCacheSize = v;
  }

  get brokenAlertReport(): CoreSettingsStore["brokenAlertReport"] {
    return this.core.brokenAlertReport;
  }
  set brokenAlertReport(v: CoreSettingsStore["brokenAlertReport"]) {
    this.core.brokenAlertReport = v;
  }

  get technicalsUpdateMode(): CoreSettingsStore["technicalsUpdateMode"] {
    return this.core.technicalsUpdateMode;
  }
  set technicalsUpdateMode(v: CoreSettingsStore["technicalsUpdateMode"]) {
    this.core.technicalsUpdateMode = v;
  }
  get technicalsUpdateInterval(): CoreSettingsStore["technicalsUpdateInterval"] {
    return this.core.technicalsUpdateInterval;
  }
  set technicalsUpdateInterval(v: CoreSettingsStore["technicalsUpdateInterval"]) {
    this.core.technicalsUpdateInterval = v;
  }
  get technicalsCacheSize(): CoreSettingsStore["technicalsCacheSize"] {
    return this.core.technicalsCacheSize;
  }
  set technicalsCacheSize(v: CoreSettingsStore["technicalsCacheSize"]) {
    this.core.technicalsCacheSize = v;
  }
  get technicalsCacheTTL(): CoreSettingsStore["technicalsCacheTTL"] {
    return this.core.technicalsCacheTTL;
  }
  set technicalsCacheTTL(v: CoreSettingsStore["technicalsCacheTTL"]) {
    this.core.technicalsCacheTTL = v;
  }
  get maxTechnicalsHistory(): CoreSettingsStore["maxTechnicalsHistory"] {
    return this.core.maxTechnicalsHistory;
  }
  set maxTechnicalsHistory(v: CoreSettingsStore["maxTechnicalsHistory"]) {
    this.core.maxTechnicalsHistory = v;
  }
  get enableIndicatorOptimization(): CoreSettingsStore["enableIndicatorOptimization"] {
    return this.core.enableIndicatorOptimization;
  }
  set enableIndicatorOptimization(v: CoreSettingsStore["enableIndicatorOptimization"]) {
    this.core.enableIndicatorOptimization = v;
  }
  get chartHistoryLimit(): CoreSettingsStore["chartHistoryLimit"] {
    return this.core.chartHistoryLimit;
  }
  set chartHistoryLimit(v: CoreSettingsStore["chartHistoryLimit"]) {
    this.core.chartHistoryLimit = v;
  }
  get chartRenderIntervalMs(): CoreSettingsStore["chartRenderIntervalMs"] {
    return this.core.chartRenderIntervalMs;
  }
  set chartRenderIntervalMs(v: CoreSettingsStore["chartRenderIntervalMs"]) {
    this.core.chartRenderIntervalMs = v;
  }
  get repairTimeframe(): CoreSettingsStore["repairTimeframe"] {
    return this.core.repairTimeframe;
  }
  set repairTimeframe(v: CoreSettingsStore["repairTimeframe"]) {
    this.core.repairTimeframe = v;
  }

  get chartPriceScaleMode(): CoreSettingsStore["chartPriceScaleMode"] {
    return this.core.chartPriceScaleMode;
  }
  set chartPriceScaleMode(v: CoreSettingsStore["chartPriceScaleMode"]) {
    this.core.chartPriceScaleMode = v;
  }
  get chartAutoScale(): CoreSettingsStore["chartAutoScale"] {
    return this.core.chartAutoScale;
  }
  set chartAutoScale(v: CoreSettingsStore["chartAutoScale"]) {
    this.core.chartAutoScale = v;
  }
  get chartInvertScale(): CoreSettingsStore["chartInvertScale"] {
    return this.core.chartInvertScale;
  }
  set chartInvertScale(v: CoreSettingsStore["chartInvertScale"]) {
    this.core.chartInvertScale = v;
  }
  get chartDecimalsMode(): CoreSettingsStore["chartDecimalsMode"] {
    return this.core.chartDecimalsMode;
  }
  set chartDecimalsMode(v: CoreSettingsStore["chartDecimalsMode"]) {
    this.core.chartDecimalsMode = v;
  }
  get chartFixedDecimals(): CoreSettingsStore["chartFixedDecimals"] {
    return this.core.chartFixedDecimals;
  }
  set chartFixedDecimals(v: CoreSettingsStore["chartFixedDecimals"]) {
    this.core.chartFixedDecimals = v;
  }
  get chartShowGrid(): CoreSettingsStore["chartShowGrid"] {
    return this.core.chartShowGrid;
  }
  set chartShowGrid(v: CoreSettingsStore["chartShowGrid"]) {
    this.core.chartShowGrid = v;
  }
  get chartLastValueVisible(): CoreSettingsStore["chartLastValueVisible"] {
    return this.core.chartLastValueVisible;
  }
  set chartLastValueVisible(v: CoreSettingsStore["chartLastValueVisible"]) {
    this.core.chartLastValueVisible = v;
  }
  get chartCandleBorders(): CoreSettingsStore["chartCandleBorders"] {
    return this.core.chartCandleBorders;
  }
  set chartCandleBorders(v: CoreSettingsStore["chartCandleBorders"]) {
    this.core.chartCandleBorders = v;
  }
  get chartWatermark(): CoreSettingsStore["chartWatermark"] {
    return this.core.chartWatermark;
  }
  set chartWatermark(v: CoreSettingsStore["chartWatermark"]) {
    this.core.chartWatermark = v;
  }
  get chartCrosshairMode(): CoreSettingsStore["chartCrosshairMode"] {
    return this.core.chartCrosshairMode;
  }
  set chartCrosshairMode(v: CoreSettingsStore["chartCrosshairMode"]) {
    this.core.chartCrosshairMode = v;
  }
  get chartCrosshairStyle(): CoreSettingsStore["chartCrosshairStyle"] {
    return this.core.chartCrosshairStyle;
  }
  set chartCrosshairStyle(v: CoreSettingsStore["chartCrosshairStyle"]) {
    this.core.chartCrosshairStyle = v;
  }
  get chartSecondsVisible(): CoreSettingsStore["chartSecondsVisible"] {
    return this.core.chartSecondsVisible;
  }
  set chartSecondsVisible(v: CoreSettingsStore["chartSecondsVisible"]) {
    this.core.chartSecondsVisible = v;
  }
  get chartFixEdges(): CoreSettingsStore["chartFixEdges"] {
    return this.core.chartFixEdges;
  }
  set chartFixEdges(v: CoreSettingsStore["chartFixEdges"]) {
    this.core.chartFixEdges = v;
  }
  get chartCountdownEnabled(): CoreSettingsStore["chartCountdownEnabled"] {
    return this.core.chartCountdownEnabled;
  }
  set chartCountdownEnabled(v: CoreSettingsStore["chartCountdownEnabled"]) {
    this.core.chartCountdownEnabled = v;
  }
  get autoTrading(): CoreSettingsStore["autoTrading"] {
    return this.core.autoTrading;
  }
  set autoTrading(v: CoreSettingsStore["autoTrading"]) {
    this.core.autoTrading = v;
  }
  get multiAccount(): CoreSettingsStore["multiAccount"] {
    return this.core.multiAccount;
  }
  set multiAccount(v: CoreSettingsStore["multiAccount"]) {
    this.core.multiAccount = v;
  }

  get enableDockingCentered(): DisplaySettingsStore["enableDockingCentered"] {
    return this.display.enableDockingCentered;
  }
  set enableDockingCentered(v: DisplaySettingsStore["enableDockingCentered"]) {
    this.display.enableDockingCentered = v;
  }
  get dockingPosition(): DisplaySettingsStore["dockingPosition"] {
    return this.display.dockingPosition;
  }
  set dockingPosition(v: DisplaySettingsStore["dockingPosition"]) {
    this.display.dockingPosition = v;
  }

  get marketMode(): CoreSettingsStore["marketMode"] {
    return this.core.marketMode;
  }

  set marketMode(v: MarketMode) {
    if (v !== this.core.marketMode) {
      this.core.marketMode = v;
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
  private storageListener: ((e: StorageEvent) => void) | null = null;

  /**
   * True while the obfuscation-mode background decryption of
   * `encryptedApiKeys` is still in flight (BUG-0280). Until it settles the
   * live credential fields are not yet refilled, so a save must preserve
   * existing blobs instead of reading the empty fields as "user cleared
   * the keys" and deleting them.
   */
  private apiKeyDecryptPending = false;

  /**
   * True while the obfuscation-mode background decryption of
   * `encryptedProviderConfigs` is in flight (FEAT-0467). Same role as
   * `apiKeyDecryptPending`: a save must not read the not-yet-refilled
   * providers as "the user cleared the keys".
   */
  private providerConfigDecryptPending = false;

  /**
   * Set by `load()` when legacy plaintext exchange credentials were found in
   * storage (pre-BUG-0280 blobs). The constructor fires one immediate save
   * so the migration to device-key ciphertext happens on first launch, not
   * at the next unrelated settings change.
   */
  private needsCredentialRewrite = false;

  // Security State
  encryptedAccountKeys = $state<Settings["encryptedAccountKeys"]>(undefined);
  encryptedProviderConfigs = $state<Settings["encryptedProviderConfigs"]>(undefined);
  encryptedSecrets = $state<Settings["encryptedSecrets"]>(undefined);
  isEncrypted = $state(false);
  isLocked = $state(false);
  decryptionFailures = $state(0);

  /**
   * Set by `save()` when one or more credential encryptions failed
   * (BUG-0519). The stale blobs were dropped, so the affected credentials
   * live only in memory until re-entered and successfully saved — the
   * encrypt-side mirror of `decryptionFailures`, surfaced by the same
   * settings-tab banners.
   */
  encryptionFailures = $state(0);

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

          // Declared tracking (ADR-0024 decision 1): iterate the schema's
          // field list explicitly instead of calling `toJSON()`. The reads
          // are identical by construction (`readSerializedField` serves
          // both), but the effect no longer depends on `toJSON()` — a
          // memoised or restructured serializer cannot silently un-save
          // the store anymore.
          const self = this as unknown as Record<keyof Settings, unknown>;
          trackAutosaveReads({
            read: <K extends keyof Settings>(key: K): Settings[K] =>
              self[key] as Settings[K],
            snapshot: <T>(value: T): T => $state.snapshot(value) as T,
            entitlement: this.entitlement,
          });

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
      if (this.needsCredentialRewrite) void this.save();

      if (import.meta.env.DEV) {
        console.warn("[Settings] Store ready. Provider:", this.apiProvider);
      }

      // 3. Listen for changes from other tabs
      this.storageListener = (e: StorageEvent) => {
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
      };
      if (typeof window !== "undefined") window.addEventListener("storage", this.storageListener);
    }
  }

  // --- Security Methods ---

  /**
   * Unifies the provider registry (pure core in `ensureProviderRegistryState`,
   * tested directly). Idempotent, so it is safe to run after every
   * decrypt-replace of the registry.
   */
  private ensureProviderRegistry(): void {
    const result = ensureProviderRegistryState({
      userProviders: this.userProviders,
      activeProviderId: this.activeProviderId,
      aiProvider: this.aiProvider,
      legacy: {
        openai: {
          apiKey: this.openaiApiKey,
          model: this.openaiModel,
          baseUrl: this.openaiBaseUrl,
        },
        anthropic: {
          apiKey: this.anthropicApiKey,
          model: this.anthropicModel,
          baseUrl: this.anthropicBaseUrl,
        },
        gemini: {
          apiKey: this.geminiApiKey,
          model: this.geminiModel,
          baseUrl: this.geminiBaseUrl,
        },
        openrouter: {
          apiKey: this.openrouterApiKey,
          model: this.openrouterModel,
          baseUrl: this.openrouterBaseUrl,
        },
        ollama: {
          apiKey: "",
          model: this.ollamaModel,
          baseUrl: this.ollamaBaseUrl,
        },
      },
    });
    this.userProviders = result.userProviders;
    this.activeProviderId = result.activeProviderId;
    this.aiProvider = result.aiProvider;
  }

  async unlock(password: string): Promise<boolean> {
    const success = await cryptoService.unlockSession(password);
    if (!success) return false;

    let aborted = false;
    try {
      const tasks: Promise<void>[] = [];
      let failures = 0;

      // 1. Decrypt Exchange Keys
      if (this.encryptedAccountKeys) {
        const eak = this.encryptedAccountKeys;
        for (const [accountId, blob] of Object.entries(eak)) {
          if (!blob) continue;
          tasks.push(
            (async () => {
              // Per account, like the generic-secrets loop below. Without
              // this the first unreadable blob rejects the `Promise.all`,
              // the outer catch calls `lock()`, and `unlock()` returns
              // false — one corrupt account locks the user out of *every*
              // account, at a probability that grows with account count.
              // A counted failure surfaces through `decryptionFailures`
              // and leaves the readable accounts usable.
              try {
                const json = await cryptoService.decrypt(blob);
                if (aborted) return;
                const account = this.accounts.find((a) => a.id === accountId);
                // A blob whose account no longer exists is left encrypted and
                // unused rather than restored into a fresh account: reviving
                // credentials a user removed is worse than an orphaned blob.
                if (account) account.keys = JSON.parse(json);
              } catch (e) {
                failures++;
                console.error(
                  "[Settings] Failed to decrypt keys for account " + accountId,
                  e,
                );
              }
            })(),
          );
        }
      }

      // 1b. Decrypt User Provider Configs (FEAT-0467)
      if (this.encryptedProviderConfigs) {
        const blob = this.encryptedProviderConfigs;
        tasks.push(
          (async () => {
            try {
              const json = await cryptoService.decrypt(blob);
              if (aborted) return;
              this.userProviders = sanitizeUserProviders(JSON.parse(json));
              this.ensureProviderRegistry();
            } catch (e) {
              failures++;
              console.error(
                "[Settings] Failed to decrypt user provider configs",
                e,
              );
            }
          })(),
        );
      }

      // 2. Decrypt Generic Secrets
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
      // Credentials go, names and ids stay — locking hides the keys, it does
      // not forget which accounts exist.
      this.accounts = redactAccounts(this.accounts);
      this.userProviders = redactUserProviders(this.userProviders);

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
      const accountBlobs: Record<string, EncryptedBlob> = {};
      const newSecrets: Record<string, EncryptedBlob> = {};

      const tasks: Promise<void>[] = [];

      for (const account of this.accounts) {
        // The save path checks this (`applyAccountKeyEncryption`) and so does
        // the generic-secrets loop below; this one did not. Encrypting an
        // empty credential set writes ciphertext of `{"key":"","secret":""}`,
        // which makes `Object.keys(encryptedAccountKeys).length > 0` — the
        // test for "is this an encrypted profile" — true for a profile that
        // holds no credentials at all.
        if (!apiKeyHasMaterial(account.keys)) continue;
        tasks.push(
          (async () => {
            accountBlobs[account.id] = await cryptoService.encrypt(
              JSON.stringify(account.keys),
            );
          })(),
        );
      }

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

      let providerBlob: EncryptedBlob | undefined = undefined;
      if (this.userProviders.some((p) => p.apiKey.length > 0)) {
        providerBlob = await cryptoService.encrypt(
          JSON.stringify(this.userProviders),
        );
      }

      this.encryptedAccountKeys = accountBlobs;
      this.encryptedProviderConfigs = providerBlob;
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
      const d = safeLocalStorage.getItem(CONSTANTS.LOCAL_STORAGE_SETTINGS_KEY);
      if (!d) {
        // No settings found, save defaults
        this.save();
        return;
      }

      const parsed = JSON.parse(d);

      // Credentials are merged inside `applyAccounts`, which reads both the
      // account list and the venue-indexed shape that predates FEAT-0333.
      //
      // `accounts` and `activeAccountId` are handed through from `parsed`
      // EXPLICITLY, undefined included. The defaults carry one empty account
      // per venue, so a plain spread would give every legacy profile a
      // non-empty `accounts` and the migration would conclude "already
      // converted" — and never read `apiKeys` at all. That reads to a
      // returning user as credentials silently gone.
      const merged = {
        ...defaultSettings,
        ...parsed,
        accounts: parsed.accounts,
        activeAccountId: parsed.activeAccountId,
      } as Settings & LegacyCredentialShape;

      // Granular updates to preserve object references if components bind to them
      const apiKeyResult = this.secretsLoader.applyAccounts(merged, this.accounts);
      this.isEncrypted = apiKeyResult.isEncrypted;
      this.isLocked = apiKeyResult.isLocked;
      this.encryptedAccountKeys = apiKeyResult.encryptedAccountKeys;
      this.encryptedProviderConfigs = merged.encryptedProviderConfigs;
      this.accounts = apiKeyResult.accounts;
      this.activeAccountId = apiKeyResult.activeAccountId;

      // FEAT-0026: the venue follows the active account, rather than being
      // derived from storage a second time.
      //
      // `apiProvider` and `activeAccountId` are one fact under two names.
      // This used to write the private field *before* `applyAccounts` ran,
      // from `merged.apiProvider` — an independent derivation of the same
      // thing, which is precisely how the two come to disagree. Now the
      // account resolves first and the venue is read off it.
      //
      // The stored value is still the fallback, and `resolveActiveId` already
      // uses it to pick the active account, so a legacy profile lands on the
      // same venue it always did. Set directly rather than through the
      // setter, to avoid the dual logging the old comment here noted.
      const storedProvider = resolveApiProvider(merged.apiProvider);
      this._apiProvider =
        activeAccountFor(this.accounts, this.activeAccountId, storedProvider)
          ?.exchange ?? storedProvider;

      // BUG-0280 migration flag: storage predating the fix kept exchange
      // credentials as plaintext whenever no master password was set. They
      // stay usable in memory (above); the constructor's immediate save
      // re-persists them as device-key ciphertext on first launch.
      const hasPlaintextCredentials =
        !this.isEncrypted &&
        !(
          apiKeyResult.encryptedAccountKeys &&
          Object.keys(apiKeyResult.encryptedAccountKeys).length > 0
        ) &&
        this.accounts.some((account) => apiKeyHasMaterial(account.keys));

      const hasPlaintextProviderKeys =
        !this.isEncrypted &&
        !merged.encryptedProviderConfigs &&
        sanitizeUserProviders(merged.userProviders).some(
          (provider) => provider.apiKey.length > 0,
        );

      // FEAT-0333: a profile stored in the venue-indexed shape converted in
      // memory just now. Persist it at once rather than waiting for whatever
      // save happens next — until it lands, `localStorage` holds a second,
      // stale copy of the same credentials, and a restore cannot tell which
      // of the two is meant.
      const convertedFromLegacyShape =
        !parsed.accounts && Boolean(parsed.apiKeys || parsed.encryptedApiKeys);

      this.needsCredentialRewrite =
        hasPlaintextCredentials || convertedFromLegacyShape || hasPlaintextProviderKeys;

      // Security: Load Encrypted Secrets (Generic) and the device-key-
      // encrypted exchange keys (BUG-0280). Both decrypt against the device
      // key in obfuscation mode. load() stays synchronous: fire-and-forget
      // background tasks with a single `secretsReady` release once every
      // task settled, success or failure.
      if (!this.isEncrypted) {
        this.decryptionFailures = 0;
        const backgroundTasks: Promise<unknown>[] = [];
        let apiKeyFailures = 0;

        // Already migrated onto account ids by `applyAccounts`.
        const eak = apiKeyResult.encryptedAccountKeys;
        if (eak && Object.keys(eak).length > 0) {
          this.apiKeyDecryptPending = true;
          backgroundTasks.push(
            this.secretsLoader
              .decryptAccountKeysWithDeviceKey(eak)
              .then((restored) => {
                apiKeyFailures = restored.failures;
                // Refill only accounts nothing else has populated; typed-but-
                // unsaved credentials win over the stored ciphertext.
                for (const [accountId, keys] of Object.entries(
                  restored.keysByAccount,
                )) {
                  const account = this.accounts.find((a) => a.id === accountId);
                  if (account && !apiKeyHasMaterial(account.keys)) {
                    account.keys = keys;
                  }
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

        if (merged.encryptedProviderConfigs) {
          this.providerConfigDecryptPending = true;
          const providerBlob = merged.encryptedProviderConfigs;
          backgroundTasks.push(
            this.secretsLoader
              .decryptProviderConfigsWithDeviceKey(providerBlob)
              .then((providers) => {
                // Credentials typed-but-unsaved win over stored ciphertext.
                if (
                  providers &&
                  !this.userProviders.some((p) => p.apiKey.length > 0)
                ) {
                  this.userProviders = providers;
                  this.ensureProviderRegistry();
                }
              })
              .catch((e) => {
                console.error(
                  "[Settings] Failed to initialize provider config decryption",
                  e,
                );
              })
              .finally(() => {
                this.providerConfigDecryptPending = false;
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

      // A schema-level failure — an unknown `save`/`load` mode, a `case` that
      // does not exist — is a programming error, not corrupt storage. Letting
      // it reach the catch below would overwrite the user's entire profile
      // with defaults, turning a one-line typo into silent total data loss
      // (Class A). Scoped here: log unconditionally and carry on, so a single
      // bad row costs that field instead of the profile.
      try {
        this.applyCoreFields(merged);
        this.applyDisplayFields(merged, parsed);
      } catch (schemaError) {
        console.error("[Settings] Persistence schema load failed:", schemaError);
      }
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
    this.applySchemaLoad(loadSchemaEntries("core"), merged);
    this.ensureProviderRegistry();
  }

  /** Display/UI, background customization and Burning Borders fields. Part of load()'s merge+assign step. */
  private applyDisplayFields(merged: Settings, rawParsed?: Partial<Settings>) {
    this.applySchemaLoad(loadSchemaEntries("display"), merged, rawParsed);
  }

  /**
   * Restores one `apply*` section from the persistence schema. The table owns
   * the per-key semantics; this only performs the reactive assignments, so
   * the autosave `$effect` keeps tracking every field through `toJSON()`.
   */
  private applySchemaLoad(
    fields: readonly FieldSchema[],
    merged: Settings,
    rawParsed?: Partial<Settings>,
  ) {
    const target: LoadTarget = {
      set: (key, value) => {
        // `_marketMode` is the one key the load path addresses behind the
        // public name: `loadCustomValue("marketMode")` writes it directly so
        // `load()` never fires the setter (which would `applyMarketMode`
        // and overwrite the four profile fields on every boot). The state
        // lives in the core sub-store since ADR-0024 decision 2 — routing
        // here keeps the bypass working without resurrecting a manager
        // field, and without touching the setter contract the schema test
        // pins (`loads marketMode into the private field, never through
        // the setter`).
        if (key === "_marketMode") {
          this.core.marketMode = value as MarketMode;
          return;
        }
        (this as unknown as Record<string, unknown>)[key] = value;
      },
      entitlement: this.entitlement,
    };
    for (const field of fields) {
      // Per-row isolation lives in `applySchemaField` (never throws): a bad
      // row costs exactly that field, not the remainder of the section. The
      // load()-level catch below stays as the backstop for anything thrown
      // outside this loop (`ensureProviderRegistry`, the drivers themselves).
      applySchemaField(target, field, merged, defaultSettings, rawParsed);
    }
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
        // Obfuscation Mode: Use Device Key (guard measured centrally inside getDeviceKey)
        encryptionPassword = await this.secretsLoader.getDeviceKey();
      } else {
        // Master Password Mode: Use Session Key (implicit)
        // If locked, we cannot encrypt new data.
        if (this.isLocked || !cryptoService.isUnlocked()) {
          canEncrypt = false;
        }
      }

      // BUG-0280: encrypt the exchange credentials from the live state (the
      // serialized block above only ever carries placeholders). While the
      // background device-key decryption is still refilling the fields, an
      // existing blob must survive instead of being read as "cleared".
      //
      // BUG-0519: every encrypt-side call reports its failure count, and a
      // failed credential's stale blob is already dropped inside the loader.
      // The aggregate lands on `encryptionFailures` so the settings tabs can
      // tell the user which save did not stick.
      let encryptionFailures = 0;
      encryptionFailures += await this.secretsLoader.applyFieldEncryption(
        data,
        canEncrypt,
        encryptionPassword,
      );
      encryptionFailures += await this.secretsLoader.applyAccountKeyEncryption(
        data,
        $state.snapshot(this.accounts),
        canEncrypt,
        encryptionPassword,
        !this.apiKeyDecryptPending,
      );

      // FEAT-0467: the serialized `userProviders` block carries redacted
      // credentials; encrypt the live ones separately, same treatment as the
      // exchange accounts above.
      encryptionFailures +=
        await this.secretsLoader.applyProviderConfigEncryption(
          data,
          $state.snapshot(this.userProviders),
          canEncrypt,
          encryptionPassword,
          !this.providerConfigDecryptPending,
        );
      // A locked-session save cannot encrypt (every loader returns 0
      // early) and must not clear a previously reported failure: the
      // dropped blobs are still gone, so the banner stays until a save
      // that actually encrypts succeeds and resets the count.
      if (canEncrypt) {
        this.encryptionFailures = encryptionFailures;
      }

      const current = safeLocalStorage.getItem(
        CONSTANTS.LOCAL_STORAGE_SETTINGS_KEY,
      );
      const newData = JSON.stringify(data);

      // Only save if actually different (prevent unnecessary writes)
      if (current !== newData) {
        const success = StorageHelper.safeSave(
          CONSTANTS.LOCAL_STORAGE_SETTINGS_KEY,
          newData,
          () => uiState.showError("storage.quotaExceeded"),
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
    const out: Record<string, unknown> = {};
    // `keyof Settings` is not a subset of the class properties (`isPro` /
    // `isProLicenseActive` live on `this.entitlement`), so the dynamic read
    // goes through one cast instead of pretending the index is typed.
    const self = this as unknown as Record<keyof Settings, unknown>;
    const source: SaveSource = {
      read: <K extends keyof Settings>(key: K): Settings[K] =>
        self[key] as Settings[K],
      // `$state.snapshot` returns `Snapshot<T>`; the old literal code
      // passed snapshots straight into `Settings`-typed positions, so
      // the cast preserves exactly that boundary.
      snapshot: <T>(value: T): T => $state.snapshot(value) as T,
      entitlement: this.entitlement,
    };
    for (const field of PERSISTENCE_SCHEMA) {
      out[field.key] = readSerializedField(field, source);
    }
    // Conformance is enforced by `persistenceSchema.test.ts` (save exactness),
    // not by this cast: a row missing from the table fails there by name.
    return out as unknown as Settings;
  }

  destroy() {
    // Prevent memory leaks during HMR cycles by ensuring the cross-tab
    // storage listener is removed when the singleton is disposed.
    if (this.storageListener && typeof window !== "undefined") {
      window.removeEventListener("storage", this.storageListener);
      this.storageListener = null;
    }
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

// BUG-0286: the telemetry gate lives in trackingService, which may not import
// this store. Hand it a live reader so an opt-out (or a restored/imported
// setting) takes effect immediately, not only after a reload.
setTelemetryConsentProvider(() => settingsState.enableTelemetry !== false);

// The logger needs debugMode/logSettings but may not import this store; hand it
// a live reader instead of a copy, so toggling debug mode takes effect at once.
setLoggerConfigProvider(() => settingsState);

// newsService reads API keys and feed settings; expose them through a live
// reader instead of the store import it used to carry.
setNewsSettingsProvider(() => settingsState);

// HMR: Cleanup on module disposal to prevent timers and effect leaks
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    settingsState.destroy();
  });
}
