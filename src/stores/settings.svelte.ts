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
    enableGlassmorphism: boolean;
    chatFontSize: number;
    panelIsExpanded: boolean;
    minChatProfitFactor: number;
    fontFamily: string;
    cryptoPanicApiKey?: string;
    newsApiKey?: string;
    cryptoPanicPlan: "developer" | "growth" | "enterprise";
    cryptoPanicFilter: "all" | "rising" | "hot" | "bullish" | "bearish" | "important" | "saved";
    enableNewsAnalysis: boolean;
}

const defaultSettings: Settings = {
    apiProvider: "bitunix",
    marketDataInterval: 10,
    autoUpdatePriceInput: false,
    autoFetchBalance: false,
    showSidebars: true,
    showTechnicals: true,
    showIndicatorParams: false,
    hideUnfilledOrders: false,
    positionViewMode: "detailed",
    isPro: true,
    feePreference: "taker",
    hotkeyMode: "mode2",
    customHotkeys: {},
    apiKeys: {
        bitunix: { key: "", secret: "" },
        binance: { key: "", secret: "" },
    },
    favoriteTimeframes: ["5m", "15m", "1h", "4h"],
    favoriteSymbols: ["BTCUSDT", "ETHUSDT", "SOLUSDT"],
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
    enableGlassmorphism: true,
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
    enableNewsAnalysis: false,
};

class SettingsManager {
    // Using $state for all properties
    private _apiProvider = $state<"bitunix" | "binance">(defaultSettings.apiProvider);
    get apiProvider() { return this._apiProvider; }
    set apiProvider(v: "bitunix" | "binance") {
        if (v !== this._apiProvider) {
            console.warn(`[Settings] apiProvider changing: ${this._apiProvider} -> ${v}`, new Error().stack);
            this._apiProvider = v;
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

    showSpinButtons = $state<boolean | "hover">(defaultSettings.showSpinButtons);
    disclaimerAccepted = $state<boolean>(defaultSettings.disclaimerAccepted);
    useUtcDateParsing = $state<boolean>(defaultSettings.useUtcDateParsing);
    forceEnglishTechnicalTerms = $state<boolean>(defaultSettings.forceEnglishTechnicalTerms);
    debugMode = $state<boolean>(defaultSettings.debugMode);
    syncFavorites = $state<boolean>(defaultSettings.syncFavorites);
    confirmTradeDeletion = $state<boolean>(defaultSettings.confirmTradeDeletion);
    confirmBulkDeletion = $state<boolean>(defaultSettings.confirmBulkDeletion);
    enableGlassmorphism = $state<boolean>(defaultSettings.enableGlassmorphism);
    chatFontSize = $state<number>(defaultSettings.chatFontSize);
    panelIsExpanded = $state<boolean>(defaultSettings.panelIsExpanded);
    minChatProfitFactor = $state<number>(defaultSettings.minChatProfitFactor);
    fontFamily = $state<string>(defaultSettings.fontFamily);
    cryptoPanicApiKey = $state<string | undefined>(defaultSettings.cryptoPanicApiKey);
    newsApiKey = $state<string | undefined>(defaultSettings.newsApiKey);
    cryptoPanicPlan = $state<"developer" | "growth" | "enterprise">(defaultSettings.cryptoPanicPlan);
    cryptoPanicFilter = $state<"all" | "rising" | "hot" | "bullish" | "bearish" | "important" | "saved">(defaultSettings.cryptoPanicFilter);
    enableNewsAnalysis = $state<boolean>(defaultSettings.enableNewsAnalysis);

    // Private state for initialization
    private isInitializing = true;
    private listeners: Set<(value: Settings) => void> = new Set();
    private notifyTimer: any = null;

    constructor() {
        if (browser) {
            this.isInitializing = true;
            this.load();

            $effect.root(() => {
                $effect(() => {
                    if (this.isInitializing) return;

                    // Trigger reactivity
                    this.apiProvider;
                    this.apiKeys;
                    this.isPro;
                    this.chatStyle;
                    this.cryptoPanicPlan;
                    this.cryptoPanicFilter;
                    this.enableNewsAnalysis;

                    const data = this.toJSON();
                    untrack(() => {
                        this.save();
                        this.notifyListeners();
                    });
                });
            });

            // Listen for changes from other tabs
            window.addEventListener("storage", (e) => {
                if (e.key === CONSTANTS.LOCAL_STORAGE_SETTINGS_KEY && e.newValue) {
                    console.warn("[Settings] Syncing from other tab...");
                    this.isInitializing = true;
                    this.load();
                    setTimeout(() => this.isInitializing = false, 50);
                }
            });

            setTimeout(() => {
                this.isInitializing = false;
                console.warn("[Settings] Store ready. Current Provider:", this.apiProvider);
            }, 100);
        }
    }

    private load() {
        try {
            const d = localStorage.getItem(CONSTANTS.LOCAL_STORAGE_SETTINGS_KEY);
            if (!d) return;

            const parsed = JSON.parse(d);

            // Deep merge apiKeys
            const mergedApiKeys = {
                bitunix: { ...defaultSettings.apiKeys.bitunix, ...(parsed.apiKeys?.bitunix || {}) },
                binance: { ...defaultSettings.apiKeys.binance, ...(parsed.apiKeys?.binance || {}) }
            };

            const merged = { ...defaultSettings, ...parsed, apiKeys: mergedApiKeys };

            untrack(() => {
                const loadedProvider = merged.apiProvider;
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
                this.enableGlassmorphism = merged.enableGlassmorphism;
                this.chatFontSize = merged.chatFontSize;
                this.panelIsExpanded = merged.panelIsExpanded;
                this.minChatProfitFactor = merged.minChatProfitFactor;
                this.fontFamily = merged.fontFamily;
                this.cryptoPanicApiKey = merged.cryptoPanicApiKey;
                this.newsApiKey = merged.newsApiKey;
                this.cryptoPanicPlan = merged.cryptoPanicPlan || defaultSettings.cryptoPanicPlan;
                this.cryptoPanicFilter = merged.cryptoPanicFilter || defaultSettings.cryptoPanicFilter;
                this.enableNewsAnalysis = merged.enableNewsAnalysis;

                // Migration
                if (parsed.marketDataInterval === "manual") {
                    this.autoUpdatePriceInput = false;
                    this.marketDataInterval = 60;
                }
            });
        } catch (e) {
            console.warn("SettingsManager: Load error", e);
        }
    }

    private save() {
        if (!browser) return;
        try {
            const data = this.toJSON();
            localStorage.setItem(CONSTANTS.LOCAL_STORAGE_SETTINGS_KEY, JSON.stringify(data));
        } catch (e) {
            console.warn("SettingsManager: Save error", e);
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
            enableGlassmorphism: this.enableGlassmorphism,
            chatFontSize: this.chatFontSize,
            panelIsExpanded: this.panelIsExpanded,
            minChatProfitFactor: this.minChatProfitFactor,
            fontFamily: this.fontFamily,
            cryptoPanicApiKey: this.cryptoPanicApiKey,
            newsApiKey: this.newsApiKey,
            cryptoPanicPlan: this.cryptoPanicPlan,
            cryptoPanicFilter: this.cryptoPanicFilter,
            enableNewsAnalysis: this.enableNewsAnalysis,
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
