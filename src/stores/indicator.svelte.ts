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

export const defaultIndicatorSettings: IndicatorSettings = {
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
  historyLimit = $state(defaultIndicatorSettings.historyLimit);
  precision = $state(defaultIndicatorSettings.precision);

  // Oscillators
  rsi = $state(defaultIndicatorSettings.rsi);
  stochRsi = $state(defaultIndicatorSettings.stochRsi);
  stochastic = $state(defaultIndicatorSettings.stochastic);
  williamsR = $state(defaultIndicatorSettings.williamsR);
  cci = $state(defaultIndicatorSettings.cci);
  momentum = $state(defaultIndicatorSettings.momentum);
  ao = $state(defaultIndicatorSettings.ao);
  mfi = $state(defaultIndicatorSettings.mfi);

  // Trend
  macd = $state(defaultIndicatorSettings.macd);
  adx = $state(defaultIndicatorSettings.adx);
  ema = $state(defaultIndicatorSettings.ema);
  superTrend = $state(defaultIndicatorSettings.superTrend);
  atrTrailingStop = $state(defaultIndicatorSettings.atrTrailingStop);
  ichimoku = $state(defaultIndicatorSettings.ichimoku);

  // Volatility
  atr = $state(defaultIndicatorSettings.atr);
  bb = $state(defaultIndicatorSettings.bb);
  choppiness = $state(defaultIndicatorSettings.choppiness);

  // Volume & Misc
  obv = $state(defaultIndicatorSettings.obv);
  vwap = $state(defaultIndicatorSettings.vwap);
  parabolicSar = $state(defaultIndicatorSettings.parabolicSar); // Add state
  volumeProfile = $state(defaultIndicatorSettings.volumeProfile);
  volumeMa = $state(defaultIndicatorSettings.volumeMa);
  bollingerBands = $state(defaultIndicatorSettings.bollingerBands);
  pivots = $state(defaultIndicatorSettings.pivots);

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
      let adxParsed = { ...defaultIndicatorSettings.adx, ...(parsed.adx || {}) };
      if (
        parsed.adx &&
        parsed.adx.length !== undefined &&
        parsed.adx.adxSmoothing === undefined
      ) {
        adxParsed.adxSmoothing = parsed.adx.length;
      }

      this.historyLimit = parsed.historyLimit || defaultIndicatorSettings.historyLimit;
      this.precision = parsed.precision ?? defaultIndicatorSettings.precision;

      this.rsi = { ...defaultIndicatorSettings.rsi, ...parsed.rsi };
      this.stochRsi = { ...defaultIndicatorSettings.stochRsi, ...parsed.stochRsi };
      this.macd = { ...defaultIndicatorSettings.macd, ...parsed.macd };
      this.stochastic = { ...defaultIndicatorSettings.stochastic, ...parsed.stochastic };
      this.williamsR = { ...defaultIndicatorSettings.williamsR, ...parsed.williamsR };
      this.cci = { ...defaultIndicatorSettings.cci, ...parsed.cci };
      this.adx = adxParsed;
      this.ao = { ...defaultIndicatorSettings.ao, ...parsed.ao };
      this.momentum = { ...defaultIndicatorSettings.momentum, ...parsed.momentum };
      this.pivots = { ...defaultIndicatorSettings.pivots, ...parsed.pivots };
      this.superTrend = { ...defaultIndicatorSettings.superTrend, ...parsed.superTrend };
      this.atrTrailingStop = {
        ...defaultIndicatorSettings.atrTrailingStop,
        ...parsed.atrTrailingStop,
      };
      this.obv = { ...defaultIndicatorSettings.obv, ...parsed.obv };
      this.mfi = { ...defaultIndicatorSettings.mfi, ...parsed.mfi };
      this.vwap = { ...defaultIndicatorSettings.vwap, ...parsed.vwap };
      this.parabolicSar = { ...defaultIndicatorSettings.parabolicSar, ...parsed.parabolicSar };
      this.ichimoku = { ...defaultIndicatorSettings.ichimoku, ...parsed.ichimoku };
      this.choppiness = { ...defaultIndicatorSettings.choppiness, ...parsed.choppiness };
      this.volumeProfile = {
        ...defaultIndicatorSettings.volumeProfile,
        ...parsed.volumeProfile,
      };

      this.atr = { ...defaultIndicatorSettings.atr, ...parsed.atr };
      this.bb = { ...defaultIndicatorSettings.bb, ...parsed.bb };

      this.ema = parsed.ema
        ? {
          ema1: {
            ...defaultIndicatorSettings.ema.ema1,
            ...(parsed.ema.ema1 || { length: parsed.ema.ema1Length }),
          },
          ema2: {
            ...defaultIndicatorSettings.ema.ema2,
            ...(parsed.ema.ema2 || { length: parsed.ema.ema2Length }),
          },
          ema3: {
            ...defaultIndicatorSettings.ema.ema3,
            ...(parsed.ema.ema3 || { length: parsed.ema.ema3Length }),
          },
          source: parsed.ema.source || defaultIndicatorSettings.ema.source,
        }
        : defaultIndicatorSettings.ema;
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
    const d = defaultIndicatorSettings;
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
