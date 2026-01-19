/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { browser } from "$app/environment";

export interface IndicatorSettings {
    historyLimit: number; // Global setting for calculation depth
    precision: number; // Global precision for indicator values
    rsi: {
        length: number;
        source: "close" | "open" | "high" | "low" | "hl2" | "hlc3";
        showSignal: boolean;
        signalType: "sma" | "ema";
        signalLength: number;
        overbought: number;
        oversold: number;
        defaultTimeframe: string; // Used if sync is disabled
    };
    macd: {
        fastLength: number;
        slowLength: number;
        signalLength: number;
        source: "close" | "open" | "high" | "low" | "hl2" | "hlc3";
        oscillatorMaType: "ema" | "sma";
        signalMaType: "ema" | "sma";
    };
    stochastic: {
        kPeriod: number;
        kSmoothing: number;
        dPeriod: number;
    };
    cci: {
        length: number;
        source: "close" | "open" | "high" | "low" | "hl2" | "hlc3";
        threshold: number; // usually 100 (triggers on > 100 or < -100)
        smoothingType: "sma" | "ema";
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
        source: "close" | "open" | "high" | "low" | "hl2" | "hlc3";
    };
    ema: {
        ema1: {
            length: number;
            offset: number;
            smoothingType: "none" | "sma" | "ema" | "smma" | "wma" | "vwma";
            smoothingLength: number;
        };
        ema2: {
            length: number;
            offset: number;
            smoothingType: "none" | "sma" | "ema" | "smma" | "wma" | "vwma";
            smoothingLength: number;
        };
        ema3: {
            length: number;
            offset: number;
            smoothingType: "none" | "sma" | "ema" | "smma" | "wma" | "vwma";
            smoothingLength: number;
        };
        source: "close" | "open" | "high" | "low" | "hl2" | "hlc3";
    };
    pivots: {
        type: "classic" | "woodie" | "camarilla" | "fibonacci";
        viewMode: "integrated" | "separated" | "abstract";
    };
    atr: {
        length: number;
    };
    bb: {
        length: number;
        stdDev: number;
    };
}

const defaultSettings: IndicatorSettings = {
    historyLimit: 750,
    precision: 4,
    rsi: {
        length: 14,
        source: "close",
        showSignal: true,
        signalType: "sma",
        signalLength: 14,
        overbought: 70,
        oversold: 30,
        defaultTimeframe: "1d",
    },
    macd: {
        fastLength: 12,
        slowLength: 26,
        signalLength: 9,
        source: "close",
        oscillatorMaType: "ema",
        signalMaType: "ema",
    },
    stochastic: {
        kPeriod: 14,
        kSmoothing: 3,
        dPeriod: 3,
    },
    cci: {
        length: 20,
        source: "close",
        threshold: 100,
        smoothingType: "sma",
        smoothingLength: 5,
    },
    adx: {
        adxSmoothing: 14,
        diLength: 14,
        threshold: 25,
    },
    ao: {
        fastLength: 5,
        slowLength: 34,
    },
    momentum: {
        length: 10,
        source: "close",
    },
    ema: {
        ema1: { length: 21, offset: 0, smoothingType: "sma", smoothingLength: 14 },
        ema2: { length: 50, offset: 0, smoothingType: "sma", smoothingLength: 14 },
        ema3: { length: 200, offset: 0, smoothingType: "sma", smoothingLength: 14 },
        source: "close",
    },
    pivots: {
        type: "classic",
        viewMode: "integrated",
    },
    atr: {
        length: 14,
    },
    bb: {
        length: 20,
        stdDev: 2,
    },
};

const STORE_KEY = "cachy_indicator_settings";

class IndicatorManager {
    historyLimit = $state(defaultSettings.historyLimit);
    precision = $state(defaultSettings.precision);
    rsi = $state(defaultSettings.rsi); // Deep reactive due to $state on object? No, $state(obj) is shallow unless constructed differently? 
    // Wait, Svelte 5 $state(obj) makes the object reactive deeply by proxying. Check docs mentally: Yes, it returns a proxy.
    // However, replacing rsi completely breaks reference? No, we modify properties.

    macd = $state(defaultSettings.macd);
    stochastic = $state(defaultSettings.stochastic);
    cci = $state(defaultSettings.cci);
    adx = $state(defaultSettings.adx);
    ao = $state(defaultSettings.ao);
    momentum = $state(defaultSettings.momentum);
    ema = $state(defaultSettings.ema);
    pivots = $state(defaultSettings.pivots);
    atr = $state(defaultSettings.atr);
    bb = $state(defaultSettings.bb);

    private listeners: Set<(value: IndicatorSettings) => void> = new Set();

    constructor() {
        if (browser) {
            this.load();
            $effect.root(() => {
                $effect(() => {
                    this.save();
                    this.notifyListeners(); // Notify legacy subscribers
                });
            });
        }
    }

    private load() {
        const stored = localStorage.getItem(STORE_KEY);
        if (!stored) return;

        try {
            const parsed = JSON.parse(stored);
            // Migration for ADX 'length' to 'adxSmoothing'
            let adxParsed = { ...defaultSettings.adx, ...(parsed.adx || {}) };
            if (
                parsed.adx &&
                parsed.adx.length !== undefined &&
                parsed.adx.adxSmoothing === undefined
            ) {
                adxParsed.adxSmoothing = parsed.adx.length;
            }

            this.historyLimit = parsed.historyLimit || defaultSettings.historyLimit;
            this.precision = parsed.precision !== undefined ? parsed.precision : defaultSettings.precision;
            this.rsi = { ...defaultSettings.rsi, ...parsed.rsi };
            this.macd = { ...defaultSettings.macd, ...parsed.macd };
            this.stochastic = { ...defaultSettings.stochastic, ...parsed.stochastic };
            this.cci = { ...defaultSettings.cci, ...parsed.cci };
            this.adx = adxParsed;
            this.ao = { ...defaultSettings.ao, ...parsed.ao };
            this.momentum = { ...defaultSettings.momentum, ...parsed.momentum };
            this.pivots = { ...defaultSettings.pivots, ...parsed.pivots };

            this.ema = parsed.ema
                ? {
                    ema1: {
                        ...defaultSettings.ema.ema1,
                        ...(parsed.ema.ema1 || { length: parsed.ema.ema1Length }),
                    },
                    ema2: {
                        ...defaultSettings.ema.ema2,
                        ...(parsed.ema.ema2 || { length: parsed.ema.ema2Length }),
                    },
                    ema3: {
                        ...defaultSettings.ema.ema3,
                        ...(parsed.ema.ema3 || { length: parsed.ema.ema3Length }),
                    },
                    source: parsed.ema.source || defaultSettings.ema.source,
                }
                : defaultSettings.ema;

        } catch (e) {
            console.error("IndicatorManager: Failed to load from localStorage", e);
        }
    }

    private notifyListeners() {
        const value = this.toJSON();
        this.listeners.forEach(fn => fn(value));
    }

    notify() {
        this.notifyListeners();
    }

    private save() {
        if (!browser) return;
        try {
            const data = this.toJSON();
            localStorage.setItem(STORE_KEY, JSON.stringify(data));
        } catch (e) { console.error("Save error", e); }
    }

    toJSON(): IndicatorSettings {
        return {
            historyLimit: this.historyLimit,
            precision: this.precision,
            rsi: $state.snapshot(this.rsi),
            macd: $state.snapshot(this.macd),
            stochastic: $state.snapshot(this.stochastic),
            cci: $state.snapshot(this.cci),
            adx: $state.snapshot(this.adx),
            ao: $state.snapshot(this.ao),
            momentum: $state.snapshot(this.momentum),
            ema: $state.snapshot(this.ema),
            pivots: $state.snapshot(this.pivots),
            atr: $state.snapshot(this.atr),
            bb: $state.snapshot(this.bb),
        };
    }

    // Legacy support
    subscribe(fn: (value: IndicatorSettings) => void): () => void {
        fn(this.toJSON());
        this.listeners.add(fn);
        return () => {
            this.listeners.delete(fn);
        };
    }

    update(fn: (s: IndicatorSettings) => IndicatorSettings) {
        const current = this.toJSON();
        const next = fn(current);
        // Apply back to state
        this.historyLimit = next.historyLimit;
        this.precision = next.precision;
        this.rsi = next.rsi;
        this.macd = next.macd;
        this.stochastic = next.stochastic;
        this.cci = next.cci;
        this.adx = next.adx;
        this.ao = next.ao;
        this.momentum = next.momentum;
        this.ema = next.ema;
        this.pivots = next.pivots;
        this.atr = next.atr;
        this.bb = next.bb;
    }

    reset() {
        this.historyLimit = defaultSettings.historyLimit;
        // ... reset all fields manually or re-assign logic
        // Simpler for now:
        const d = defaultSettings;
        this.historyLimit = d.historyLimit;
        this.precision = d.precision;
        this.rsi = d.rsi;
        this.macd = d.macd;
        this.stochastic = d.stochastic;
        this.cci = d.cci;
        this.adx = d.adx;
        this.ao = d.ao;
        this.momentum = d.momentum;
        this.ema = d.ema;
        this.pivots = d.pivots;
        this.atr = d.atr;
        this.bb = d.bb;
    }
}

export const indicatorState = new IndicatorManager();
