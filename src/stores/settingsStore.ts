import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { CONSTANTS } from '../lib/constants';
import { DEFAULT_HOTKEY_MAPS, type HotkeyMap, type HotkeyMode } from '../services/hotkeyConfig';

export type MarketDataInterval = '1s' | '1m' | '10m';
export type { HotkeyMode }; // Export from Config to avoid circular dep if needed, or just re-export type
export type PositionViewMode = 'detailed' | 'focus';
export type PnlViewMode = 'value' | 'percent' | 'bar';
export type SidePanelLayout = 'standard' | 'transparent' | 'floating';
export type AiProvider = 'openai' | 'gemini' | 'anthropic';

export interface ApiKeys {
    key: string;
    secret: string;
}

export interface Settings {
    apiProvider: 'bitunix' | 'binance';
    marketDataInterval: MarketDataInterval;
    autoUpdatePriceInput: boolean;
    autoFetchBalance: boolean;
    showSidebars: boolean;
    showTechnicals: boolean;
    hideUnfilledOrders: boolean;
    positionViewMode?: PositionViewMode;
    pnlViewMode?: PnlViewMode;
    isPro: boolean;
    feePreference: 'maker' | 'taker';
    hotkeyMode: HotkeyMode;
    hotkeyBindings: HotkeyMap; // New: Custom bindings
    apiKeys: {
        bitunix: ApiKeys;
        binance: ApiKeys;
    };
    // Indicator & Timeframe Settings
    favoriteTimeframes: string[];
    syncRsiTimeframe: boolean;
    hideIndicatorParams: boolean;

    // ImgBB Settings
    imgbbApiKey: string;
    imgbbExpiration: number; // 0 = never, otherwise seconds
    isDeepDiveUnlocked?: boolean; // Persist cheat code state
    imgurClientId?: string; // Kept optional for migration/legacy cleanup if needed, but not used.

    // Side Panel Settings
    enableSidePanel: boolean;
    sidePanelMode: 'chat' | 'notes' | 'ai';
    sidePanelLayout: SidePanelLayout;

    // AI Chat Settings
    aiProvider: AiProvider;
    openaiApiKey: string;
    openaiModel: string;
    geminiApiKey: string;
    geminiModel: string;
    anthropicApiKey: string;
    anthropicModel: string;

    // Legal
    disclaimerAccepted: boolean;

    // Journal Settings (New)
    enableAdvancedMetrics: boolean;
    visibleColumns: string[];
}

const defaultSettings: Settings = {
    apiProvider: 'bitunix',
    marketDataInterval: '1m', // Default interval
    autoUpdatePriceInput: false,
    autoFetchBalance: false,
    showSidebars: true,
    showTechnicals: true,
    hideUnfilledOrders: false,
    positionViewMode: 'detailed',
    isPro: false,
    feePreference: 'taker', // Default to Taker fees
    hotkeyMode: 'mode2', // Safety Mode as default
    hotkeyBindings: DEFAULT_HOTKEY_MAPS['mode2'], // Initialize with Mode 2 defaults
    apiKeys: {
        bitunix: { key: '', secret: '' },
        binance: { key: '', secret: '' }
    },
    favoriteTimeframes: ['5m', '15m', '1h', '4h'],
    syncRsiTimeframe: true,
    hideIndicatorParams: false,
    imgbbApiKey: '71a5689343bb63d5c85a76e4375f1d0b',
    imgbbExpiration: 0,
    isDeepDiveUnlocked: false,
    enableSidePanel: false,
    sidePanelMode: 'notes',
    sidePanelLayout: 'standard',

    // AI Defaults
    aiProvider: 'gemini',
    openaiApiKey: '',
    openaiModel: 'gpt-4o',
    geminiApiKey: '',
    geminiModel: 'gemini-2.0-flash-exp', // Defaulting to 2.0 experimental
    anthropicApiKey: '',
    anthropicModel: 'claude-3-5-sonnet-20240620',

    disclaimerAccepted: false,

    // Journal Defaults
    enableAdvancedMetrics: false,
    visibleColumns: ['date', 'symbol', 'tradeType', 'entryPrice', 'stopLossPrice', 'totalNetProfit', 'fundingFee', 'totalRR', 'status', 'screenshot', 'tags', 'notes', 'action']
};

function loadSettingsFromLocalStorage(): Settings {
    if (!browser) return defaultSettings;
    try {
        const d = localStorage.getItem(CONSTANTS.LOCAL_STORAGE_SETTINGS_KEY);
        if (!d) return defaultSettings;
        const parsed = JSON.parse(d);
        
        // Ensure we merge with defaults to handle new keys in existing storage
        const settings = { 
            ...defaultSettings, 
            ...parsed,
            apiKeys: {
                ...defaultSettings.apiKeys,
                ...(parsed.apiKeys || {})
            }
        };
        
        // Migration logic:

        // 1. If 'manual' was stored in interval (very old legacy)
        if (parsed.marketDataInterval === 'manual') {
            settings.autoUpdatePriceInput = false;
            settings.marketDataInterval = '1m';
        }

        // 2. Migration from 'priceUpdateMode' ('manual' | 'auto') to 'autoUpdatePriceInput'
        if (parsed.priceUpdateMode) {
            if (parsed.priceUpdateMode === 'auto') {
                settings.autoUpdatePriceInput = true;
            } else {
                settings.autoUpdatePriceInput = false;
            }
        }
        
        // 3. Ensure ImgBB defaults if missing (even if other settings existed)
        if (!settings.imgbbApiKey) {
            settings.imgbbApiKey = defaultSettings.imgbbApiKey;
        }
        if (settings.imgbbExpiration === undefined) {
             settings.imgbbExpiration = defaultSettings.imgbbExpiration;
        }

        // 4. Ensure AI Settings defaults
        if (!settings.aiProvider) settings.aiProvider = defaultSettings.aiProvider;
        if (!settings.openaiApiKey) settings.openaiApiKey = defaultSettings.openaiApiKey;
        if (!settings.openaiModel) settings.openaiModel = defaultSettings.openaiModel;

        if (!settings.geminiApiKey) settings.geminiApiKey = defaultSettings.geminiApiKey;
        if (!settings.geminiModel) settings.geminiModel = defaultSettings.geminiModel;

        // Auto-migrate from deprecated aliases to gemini-2.0-flash-exp
        if (settings.geminiModel === 'gemini-2.0-flash' || settings.geminiModel === 'gemini-2.5-flash') {
            settings.geminiModel = 'gemini-2.0-flash-exp';
        }

        if (!settings.anthropicApiKey) settings.anthropicApiKey = defaultSettings.anthropicApiKey;
        if (!settings.anthropicModel) settings.anthropicModel = defaultSettings.anthropicModel;

        // 5. Hotkey Migration: If hotkeyBindings are missing, init from mode
        if (!settings.hotkeyBindings) {
            const mode = settings.hotkeyMode || 'mode2';
            settings.hotkeyBindings = { ...DEFAULT_HOTKEY_MAPS[mode] };
        }

        // Clean up keys not in interface
        const cleanSettings: Settings = {
            apiProvider: settings.apiProvider,
            marketDataInterval: settings.marketDataInterval,
            autoUpdatePriceInput: settings.autoUpdatePriceInput,
            autoFetchBalance: settings.autoFetchBalance,
            showSidebars: settings.showSidebars ?? defaultSettings.showSidebars,
            showTechnicals: settings.showTechnicals ?? defaultSettings.showTechnicals,
            hideUnfilledOrders: settings.hideUnfilledOrders ?? defaultSettings.hideUnfilledOrders,
            positionViewMode: settings.positionViewMode ?? defaultSettings.positionViewMode,
            pnlViewMode: settings.pnlViewMode || 'value',
            isPro: settings.isPro ?? defaultSettings.isPro,
            feePreference: settings.feePreference ?? defaultSettings.feePreference,
            hotkeyMode: settings.hotkeyMode ?? defaultSettings.hotkeyMode,
            hotkeyBindings: settings.hotkeyBindings,
            apiKeys: settings.apiKeys,
            favoriteTimeframes: settings.favoriteTimeframes ?? defaultSettings.favoriteTimeframes,
            syncRsiTimeframe: settings.syncRsiTimeframe ?? defaultSettings.syncRsiTimeframe,
            hideIndicatorParams: settings.hideIndicatorParams ?? defaultSettings.hideIndicatorParams,
            imgbbApiKey: settings.imgbbApiKey,
            imgbbExpiration: settings.imgbbExpiration,
            isDeepDiveUnlocked: settings.isDeepDiveUnlocked,
            enableSidePanel: settings.enableSidePanel ?? defaultSettings.enableSidePanel,
            sidePanelMode: settings.sidePanelMode ?? defaultSettings.sidePanelMode,
            sidePanelLayout: settings.sidePanelLayout ?? defaultSettings.sidePanelLayout,
            aiProvider: settings.aiProvider,
            openaiApiKey: settings.openaiApiKey,
            openaiModel: settings.openaiModel,
            geminiApiKey: settings.geminiApiKey,
            geminiModel: settings.geminiModel,
            anthropicApiKey: settings.anthropicApiKey,
            anthropicModel: settings.anthropicModel,
            disclaimerAccepted: settings.disclaimerAccepted ?? defaultSettings.disclaimerAccepted,
            enableAdvancedMetrics: settings.enableAdvancedMetrics ?? defaultSettings.enableAdvancedMetrics,
            visibleColumns: settings.visibleColumns
        };

        return cleanSettings;
    } catch (e) {
        console.warn("Could not load settings from localStorage.", e);
        return defaultSettings;
    }
}

export const settingsStore = writable<Settings>(loadSettingsFromLocalStorage());

settingsStore.subscribe(value => {
    if (browser) {
        try {
            localStorage.setItem(CONSTANTS.LOCAL_STORAGE_SETTINGS_KEY, JSON.stringify(value));
        } catch (e) {
            console.warn("Could not save settings to localStorage.", e);
        }
    }
});
