import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { CONSTANTS } from '../lib/constants';

export type MarketDataInterval = '1s' | '1m' | '10m';
export type HotkeyMode = 'mode1' | 'mode2' | 'mode3';
export type PositionViewMode = 'detailed' | 'focus';
export type PnlViewMode = 'value' | 'percent' | 'bar';
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
    apiKeys: {
        bitunix: ApiKeys;
        binance: ApiKeys;
    };
    // Indicator & Timeframe Settings
    favoriteTimeframes: string[];
    syncRsiTimeframe: boolean;

    // ImgBB Settings
    imgbbApiKey: string;
    imgbbExpiration: number; // 0 = never, otherwise seconds
    isDeepDiveUnlocked?: boolean; // Persist cheat code state
    imgurClientId?: string; // Kept optional for migration/legacy cleanup if needed, but not used.

    // Side Panel Settings
    enableSidePanel: boolean;
    sidePanelMode: 'chat' | 'notes' | 'ai';

    // AI Chat Settings
    aiProvider: AiProvider;
    openaiApiKey: string;
    geminiApiKey: string;
    anthropicApiKey: string;

    // Legal
    disclaimerAccepted: boolean;
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
    apiKeys: {
        bitunix: { key: '', secret: '' },
        binance: { key: '', secret: '' }
    },
    favoriteTimeframes: ['5m', '15m', '1h', '4h'],
    syncRsiTimeframe: true,
    imgbbApiKey: '71a5689343bb63d5c85a76e4375f1d0b',
    imgbbExpiration: 0,
    isDeepDiveUnlocked: false,
    enableSidePanel: false,
    sidePanelMode: 'notes',
    aiProvider: 'gemini',
    openaiApiKey: '',
    geminiApiKey: '',
    anthropicApiKey: '',
    disclaimerAccepted: false
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
        if (!settings.geminiApiKey) settings.geminiApiKey = defaultSettings.geminiApiKey;
        if (!settings.anthropicApiKey) settings.anthropicApiKey = defaultSettings.anthropicApiKey;


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
            apiKeys: settings.apiKeys,
            favoriteTimeframes: settings.favoriteTimeframes ?? defaultSettings.favoriteTimeframes,
            syncRsiTimeframe: settings.syncRsiTimeframe ?? defaultSettings.syncRsiTimeframe,
            imgbbApiKey: settings.imgbbApiKey,
            imgbbExpiration: settings.imgbbExpiration,
            isDeepDiveUnlocked: settings.isDeepDiveUnlocked,
            enableSidePanel: settings.enableSidePanel ?? defaultSettings.enableSidePanel,
            sidePanelMode: settings.sidePanelMode ?? defaultSettings.sidePanelMode,
            aiProvider: settings.aiProvider,
            openaiApiKey: settings.openaiApiKey,
            geminiApiKey: settings.geminiApiKey,
            anthropicApiKey: settings.anthropicApiKey,
            disclaimerAccepted: settings.disclaimerAccepted ?? defaultSettings.disclaimerAccepted
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
