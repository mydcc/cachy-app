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
import type { IndicatorSettings } from "../types/indicators";

const defaultSettings: IndicatorSettings = {
  historyLimit: 750,
  precision: 4,
  autoOptimize: true,
  preferredEngine: 'auto',
  performanceMode: 'balanced',

    panelSections: {
      summary: true,
      oscillators: true,
      movingAverages: true,
      pivots: true,
      advanced: true,
      signals: true,
      volatility: true,
      confluence: true,
    },

  rsi: {
    enabled: true,
    visible: true,
    showInChart: true,
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
    enabled: true,
    visible: true,
    showInChart: true,
    length: 14,
    rsiLength: 14,
    kPeriod: 3,
    dPeriod: 3,
    source: "close",
  },
  macd: {
    enabled: true,
    visible: true,
    showInChart: true,
    fastLength: 12,
    slowLength: 26,
    signalLength: 9,
    source: "close",
    oscillatorMaType: "ema",
    signalMaType: "ema",
  },
  stochastic: {
    enabled: false,
    visible: true,
    showInChart: true,
    kPeriod: 14,
    kSmoothing: 3,
    dPeriod: 3,
  },
  williamsR: {
    enabled: false,
    visible: true,
    showInChart: true,
    length: 14,
  },
  cci: {
    enabled: true,
    visible: true,
    showInChart: true,
    length: 20,
    source: "hlc3",
    threshold: 100,
    smoothingType: "sma",
    smoothingLength: 5,
  },
  adx: {
    enabled: false,
    visible: true,
    showInChart: true,
    adxSmoothing: 14,
    diLength: 14,
    threshold: 25,
  },
  ao: {
    enabled: false,
    visible: true,
    showInChart: true,
    fastLength: 5,
    slowLength: 34,
  },
  momentum: {
    enabled: false,
    visible: true,
    showInChart: true,
    length: 10,
    source: "close",
  },
  ema: {
    enabled: true,
    visible: true,
    ema1: { length: 21, offset: 0, smoothingType: "sma", smoothingLength: 14 },
    ema2: { length: 50, offset: 0, smoothingType: "sma", smoothingLength: 14 },
    ema3: { length: 200, offset: 0, smoothingType: "sma", smoothingLength: 14 },
    source: "close",
  },
  sma: {
    enabled: false,
    visible: true,
    sma1: { length: 9 },
    sma2: { length: 21 },
    sma3: { length: 50 },
  },
  wma: { enabled: false, visible: true, length: 14 },
  vwma: { enabled: false, visible: true, length: 20 },
  hma: { enabled: false, visible: true, length: 9 },
  ichimoku: {
    enabled: false,
    visible: true,
    conversionPeriod: 9,
    basePeriod: 26,
    spanBPeriod: 52,
    displacement: 26,
  },
  pivots: {
    enabled: true,
    visible: true,
    showInChart: true,
    type: "classic",
    viewMode: "integrated",
  },
  atr: {
    enabled: false,
    visible: true,
    length: 14,
  },
  choppiness: {
    enabled: false,
    visible: true,
    showInChart: true,
    length: 14,
  },
  superTrend: {
    enabled: true,
    visible: true,
    factor: 3,
    period: 10,
  },
  atrTrailingStop: {
    enabled: false,
    visible: true,
    period: 14,
    multiplier: 3.5,
  },
  obv: {
    enabled: false,
    visible: true,
    showInChart: true,
    smoothingLength: 0,
  },
  mfi: {
    enabled: false,
    visible: true,
    showInChart: true,
    length: 14,
  },
  vwap: {
    enabled: true,
    visible: true,
    length: 0,
    anchor: "session",
  },
  parabolicSar: {
    enabled: false,
    visible: true,
    start: 0.02,
    increment: 0.02,
    max: 0.2,
  },
  volumeMa: {
    enabled: false,
    visible: true,
    length: 20,
    maType: "sma",
  },
  volumeProfile: {
    enabled: false,
    visible: true,
    rows: 24,
  },
  volume: {
    enabled: true,
    visible: true,
    showInChart: true,
  },
  bollingerBands: {
    enabled: true,
    visible: true,
    showInChart: true,
    length: 20,
    stdDev: 2,
    source: "close",
  },
};

const STORE_KEY = "cachy_indicator_settings";

class IndicatorManager {
  historyLimit = $state(defaultSettings.historyLimit);
  precision = $state(defaultSettings.precision);
  autoOptimize = $state(defaultSettings.autoOptimize);
  preferredEngine = $state(defaultSettings.preferredEngine);
  performanceMode = $state(defaultSettings.performanceMode);

  panelSections = $state(defaultSettings.panelSections);

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
  sma = $state(defaultSettings.sma);
  wma = $state(defaultSettings.wma);
  vwma = $state(defaultSettings.vwma);
  hma = $state(defaultSettings.hma);
  superTrend = $state(defaultSettings.superTrend);
  atrTrailingStop = $state(defaultSettings.atrTrailingStop);
  ichimoku = $state(defaultSettings.ichimoku);

  // Volatility
  atr = $state(defaultSettings.atr);
  choppiness = $state(defaultSettings.choppiness);

  // Volume & Misc
  obv = $state(defaultSettings.obv);
  vwap = $state(defaultSettings.vwap);
  parabolicSar = $state(defaultSettings.parabolicSar);
  volumeProfile = $state(defaultSettings.volumeProfile);
  volumeMa = $state(defaultSettings.volumeMa);
  volume = $state(defaultSettings.volume);
  bollingerBands = $state(defaultSettings.bollingerBands);
  pivots = $state(defaultSettings.pivots);

  private listeners: Set<(value: IndicatorSettings) => void> = new Set();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private notifyTimer: ReturnType<typeof setTimeout> | null = null;
  private effectCleanup: (() => void) | null = null;

  // Cache the snapshot using $derived to avoid expensive re-cloning on every access
  private _snapshot = $derived({
    historyLimit: this.historyLimit,
    precision: this.precision,
    autoOptimize: this.autoOptimize,
    preferredEngine: this.preferredEngine,
    performanceMode: this.performanceMode,
    panelSections: $state.snapshot(this.panelSections),
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
    volume: $state.snapshot(this.volume),
    bollingerBands: $state.snapshot(this.bollingerBands),

    sma: $state.snapshot(this.sma),
    wma: $state.snapshot(this.wma),
    vwma: $state.snapshot(this.vwma),
    hma: $state.snapshot(this.hma),
  });

  _cachedJson = $derived(JSON.stringify(this._snapshot));

  constructor() {
    if (browser) {
      this.load();
      this.effectCleanup = $effect.root(() => {
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

  destroy() {
    if (this.effectCleanup) {
      this.effectCleanup();
      this.effectCleanup = null;
    }
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (this.notifyTimer) {
      clearTimeout(this.notifyTimer);
      this.notifyTimer = null;
    }
  }

  private load() {
    const stored = localStorage.getItem(STORE_KEY);
    if (!stored) return;

    try {
      const parsed = JSON.parse(stored);

      // Migration for per-indicator flags (if missing)
      const merge = <T extends { enabled?: boolean; visible?: boolean; showInChart?: boolean }>(key: keyof IndicatorSettings, fallback: T): T => {
          const val: Partial<T> = parsed[key] || {};
          // Ensure enabled key exists
          if (val.enabled === undefined && fallback.enabled !== undefined) {
             val.enabled = fallback.enabled;
          }
          // Ensure visible key exists (introduced with collapsible chart panes)
          if (val.visible === undefined && fallback.visible !== undefined) {
             val.visible = fallback.visible;
          }
          // Ensure showInChart key exists (introduced with chart pane toggles:
          // old entries keep showing their pane)
          if (val.showInChart === undefined && fallback.showInChart !== undefined) {
             val.showInChart = fallback.showInChart;
          }
          return { ...fallback, ...val };
      }

      this.historyLimit = parsed.historyLimit || defaultSettings.historyLimit;
      this.precision = parsed.precision ?? defaultSettings.precision;
      this.autoOptimize = parsed.autoOptimize ?? defaultSettings.autoOptimize;
      this.preferredEngine = parsed.preferredEngine || defaultSettings.preferredEngine;
      this.performanceMode = parsed.performanceMode || defaultSettings.performanceMode;

      this.panelSections = { ...defaultSettings.panelSections, ...parsed.panelSections };

      this.rsi = merge('rsi', defaultSettings.rsi);
      this.stochRsi = merge('stochRsi', defaultSettings.stochRsi);
      this.macd = merge('macd', defaultSettings.macd);
      this.stochastic = merge('stochastic', defaultSettings.stochastic);
      this.williamsR = merge('williamsR', defaultSettings.williamsR);
      this.cci = merge('cci', defaultSettings.cci);

      this.adx = merge('adx', defaultSettings.adx);
      // Migration for ADX: Handle old 'length' property
      if (parsed.adx?.length !== undefined && parsed.adx?.adxSmoothing === undefined) {
        this.adx.adxSmoothing = parsed.adx.length;
      }

      this.ao = merge('ao', defaultSettings.ao);
      this.momentum = merge('momentum', defaultSettings.momentum);
      this.pivots = merge('pivots', defaultSettings.pivots);
      this.superTrend = merge('superTrend', defaultSettings.superTrend);
      this.atrTrailingStop = merge('atrTrailingStop', defaultSettings.atrTrailingStop);
      this.obv = merge('obv', defaultSettings.obv);
      this.mfi = merge('mfi', defaultSettings.mfi);
      this.vwap = merge('vwap', defaultSettings.vwap);
      this.parabolicSar = merge('parabolicSar', defaultSettings.parabolicSar);
      this.ichimoku = merge('ichimoku', defaultSettings.ichimoku);
      this.choppiness = merge('choppiness', defaultSettings.choppiness);
      this.volumeProfile = merge('volumeProfile', defaultSettings.volumeProfile);
      this.volume = merge('volume', defaultSettings.volume);

      this.atr = merge('atr', defaultSettings.atr);
      this.bollingerBands = merge('bollingerBands', defaultSettings.bollingerBands);
      this.volumeMa = merge('volumeMa', defaultSettings.volumeMa);

      this.ema = parsed.ema
        ? {
          enabled: parsed.ema.enabled !== undefined ? parsed.ema.enabled : defaultSettings.ema.enabled,
          visible: parsed.ema.visible ?? defaultSettings.ema.visible,
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

      this.sma = merge('sma', defaultSettings.sma);
      this.wma = merge('wma', defaultSettings.wma);
      this.vwma = merge('vwma', defaultSettings.vwma);
      this.hma = merge('hma', defaultSettings.hma);
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
    return { ...structuredClone(this._snapshot), _cachedJson: this._cachedJson };
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
    this.autoOptimize = next.autoOptimize;
    this.preferredEngine = next.preferredEngine;
    this.performanceMode = next.performanceMode;
    this.panelSections = next.panelSections;
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
    this.superTrend = next.superTrend;
    this.atrTrailingStop = next.atrTrailingStop;
    this.obv = next.obv;
    this.mfi = next.mfi;
    this.vwap = next.vwap;
    this.parabolicSar = next.parabolicSar;
    this.ichimoku = next.ichimoku;
    this.choppiness = next.choppiness;
    this.volumeProfile = next.volumeProfile;
    this.bollingerBands = next.bollingerBands;
    this.volumeMa = next.volumeMa;
    this.volume = next.volume;
    this.sma = next.sma;
    this.wma = next.wma;
    this.vwma = next.vwma;
    this.hma = next.hma;
  }

  reset() {
    const d = defaultSettings;
    this.historyLimit = d.historyLimit;
    this.precision = d.precision;
    this.autoOptimize = d.autoOptimize;
    this.preferredEngine = d.preferredEngine;
    this.performanceMode = d.performanceMode;
    this.panelSections = d.panelSections;
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
    this.superTrend = d.superTrend;
    this.atrTrailingStop = d.atrTrailingStop;
    this.obv = d.obv;
    this.mfi = d.mfi;
    this.vwap = d.vwap;
    this.parabolicSar = d.parabolicSar;
    this.ichimoku = d.ichimoku;
    this.choppiness = d.choppiness;
    this.volumeProfile = d.volumeProfile;
    this.bollingerBands = d.bollingerBands;
    this.volumeMa = d.volumeMa;
    this.volume = d.volume;
    this.sma = d.sma;
    this.wma = d.wma;
    this.vwma = d.vwma;
    this.hma = d.hma;
  }
}

export const indicatorState = new IndicatorManager();

// HMR: Cleanup on module disposal to prevent timers and effect leaks
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    indicatorState.destroy();
  });
}
