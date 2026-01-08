import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export interface IndicatorSettings {
    rsi: {
        length: number;
        source: 'close' | 'open' | 'high' | 'low' | 'hl2' | 'hlc3';
        showSignal: boolean;
        signalType: 'sma' | 'ema';
        signalLength: number;
        defaultTimeframe: string; // Used if sync is disabled
    };
}

const defaultSettings: IndicatorSettings = {
    rsi: {
        length: 14,
        source: 'close',
        showSignal: true,
        signalType: 'sma',
        signalLength: 14,
        defaultTimeframe: '1d'
    }
};

const STORE_KEY = 'cachy_indicator_settings';

function createIndicatorStore() {
    const stored = browser ? localStorage.getItem(STORE_KEY) : null;
    const initial: IndicatorSettings = stored ? JSON.parse(stored) : defaultSettings;

    const { subscribe, set, update } = writable<IndicatorSettings>(initial);

    return {
        subscribe,
        set: (val: IndicatorSettings) => {
            if (browser) localStorage.setItem(STORE_KEY, JSON.stringify(val));
            set(val);
        },
        update: (fn: (val: IndicatorSettings) => IndicatorSettings) => {
            update(val => {
                const newState = fn(val);
                if (browser) localStorage.setItem(STORE_KEY, JSON.stringify(newState));
                return newState;
            });
        },
        reset: () => {
            if (browser) localStorage.setItem(STORE_KEY, JSON.stringify(defaultSettings));
            set(defaultSettings);
        }
    };
}

export const indicatorStore = createIndicatorStore();
