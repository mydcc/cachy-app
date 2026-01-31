/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { browser } from "$app/environment";
import { untrack } from "svelte";

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
  stochRsi: {
    length: number;
    rsiLength: number;
    kPeriod: number;
    dPeriod: number;
    source: "close";
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
  williamsR: {
    length: number;
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
  ichimoku: {
    conversionPeriod: number;
    basePeriod: number;
    spanBPeriod: number;
    displacement: number;
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
  choppiness: {
    length: number;
  };
  // Pro Indicators
  superTrend: {
    factor: number;
    period: number;
  };
  atrTrailingStop: {
    period: number;
    multiplier: number;
  };
  obv: {
    smoothingLength: number;
  };
  mfi: {
    length: number;
  };
  vwap: {
    length: number; // 0 for session/full
    anchor: "session" | "fixed";
    anchorPoint?: number;
  };
  parabolicSar: {
    start: number;
    increment: number;
    max: number;
  };
  volumeMa: {
    length: number;
    maType: "sma" | "ema" | "wma";
  };
  volumeProfile: {
    rows: number;
  };
  // Alias for backward compatibility
  bollingerBands: {
    length: number;
    stdDev: number;
    source: "close" | "open" | "high" | "low" | "hl2" | "hlc3";
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
  stochRsi: {
    length: 14,
    rsiLength: 14,
    kPeriod: 3,
    dPeriod: 3,
    source: "close",
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
  williamsR: {
    length: 14,
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
  ichimoku: {
    conversionPeriod: 9,
    basePeriod: 26,
    spanBPeriod: 52,
    displacement: 26,
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
  choppiness: {
    length: 14,
  },
  superTrend: {
    factor: 3,
    period: 10,
  },
  atrTrailingStop: {
    period: 14,
    multiplier: 3.5,
  },
  obv: {
    smoothingLength: 0,
  },
  mfi: {
    length: 14,
  },
  vwap: {
    length: 0,
    anchor: "session",
  },
  parabolicSar: {
    start: 0.02,
    increment: 0.02,
    max: 0.2,
  },
  volumeMa: {
    length: 20,
    maType: "sma",
  },
  volumeProfile: {
    rows: 24,
  },
  bollingerBands: {
    length: 20,
    stdDev: 2,
    source: "close",
  },
};

const STORE_KEY = "cachy_indicator_settings";

class IndicatorManager {
  historyLimit = $state(defaultSettings.historyLimit);
  precision = $state(defaultSettings.precision);

  // Oscillators
  rsi = $state(defaultSettings.rsi);
  stochRsi = $state(defaultSettings.stochRsi);
  stochastic = $state(defaultSettings.stochastic);
  williamsR = $state(defaultSettings.williamsR);
  cci = $state(defaultSettings.cci);
  momentum = $state(defaultSettings.momentum);
  ao = $state(defaultSettings.ao);
  mfi = $state(defaultSettings.mfi);

  // Trend
  macd = $state(defaultSettings.macd);
  adx = $state(defaultSettings.adx);
  ema = $state(defaultSettings.ema);
  superTrend = $state(defaultSettings.superTrend);
  atrTrailingStop = $state(defaultSettings.atrTrailingStop);
  ichimoku = $state(defaultSettings.ichimoku);

  // Volatility
  atr = $state(defaultSettings.atr);
  bb = $state(defaultSettings.bb);
  choppiness = $state(defaultSettings.choppiness);

  // Volume & Misc
  obv = $state(defaultSettings.obv);
  vwap = $state(defaultSettings.vwap);
  parabolicSar = $state(defaultSettings.parabolicSar); // Add state
  volumeProfile = $state(defaultSettings.volumeProfile);
  volumeMa = $state(defaultSettings.volumeMa);
  bollingerBands = $state(defaultSettings.bollingerBands);
  pivots = $state(defaultSettings.pivots);

  private listeners: Set<(value: IndicatorSettings) => void> = new Set();
  private saveTimer: any = null;
  private notifyTimer: any = null;

  // Cache the snapshot using $derived to avoid expensive re-cloning on every access
  private _snapshot = $derived({
    historyLimit: this.historyLimit,
    precision: this.precision,
    rsi: $state.snapshot(this.rsi),
    stochRsi: $state.snapshot(this.stochRsi),
    macd: $state.snapshot(this.macd),
    stochastic: $state.snapshot(this.stochastic),
    williamsR: $state.snapshot(this.williamsR),
    cci: $state.snapshot(this.cci),
    adx: $state.snapshot(this.adx),
    ao: $state.snapshot(this.ao),
    momentum: $state.snapshot(this.momentum),
    ema: $state.snapshot(this.ema),
    pivots: $state.snapshot(this.pivots),
    atr: $state.snapshot(this.atr),
    bb: $state.snapshot(this.bb),
    superTrend: $state.snapshot(this.superTrend),
    atrTrailingStop: $state.snapshot(this.atrTrailingStop),
    obv: $state.snapshot(this.obv),
    mfi: $state.snapshot(this.mfi),
    vwap: $state.snapshot(this.vwap),
    parabolicSar: $state.snapshot(this.parabolicSar),
    ichimoku: $state.snapshot(this.ichimoku),
    choppiness: $state.snapshot(this.choppiness),
    volumeProfile: $state.snapshot(this.volumeProfile),
    volumeMa: $state.snapshot(this.volumeMa),
    bollingerBands: $state.snapshot(this.bollingerBands),
  });

  constructor() {
    if (browser) {
      this.load();
      $effect.root(() => {
        $effect(() => {
          // Track ALL properties by calling toJSON()
          this.toJSON();

          untrack(() => {
            if (this.saveTimer) clearTimeout(this.saveTimer);
            this.saveTimer = setTimeout(() => {
              this.save();
            }, 500);

            if (this.notifyTimer) clearTimeout(this.notifyTimer);
            this.notifyTimer = setTimeout(() => {
              this.notifyListeners();
            }, 50);
          });
        });
      });
    }
  }

  private load() {
    const stored = localStorage.getItem(STORE_KEY);
    if (!stored) return;

    try {
      const parsed = JSON.parse(stored);

      // Migration for ADX
      let adxParsed = { ...defaultSettings.adx, ...(parsed.adx || {}) };
      if (
        parsed.adx &&
        parsed.adx.length !== undefined &&
        parsed.adx.adxSmoothing === undefined
      ) {
        adxParsed.adxSmoothing = parsed.adx.length;
      }

      this.historyLimit = parsed.historyLimit || defaultSettings.historyLimit;
      this.precision = parsed.precision ?? defaultSettings.precision;

      this.rsi = { ...defaultSettings.rsi, ...parsed.rsi };
      this.stochRsi = { ...defaultSettings.stochRsi, ...parsed.stochRsi };
      this.macd = { ...defaultSettings.macd, ...parsed.macd };
      this.stochastic = { ...defaultSettings.stochastic, ...parsed.stochastic };
      this.williamsR = { ...defaultSettings.williamsR, ...parsed.williamsR };
      this.cci = { ...defaultSettings.cci, ...parsed.cci };
      this.adx = adxParsed;
      this.ao = { ...defaultSettings.ao, ...parsed.ao };
      this.momentum = { ...defaultSettings.momentum, ...parsed.momentum };
      this.pivots = { ...defaultSettings.pivots, ...parsed.pivots };
      this.superTrend = { ...defaultSettings.superTrend, ...parsed.superTrend };
      this.atrTrailingStop = {
        ...defaultSettings.atrTrailingStop,
        ...parsed.atrTrailingStop,
      };
      this.obv = { ...defaultSettings.obv, ...parsed.obv };
      this.mfi = { ...defaultSettings.mfi, ...parsed.mfi };
      this.vwap = { ...defaultSettings.vwap, ...parsed.vwap };
      this.parabolicSar = { ...defaultSettings.parabolicSar, ...parsed.parabolicSar };
      this.ichimoku = { ...defaultSettings.ichimoku, ...parsed.ichimoku };
      this.choppiness = { ...defaultSettings.choppiness, ...parsed.choppiness };
      this.volumeProfile = {
        ...defaultSettings.volumeProfile,
        ...parsed.volumeProfile,
      };

      this.atr = { ...defaultSettings.atr, ...parsed.atr };
      this.bb = { ...defaultSettings.bb, ...parsed.bb };

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
    this.listeners.forEach((fn) => fn(value));
  }

  notify() {
    this.notifyListeners();
  }

  private save() {
    if (!browser) return;
    try {
      const data = this.toJSON();
      localStorage.setItem(STORE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error("Save error", e);
    }
  }

  toJSON(): IndicatorSettings {
    // Return a fresh clone of the cached snapshot
    return structuredClone(this._snapshot);
  }

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

    this.historyLimit = next.historyLimit;
    this.precision = next.precision;
    this.rsi = next.rsi;
    this.stochRsi = next.stochRsi;
    this.macd = next.macd;
    this.stochastic = next.stochastic;
    this.williamsR = next.williamsR;
    this.cci = next.cci;
    this.adx = next.adx;
    this.ao = next.ao;
    this.momentum = next.momentum;
    this.ema = next.ema;
    this.pivots = next.pivots;
    this.atr = next.atr;
    this.bb = next.bb;
    this.superTrend = next.superTrend;
    this.atrTrailingStop = next.atrTrailingStop;
    this.obv = next.obv;
    this.mfi = next.mfi;
    this.vwap = next.vwap;
    this.parabolicSar = next.parabolicSar;
    this.ichimoku = next.ichimoku;
    this.choppiness = next.choppiness;
    this.volumeProfile = next.volumeProfile;
  }

  reset() {
    const d = defaultSettings;
    this.historyLimit = d.historyLimit;
    this.precision = d.precision;
    this.rsi = d.rsi;
    this.stochRsi = d.stochRsi;
    this.macd = d.macd;
    this.stochastic = d.stochastic;
    this.williamsR = d.williamsR;
    this.cci = d.cci;
    this.adx = d.adx;
    this.ao = d.ao;
    this.momentum = d.momentum;
    this.ema = d.ema;
    this.pivots = d.pivots;
    this.atr = d.atr;
    this.bb = d.bb;
    this.superTrend = d.superTrend;
    this.atrTrailingStop = d.atrTrailingStop;
    this.obv = d.obv;
    this.mfi = d.mfi;
    this.vwap = d.vwap;
    this.parabolicSar = d.parabolicSar;
    this.ichimoku = d.ichimoku;
    this.choppiness = d.choppiness;
    this.volumeProfile = d.volumeProfile;
  }
}

export const indicatorState = new IndicatorManager();
