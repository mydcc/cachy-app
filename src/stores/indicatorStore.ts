import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export interface IndicatorSettings {
    historyLimit: number; // Global setting for calculation depth
    showParamsInLabel: boolean; // Global setting to show/hide params in indicator names
    rsi: {
        length: number;
        source: 'close' | 'open' | 'high' | 'low' | 'hl2' | 'hlc3';
        showSignal: boolean;
        signalType: 'sma' | 'ema';
        signalLength: number;
        defaultTimeframe: string; // Used if sync is disabled
    };
    macd: {
        fastLength: number;
        slowLength: number;
        signalLength: number;
        source: 'close' | 'open' | 'high' | 'low' | 'hl2' | 'hlc3';
        oscillatorMaType: 'ema' | 'sma';
        signalMaType: 'ema' | 'sma';
    };
    stochastic: {
        kPeriod: number;
        kSmoothing: number;
        dPeriod: number;
    };
    cci: {
        length: number;
        source: 'close' | 'open' | 'high' | 'low' | 'hl2' | 'hlc3';
        threshold: number; // usually 100 (triggers on > 100 or < -100)
        smoothingType: 'sma' | 'ema';
        smoothingLength: number;
    };
    adx: {
        adxSmoothing: number; // Was 'length'
        diLength: number;
        threshold: number; // usually 25
    };
    ao: {
        fastLength: number;
        slowLength: number;
    };
    momentum: {
        length: number;
        source: 'close' | 'open' | 'high' | 'low' | 'hl2' | 'hlc3';
    };
    ema: {
        ema1Length: number;
        ema2Length: number;
        ema3Length: number;
    };
    pivots: {
        type: 'classic' | 'woodie' | 'camarilla' | 'fibonacci';
        viewMode: 'integrated' | 'separated' | 'abstract';
    };
}

const defaultSettings: IndicatorSettings = {
    historyLimit: 750,
    showParamsInLabel: true,
    rsi: {
        length: 14,
        source: 'close',
        showSignal: true,
        signalType: 'sma',
        signalLength: 14,
        defaultTimeframe: '1d'
    },
    macd: {
        fastLength: 12,
        slowLength: 26,
        signalLength: 9,
        source: 'close',
        oscillatorMaType: 'ema',
        signalMaType: 'ema'
    },
    stochastic: {
        kPeriod: 14,
        kSmoothing: 1,
        dPeriod: 3
    },
    cci: {
        length: 20,
        source: 'close',
        threshold: 100,
        smoothingType: 'sma',
        smoothingLength: 14
    },
    adx: {
        adxSmoothing: 14,
        diLength: 14,
        threshold: 25
    },
    ao: {
        fastLength: 5,
        slowLength: 34
    },
    momentum: {
        length: 10,
        source: 'close'
    },
    ema: {
        ema1Length: 20,
        ema2Length: 50,
        ema3Length: 200
    },
    pivots: {
        type: 'classic',
        viewMode: 'integrated'
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

            // Migration for ADX 'length' to 'adxSmoothing'
            let adxParsed = { ...defaultSettings.adx, ...(parsed.adx || {}) };
            if (parsed.adx && parsed.adx.length !== undefined && parsed.adx.adxSmoothing === undefined) {
                adxParsed.adxSmoothing = parsed.adx.length;
            }

            initial = {
                historyLimit: parsed.historyLimit || defaultSettings.historyLimit,
                showParamsInLabel: parsed.showParamsInLabel !== undefined ? parsed.showParamsInLabel : defaultSettings.showParamsInLabel,
                rsi: { ...defaultSettings.rsi, ...parsed.rsi },
                macd: { ...defaultSettings.macd, ...parsed.macd },
                stochastic: { ...defaultSettings.stochastic, ...parsed.stochastic },
                cci: { ...defaultSettings.cci, ...parsed.cci },
                adx: adxParsed,
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
