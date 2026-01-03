import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { CONSTANTS } from '../lib/constants';

export type MarketDataInterval = '1s' | '1m' | '10m';

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
    isPro: boolean;
    isDeepDiveUnlocked: boolean;
    imgurClientId: string;
    apiKeys: {
        bitunix: ApiKeys;
        binance: ApiKeys;
    };
}

const defaultSettings: Settings = {
    apiProvider: 'bitunix',
    marketDataInterval: '1m', // Default interval
    autoUpdatePriceInput: false,
    autoFetchBalance: false,
    showSidebars: true,
    isPro: false,
    isDeepDiveUnlocked: false,
    imgurClientId: '',
    apiKeys: {
        bitunix: { key: '', secret: '' },
        binance: { key: '', secret: '' }
    }
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

        // Clean up keys not in interface
        const cleanSettings: Settings = {
            apiProvider: settings.apiProvider,
            marketDataInterval: settings.marketDataInterval,
            autoUpdatePriceInput: settings.autoUpdatePriceInput,
            autoFetchBalance: settings.autoFetchBalance,
            showSidebars: settings.showSidebars ?? defaultSettings.showSidebars,
            isPro: settings.isPro ?? defaultSettings.isPro,
            isDeepDiveUnlocked: settings.isDeepDiveUnlocked ?? defaultSettings.isDeepDiveUnlocked,
            imgurClientId: settings.imgurClientId ?? defaultSettings.imgurClientId,
            apiKeys: settings.apiKeys
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
