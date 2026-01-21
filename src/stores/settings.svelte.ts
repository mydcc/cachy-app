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
    cryptoPanicFilter: "all" | "rising" | "hot" | "bullish" | "bearish" | "important" | "saved";
    enableNewsAnalysis: boolean;
    cmcApiKey?: string;
    enableCmcContext: boolean;
    showMarketOverviewLinks: boolean;
    showMarketActivity: boolean;
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
}

const defaultSettings: Settings = {
    apiProvider: "bitunix",
    marketDataInterval: 10,
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
        binance: { key: "", secret: "" },
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
    geminiModel: "gemma",
    anthropicApiKey: "",
    anthropicModel: "claude-3-5-sonnet-20240620",
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
};

class SettingsManager {
    // Using $state for all properties
    private _apiProvider = $state<"bitunix" | "binance">(defaultSettings.apiProvider);
    get apiProvider() { return this._apiProvider; }
    set apiProvider(v: "bitunix" | "binance") {
        if (v !== this._apiProvider) {
            console.warn(`[Settings] apiProvider: ${this._apiProvider} -> ${v}`);
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
    positionViewMode = $state<PositionViewMode | undefined>(defaultSettings.positionViewMode);
    pnlViewMode = $state<PnlViewMode | undefined>(defaultSettings.pnlViewMode);
    isPro = $state<boolean>(defaultSettings.isPro);
    feePreference = $state<"maker" | "taker">(defaultSettings.feePreference);
    hotkeyMode = $state<HotkeyMode>(defaultSettings.hotkeyMode);
    isProLicenseActive = $state<boolean>(defaultSettings.isProLicenseActive);


    apiKeys = $state(defaultSettings.apiKeys);
    customHotkeys = $state(defaultSettings.customHotkeys);
    favoriteTimeframes = $state(defaultSettings.favoriteTimeframes);
    favoriteSymbols = $state(defaultSettings.favoriteSymbols);

    syncRsiTimeframe = $state<boolean>(defaultSettings.syncRsiTimeframe);
    imgbbApiKey = $state<string>(defaultSettings.imgbbApiKey);
    imgbbExpiration = $state<number>(defaultSettings.imgbbExpiration);
    isDeepDiveUnlocked = $state<boolean | undefined>(defaultSettings.isDeepDiveUnlocked);
    imgurClientId = $state<string | undefined>(defaultSettings.imgurClientId);

    enableSidePanel = $state<boolean>(defaultSettings.enableSidePanel);
    sidePanelMode = $state<"chat" | "notes" | "ai">(defaultSettings.sidePanelMode);
    sidePanelLayout = $state<SidePanelLayout>(defaultSettings.sidePanelLayout);
    chatStyle = $state<"minimal" | "bubble" | "terminal">(defaultSettings.chatStyle);
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
    aiConfirmActions = $state<boolean>(defaultSettings.aiConfirmActions);
    aiTradeHistoryLimit = $state<number>(defaultSettings.aiTradeHistoryLimit);
    aiConfirmClear = $state<boolean>(defaultSettings.aiConfirmClear);

    rssFilterBySymbol = $state<boolean | undefined>(defaultSettings.rssFilterBySymbol);

    showSpinButtons = $state<boolean | "hover">(defaultSettings.showSpinButtons);
    disclaimerAccepted = $state<boolean>(defaultSettings.disclaimerAccepted);
    useUtcDateParsing = $state<boolean>(defaultSettings.useUtcDateParsing);
    forceEnglishTechnicalTerms = $state<boolean>(defaultSettings.forceEnglishTechnicalTerms);
    debugMode = $state<boolean>(defaultSettings.debugMode);
    syncFavorites = $state<boolean>(defaultSettings.syncFavorites);
    confirmTradeDeletion = $state<boolean>(defaultSettings.confirmTradeDeletion);
    confirmBulkDeletion = $state<boolean>(defaultSettings.confirmBulkDeletion);
    chatFontSize = $state<number>(defaultSettings.chatFontSize);
    panelIsExpanded = $state<boolean>(defaultSettings.panelIsExpanded);
    minChatProfitFactor = $state<number>(defaultSettings.minChatProfitFactor);
    fontFamily = $state<string>(defaultSettings.fontFamily);
    cryptoPanicApiKey = $state<string | undefined>(defaultSettings.cryptoPanicApiKey);
    newsApiKey = $state<string | undefined>(defaultSettings.newsApiKey);
    cryptoPanicPlan = $state<"developer" | "growth" | "enterprise">(defaultSettings.cryptoPanicPlan);
    cryptoPanicFilter = $state<"all" | "rising" | "hot" | "bullish" | "bearish" | "important" | "saved">(defaultSettings.cryptoPanicFilter);
    enableNewsAnalysis = $state<boolean>(defaultSettings.enableNewsAnalysis);
    cmcApiKey = $state<string | undefined>(defaultSettings.cmcApiKey);
    enableCmcContext = $state<boolean>(defaultSettings.enableCmcContext);
    showMarketOverviewLinks = $state<boolean>(defaultSettings.showMarketOverviewLinks);
    showMarketActivity = $state<boolean>(defaultSettings.showMarketActivity);
    showSidebarActivity = $state<boolean>(defaultSettings.showSidebarActivity);
    get effectiveShowSidebarActivity() { return this.isPro && this.showSidebarActivity; }

    get capabilities() {
        return {
            marketData: this.isPro && this.showMarketActivity
        };
    }
    showMarketSentiment = $state<boolean>(defaultSettings.showMarketSentiment);
    showTechnicalsSummary = $state<boolean>(defaultSettings.showTechnicalsSummary);
    showTechnicalsConfluence = $state<boolean>(defaultSettings.showTechnicalsConfluence);
    showTechnicalsVolatility = $state<boolean>(defaultSettings.showTechnicalsVolatility);
    showTechnicalsOscillators = $state<boolean>(defaultSettings.showTechnicalsOscillators);
    showTechnicalsMAs = $state<boolean>(defaultSettings.showTechnicalsMAs);
    showTechnicalsAdvanced = $state<boolean>(defaultSettings.showTechnicalsAdvanced);
    showTechnicalsSignals = $state<boolean>(defaultSettings.showTechnicalsSignals);
    showTechnicalsPivots = $state<boolean>(defaultSettings.showTechnicalsPivots);
    showTvLink = $state<boolean>(defaultSettings.showTvLink);
    showCgHeatLink = $state<boolean>(defaultSettings.showCgHeatLink);
    showBrokerLink = $state<boolean>(defaultSettings.showBrokerLink);
    rssPresets = $state<string[]>(defaultSettings.rssPresets || []);
    customRssFeeds = $state<string[]>(defaultSettings.customRssFeeds || []);

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

                console.warn("[Settings] Store ready. Provider:", this.apiProvider);
            });

            // 3. Listen for changes from other tabs
            window.addEventListener("storage", (e) => {
                if (e.key === CONSTANTS.LOCAL_STORAGE_SETTINGS_KEY && e.newValue) {
                    // Only sync if not currently saving (prevents overwriting)
                    if (!this.saveLock) {
                        console.warn("[Settings] Syncing from other tab...");
                        this.effectActive = false; // Disable effect temporarily
                        this.load();
                        this.effectActive = true; // Re-enable
                    } else {
                        console.warn("[Settings] Ignoring storage event during save");
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
                bitunix: { ...defaultSettings.apiKeys.bitunix, ...(parsed.apiKeys?.bitunix || {}) },
                binance: { ...defaultSettings.apiKeys.binance, ...(parsed.apiKeys?.binance || {}) }
            };

            const merged = { ...defaultSettings, ...parsed, apiKeys: mergedApiKeys };

            // Migration: Ensure bitunix is default once if not already migrated
            const migrationKey = "cachy_v0.94_broker_migrated_v2";
            const migrationDone = localStorage.getItem(migrationKey);

            // No untrack needed - effectActive is false during load
            let loadedProvider = merged.apiProvider;

            if (!migrationDone) {
                console.warn("[Settings] First load of v0.94: Forcing Bitunix as default.");
                loadedProvider = "bitunix";
                localStorage.setItem(migrationKey, "true");
            }

            // Extra safety: Only allow binance if keys are present and not default placeholders
            const hasBinanceKeys = merged.apiKeys?.binance?.key &&
                merged.apiKeys.binance.key.length > 5 &&
                merged.apiKeys.binance.secret;

            if (loadedProvider === "binance" && !hasBinanceKeys) {
                console.warn("[Settings] Binance selected but no valid keys found. Falling back to Bitunix.");
                loadedProvider = "bitunix";
            }

            const finalProvider = (loadedProvider === "binance") ? "binance" : "bitunix";

            // Set the private field directly during load to avoid dual logging
            this._apiProvider = finalProvider;

            if (loadedProvider && loadedProvider !== finalProvider) {
                console.warn(`[Settings] Invalid provider "${loadedProvider}" reset to "bitunix"`);
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
            this.apiKeys = merged.apiKeys;
            this.customHotkeys = merged.customHotkeys || {};
            this.favoriteTimeframes = merged.favoriteTimeframes;
            this.favoriteSymbols = merged.favoriteSymbols;
            this.syncRsiTimeframe = merged.syncRsiTimeframe;
            this.imgbbApiKey = merged.imgbbApiKey;
            this.imgbbExpiration = merged.imgbbExpiration;
            this.isDeepDiveUnlocked = merged.isDeepDiveUnlocked;
            this.imgurClientId = merged.imgurClientId;
            this.enableSidePanel = merged.enableSidePanel;
            this.sidePanelMode = merged.sidePanelMode;
            this.sidePanelLayout = merged.sidePanelLayout;
            this.chatStyle = merged.chatStyle;
            this.panelState = merged.panelState;
            this.maxPrivateNotes = merged.maxPrivateNotes;
            this.customSystemPrompt = merged.customSystemPrompt;
            this.aiProvider = merged.aiProvider;
            this.openaiApiKey = merged.openaiApiKey;
            this.openaiModel = merged.openaiModel;
            this.geminiApiKey = merged.geminiApiKey;
            this.geminiModel = merged.geminiModel;
            this.anthropicApiKey = merged.anthropicApiKey;
            this.anthropicModel = merged.anthropicModel;
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
            this.cryptoPanicPlan = merged.cryptoPanicPlan || defaultSettings.cryptoPanicPlan;
            this.cryptoPanicFilter = merged.cryptoPanicFilter || defaultSettings.cryptoPanicFilter;
            this.enableNewsAnalysis = merged.enableNewsAnalysis;
            this.cmcApiKey = merged.cmcApiKey;
            this.enableCmcContext = merged.enableCmcContext;
            this.showMarketOverviewLinks = merged.showMarketOverviewLinks;
            this.showMarketActivity = merged.showMarketActivity;
            this.showSidebarActivity = merged.showSidebarActivity ?? defaultSettings.showSidebarActivity;
            this.showMarketSentiment = merged.showMarketSentiment;
            this.showTechnicalsSummary = merged.showTechnicalsSummary;
            this.showTechnicalsConfluence = merged.showTechnicalsConfluence;
            this.showTechnicalsVolatility = merged.showTechnicalsVolatility;
            this.showTechnicalsOscillators = merged.showTechnicalsOscillators;
            this.showTechnicalsMAs = merged.showTechnicalsMAs;
            this.showTechnicalsAdvanced = merged.showTechnicalsAdvanced;
            this.showTechnicalsSignals = merged.showTechnicalsSignals;
            this.showTechnicalsPivots = merged.showTechnicalsPivots ?? defaultSettings.showTechnicalsPivots;
            this.showTvLink = merged.showTvLink ?? defaultSettings.showTvLink;
            this.showCgHeatLink = merged.showCgHeatLink ?? defaultSettings.showCgHeatLink;
            this.showBrokerLink = merged.showBrokerLink ?? defaultSettings.showBrokerLink;
            this.rssPresets = merged.rssPresets || defaultSettings.rssPresets;
            this.customRssFeeds = merged.customRssFeeds || defaultSettings.customRssFeeds;
            this.isProLicenseActive = merged.isProLicenseActive ?? defaultSettings.isProLicenseActive;

            // Migration
            if (parsed.marketDataInterval === "manual") {
                this.autoUpdatePriceInput = false;
                this.marketDataInterval = 60;
            }
        } catch (e) {
            console.error("[Settings] Load failed, using defaults:", e);
            // Save defaults to fix corrupted localStorage
            this.save();
        }
    }

    private save() {
        if (!browser || !this.effectActive || this.saveLock) return;

        this.saveLock = true;

        try {
            const data = this.toJSON();
            const current = localStorage.getItem(CONSTANTS.LOCAL_STORAGE_SETTINGS_KEY);
            const newData = JSON.stringify(data);

            // Only save if actually different (prevent unnecessary writes)
            if (current !== newData) {
                const success = StorageHelper.safeSave(
                    CONSTANTS.LOCAL_STORAGE_SETTINGS_KEY,
                    newData
                );

                if (!success) {
                    console.error("[Settings] Failed to save after retry");
                }
            }
        } catch (e) {
            console.error("[Settings] Save failed:", e);
        } finally {
            this.saveLock = false;
        }
    }

    toJSON(): Settings {
        return {
            apiProvider: this.apiProvider,
            marketDataInterval: this.marketDataInterval,
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
            this.listeners.forEach(fn => fn(snapshot));
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
