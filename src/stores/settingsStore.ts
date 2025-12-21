import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { CONSTANTS } from '../lib/constants';

export type MarketDataInterval = '1s' | '1m' | '10m';
export type PriceUpdateMode = 'manual' | 'auto';

export interface Settings {
    apiProvider: 'bitunix' | 'binance';
    marketDataInterval: MarketDataInterval;
    priceUpdateMode: PriceUpdateMode;
}

const defaultSettings: Settings = {
    apiProvider: 'bitunix',
    marketDataInterval: '1m', // Default interval
    priceUpdateMode: 'manual'
};

function loadSettingsFromLocalStorage(): Settings {
    if (!browser) return defaultSettings;
    try {
        const d = localStorage.getItem(CONSTANTS.LOCAL_STORAGE_SETTINGS_KEY);
        if (!d) return defaultSettings;
        const parsed = JSON.parse(d);
        // Ensure we merge with defaults to handle new keys in existing storage
        // Handle migration from old string intervals if necessary
        const settings = { ...defaultSettings, ...parsed };
        
        // Migration logic: if 'manual' was stored in interval, move it to mode
        if (parsed.marketDataInterval === 'manual') {
            settings.priceUpdateMode = 'manual';
            settings.marketDataInterval = '1m'; // Reset to a valid interval
        }

        return settings;
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
