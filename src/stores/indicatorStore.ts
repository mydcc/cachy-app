import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export interface IndicatorSettings {
    rsi: {
        enabled: boolean;
        length: number;
        source: 'close' | 'open' | 'high' | 'low' | 'hl2' | 'hlc3';
        showSignal: boolean;
        signalType: 'sma' | 'ema';
        signalLength: number;
        defaultTimeframe: string; // Used if sync is disabled
    };
    macd: {
        enabled: boolean;
        fastLength: number;
        slowLength: number;
        signalLength: number;
        source: 'close' | 'open' | 'high' | 'low' | 'hl2' | 'hlc3';
    };
    stochastic: {
        enabled: boolean;
        kPeriod: number;
        dPeriod: number;
    };
    cci: {
        enabled: boolean;
        length: number;
        source: 'close' | 'open' | 'high' | 'low' | 'hl2' | 'hlc3';
        threshold: number; // usually 100 (triggers on > 100 or < -100)
    };
    adx: {
        enabled: boolean;
        length: number;
        threshold: number; // usually 25
    };
    ao: {
        enabled: boolean;
        fastLength: number;
        slowLength: number;
    };
    momentum: {
        enabled: boolean;
        length: number;
        source: 'close' | 'open' | 'high' | 'low' | 'hl2' | 'hlc3';
    };
    ema: {
        enabled: boolean;
        ema1Length: number;
        ema2Length: number;
        ema3Length: number;
    };
    pivots: {
        enabled: boolean;
        type: 'classic' | 'woodie' | 'camarilla' | 'fibonacci';
    };
}

const defaultSettings: IndicatorSettings = {
    rsi: {
        enabled: true,
        length: 14,
        source: 'close',
        showSignal: true,
        signalType: 'sma',
        signalLength: 14,
        defaultTimeframe: '1d'
    },
    macd: {
        enabled: true,
        fastLength: 12,
        slowLength: 26,
        signalLength: 9,
        source: 'close'
    },
    stochastic: {
        enabled: true,
        kPeriod: 14,
        dPeriod: 3
    },
    cci: {
        enabled: true,
        length: 20,
        source: 'close',
        threshold: 100
    },
    adx: {
        enabled: true,
        length: 14,
        threshold: 25
    },
    ao: {
        enabled: true,
        fastLength: 5,
        slowLength: 34
    },
    momentum: {
        enabled: true,
        length: 10,
        source: 'close'
    },
    ema: {
        enabled: true,
        ema1Length: 20,
        ema2Length: 50,
        ema3Length: 200
    },
    pivots: {
        enabled: true,
        type: 'classic'
    }
};

const STORE_KEY = 'cachy_indicator_settings';

function createIndicatorStore() {
    const stored = browser ? localStorage.getItem(STORE_KEY) : null;

    // Merge stored settings with defaults to ensure new keys exist
    let initial: IndicatorSettings = defaultSettings;
    if (stored) {
        try {
            const parsed = JSON.parse(stored);
            initial = {
                rsi: { ...defaultSettings.rsi, ...parsed.rsi },
                macd: { ...defaultSettings.macd, ...parsed.macd },
                stochastic: { ...defaultSettings.stochastic, ...parsed.stochastic },
                cci: { ...defaultSettings.cci, ...parsed.cci },
                adx: { ...defaultSettings.adx, ...parsed.adx },
                ao: { ...defaultSettings.ao, ...parsed.ao },
                momentum: { ...defaultSettings.momentum, ...parsed.momentum },
                ema: { ...defaultSettings.ema, ...parsed.ema },
                pivots: { ...defaultSettings.pivots, ...parsed.pivots }
            };
        } catch (e) {
            console.error("Failed to parse indicator settings", e);
        }
    }

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
