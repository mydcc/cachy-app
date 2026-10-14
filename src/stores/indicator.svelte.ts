/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { browser } from "$app/env";
import { untrack } from "svelte";
import type { IndicatorSettings } from "../types/indicators";
import { safeLocalStorage } from "../utils/storageWrapper";

/**
 * Freezes `value` and every object it reaches.
 *
 * The indicator settings are a fixed nested record, so the recursion ends on
 * primitives; freezing an already-frozen object is a no-op.
 */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

/*
 * The shipped record — the single pristine source every handoff into the store
 * copies from.
 *
 * Frozen, and not as decoration: the store's fields are live `$state` values,
 * and on a build whose `$state` wraps a plain object in place a field
 * initialised from this literal would *be* this literal. A write through the
 * store (the settings UI binds `indicatorState.rsi.length` directly) would then
 * land here, and `reset()` would restore the trader's own edits as the
 * "defaults" (BUG-0682). Every handoff deep-copies, so that is unreachable; the
 * freeze turns any future handoff that forgets into a loud `TypeError` instead
 * of silent corruption.
 *
 * Exported so tests can pin that immutability, under a name that says whose
 * defaults these are: `Settings` has a `defaultSettings` of its own, and that
 * one carries credentials.
 */
export const DEFAULT_INDICATOR_SETTINGS: IndicatorSettings = deepFreeze({
  historyLimit: 750,
  precision: 4,
  lineWidth: 1,
  preferredEngine: 'auto',

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
    showInChart: false,
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
    showInChart: false,
    length: 14,
    rsiLength: 14,
    kPeriod: 3,
    dPeriod: 3,
    source: "close",
  },
  macd: {
    enabled: true,
    visible: true,
    showInChart: false,
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
    showInChart: false,
    kPeriod: 14,
    kSmoothing: 3,
    dPeriod: 3,
  },
  williamsR: {
    enabled: false,
    visible: true,
    showInChart: false,
    length: 14,
  },
  cci: {
    enabled: true,
    visible: true,
    showInChart: false,
    length: 20,
    source: "hlc3",
    threshold: 100,
    smoothingType: "sma",
    smoothingLength: 5,
  },
  adx: {
    enabled: false,
    visible: true,
    showInChart: false,
    adxSmoothing: 14,
    diLength: 14,
    threshold: 25,
  },
  ao: {
    enabled: false,
    visible: true,
    showInChart: false,
    fastLength: 5,
    slowLength: 34,
  },
  momentum: {
    enabled: false,
    visible: true,
    showInChart: false,
    length: 10,
    source: "close",
  },
  ema: {
    enabled: true,
    visible: true,
    showInChart: false,
    ema1: { length: 21, offset: 0, smoothingType: "sma", smoothingLength: 14 },
    ema2: { length: 50, offset: 0, smoothingType: "sma", smoothingLength: 14 },
    ema3: { length: 200, offset: 0, smoothingType: "sma", smoothingLength: 14 },
    source: "close",
  },
  sma: {
    enabled: false,
    visible: true,
    showInChart: false,
    sma1: { length: 9 },
    sma2: { length: 21 },
    sma3: { length: 50 },
  },
  wma: { enabled: false, visible: true, showInChart: false, length: 14 },
  vwma: { enabled: false, visible: true, showInChart: false, length: 20 },
  hma: { enabled: false, visible: true, showInChart: false, length: 9 },
  ichimoku: {
    enabled: false,
    visible: true,
    showInChart: false,
    conversionPeriod: 9,
    basePeriod: 26,
    spanBPeriod: 52,
    displacement: 26,
  },
  pivots: {
    enabled: true,
    visible: true,
    showInChart: false,
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
    showInChart: false,
    length: 14,
  },
  superTrend: {
    enabled: true,
    visible: true,
    showInChart: false,
    factor: 3,
    period: 10,
  },
  atrTrailingStop: {
    enabled: false,
    visible: true,
    showInChart: false,
    period: 14,
    multiplier: 3.5,
  },
  obv: {
    enabled: false,
    visible: true,
    showInChart: false,
    smoothingLength: 0,
  },
  mfi: {
    enabled: false,
    visible: true,
    showInChart: false,
    length: 14,
  },
  vwap: {
    enabled: true,
    visible: true,
    showInChart: false,
    length: 0,
    anchor: "session",
  },
  parabolicSar: {
    enabled: false,
    visible: true,
    showInChart: false,
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
    showInChart: false,
  },
  bollingerBands: {
    enabled: true,
    visible: true,
    showInChart: false,
    length: 20,
    stdDev: 2,
    source: "close",
  },
});

const STORE_KEY = "cachy_indicator_settings";

/*
 * The settings a new install starts from — the pristine baseline a lesson
 * compares against, and what `reset()` restores from.
 *
 * A copy per call, because the result is handed to `$state` fields the UI writes
 * through: handing out the frozen literal's own subtrees would make the next
 * edit throw instead of landing in the field (BUG-0682).
 */
export function shippedIndicatorDefaults(): IndicatorSettings {
  return structuredClone(DEFAULT_INDICATOR_SETTINGS);
}

class IndicatorManager {
  historyLimit = $state(DEFAULT_INDICATOR_SETTINGS.historyLimit);
  precision = $state(DEFAULT_INDICATOR_SETTINGS.precision);
  lineWidth = $state(DEFAULT_INDICATOR_SETTINGS.lineWidth);
  preferredEngine = $state(DEFAULT_INDICATOR_SETTINGS.preferredEngine);

  panelSections = $state(structuredClone(DEFAULT_INDICATOR_SETTINGS.panelSections));

  // Oscillators
  rsi = $state(structuredClone(DEFAULT_INDICATOR_SETTINGS.rsi));
  stochRsi = $state(structuredClone(DEFAULT_INDICATOR_SETTINGS.stochRsi));
  stochastic = $state(structuredClone(DEFAULT_INDICATOR_SETTINGS.stochastic));
  williamsR = $state(structuredClone(DEFAULT_INDICATOR_SETTINGS.williamsR));
  cci = $state(structuredClone(DEFAULT_INDICATOR_SETTINGS.cci));
  momentum = $state(structuredClone(DEFAULT_INDICATOR_SETTINGS.momentum));
  ao = $state(structuredClone(DEFAULT_INDICATOR_SETTINGS.ao));
  mfi = $state(structuredClone(DEFAULT_INDICATOR_SETTINGS.mfi));

  // Trend
  macd = $state(structuredClone(DEFAULT_INDICATOR_SETTINGS.macd));
  adx = $state(structuredClone(DEFAULT_INDICATOR_SETTINGS.adx));
  ema = $state(structuredClone(DEFAULT_INDICATOR_SETTINGS.ema));
  sma = $state(structuredClone(DEFAULT_INDICATOR_SETTINGS.sma));
  wma = $state(structuredClone(DEFAULT_INDICATOR_SETTINGS.wma));
  vwma = $state(structuredClone(DEFAULT_INDICATOR_SETTINGS.vwma));
  hma = $state(structuredClone(DEFAULT_INDICATOR_SETTINGS.hma));
  superTrend = $state(structuredClone(DEFAULT_INDICATOR_SETTINGS.superTrend));
  atrTrailingStop = $state(structuredClone(DEFAULT_INDICATOR_SETTINGS.atrTrailingStop));
  ichimoku = $state(structuredClone(DEFAULT_INDICATOR_SETTINGS.ichimoku));

  // Volatility
  atr = $state(structuredClone(DEFAULT_INDICATOR_SETTINGS.atr));
  choppiness = $state(structuredClone(DEFAULT_INDICATOR_SETTINGS.choppiness));

  // Volume & Misc
  obv = $state(structuredClone(DEFAULT_INDICATOR_SETTINGS.obv));
  vwap = $state(structuredClone(DEFAULT_INDICATOR_SETTINGS.vwap));
  parabolicSar = $state(structuredClone(DEFAULT_INDICATOR_SETTINGS.parabolicSar));
  volumeProfile = $state(structuredClone(DEFAULT_INDICATOR_SETTINGS.volumeProfile));
  volumeMa = $state(structuredClone(DEFAULT_INDICATOR_SETTINGS.volumeMa));
  volume = $state(structuredClone(DEFAULT_INDICATOR_SETTINGS.volume));
  bollingerBands = $state(structuredClone(DEFAULT_INDICATOR_SETTINGS.bollingerBands));
  pivots = $state(structuredClone(DEFAULT_INDICATOR_SETTINGS.pivots));

  private listeners: Set<(value: IndicatorSettings) => void> = new Set();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private notifyTimer: ReturnType<typeof setTimeout> | null = null;
  private effectCleanup: (() => void) | null = null;

  // Cache the snapshot using $derived to avoid expensive re-cloning on every access
  private _snapshot = $derived({
    historyLimit: this.historyLimit,
    precision: this.precision,
    lineWidth: this.lineWidth,
    preferredEngine: this.preferredEngine,
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
    const stored = safeLocalStorage.getItem(STORE_KEY);
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
          // Ensure showInChart key exists (introduced with chart pane toggles,
          // opt-in since BUG-0404: missing keys migrate to hidden; entries
          // stored earlier keep their persisted value)
          if (val.showInChart === undefined && fallback.showInChart !== undefined) {
             val.showInChart = fallback.showInChart;
          }
          return structuredClone({ ...fallback, ...val });
      }

      this.historyLimit = parsed.historyLimit || DEFAULT_INDICATOR_SETTINGS.historyLimit;
      this.precision = parsed.precision ?? DEFAULT_INDICATOR_SETTINGS.precision;
      this.lineWidth = parsed.lineWidth ?? DEFAULT_INDICATOR_SETTINGS.lineWidth;
      this.preferredEngine = parsed.preferredEngine || DEFAULT_INDICATOR_SETTINGS.preferredEngine;

      // Deep, like every sibling. The plain spread alone happened to detach
      // because all eight leaves are primitives today — an assumption the first
      // nested field would silently break, re-aliasing the literal (BUG-0682
      // review). `structuredClone` states the intent the others already keep.
      this.panelSections = structuredClone({
        ...DEFAULT_INDICATOR_SETTINGS.panelSections,
        ...parsed.panelSections,
      });

      this.rsi = merge('rsi', DEFAULT_INDICATOR_SETTINGS.rsi);
      this.stochRsi = merge('stochRsi', DEFAULT_INDICATOR_SETTINGS.stochRsi);
      this.macd = merge('macd', DEFAULT_INDICATOR_SETTINGS.macd);
      this.stochastic = merge('stochastic', DEFAULT_INDICATOR_SETTINGS.stochastic);
      this.williamsR = merge('williamsR', DEFAULT_INDICATOR_SETTINGS.williamsR);
      this.cci = merge('cci', DEFAULT_INDICATOR_SETTINGS.cci);

      this.adx = merge('adx', DEFAULT_INDICATOR_SETTINGS.adx);
      // Migration for ADX: Handle old 'length' property
      if (parsed.adx?.length !== undefined && parsed.adx?.adxSmoothing === undefined) {
        this.adx.adxSmoothing = parsed.adx.length;
      }

      this.ao = merge('ao', DEFAULT_INDICATOR_SETTINGS.ao);
      this.momentum = merge('momentum', DEFAULT_INDICATOR_SETTINGS.momentum);
      this.pivots = merge('pivots', DEFAULT_INDICATOR_SETTINGS.pivots);
      this.superTrend = merge('superTrend', DEFAULT_INDICATOR_SETTINGS.superTrend);
      this.atrTrailingStop = merge('atrTrailingStop', DEFAULT_INDICATOR_SETTINGS.atrTrailingStop);
      this.obv = merge('obv', DEFAULT_INDICATOR_SETTINGS.obv);
      this.mfi = merge('mfi', DEFAULT_INDICATOR_SETTINGS.mfi);
      this.vwap = merge('vwap', DEFAULT_INDICATOR_SETTINGS.vwap);
      this.parabolicSar = merge('parabolicSar', DEFAULT_INDICATOR_SETTINGS.parabolicSar);
      this.ichimoku = merge('ichimoku', DEFAULT_INDICATOR_SETTINGS.ichimoku);
      this.choppiness = merge('choppiness', DEFAULT_INDICATOR_SETTINGS.choppiness);
      this.volumeProfile = merge('volumeProfile', DEFAULT_INDICATOR_SETTINGS.volumeProfile);
      this.volume = merge('volume', DEFAULT_INDICATOR_SETTINGS.volume);

      this.atr = merge('atr', DEFAULT_INDICATOR_SETTINGS.atr);
      this.bollingerBands = merge('bollingerBands', DEFAULT_INDICATOR_SETTINGS.bollingerBands);
      this.volumeMa = merge('volumeMa', DEFAULT_INDICATOR_SETTINGS.volumeMa);

      this.ema = parsed.ema
        ? structuredClone({
          enabled: parsed.ema.enabled !== undefined ? parsed.ema.enabled : DEFAULT_INDICATOR_SETTINGS.ema.enabled,
          visible: parsed.ema.visible ?? DEFAULT_INDICATOR_SETTINGS.ema.visible,
          showInChart: parsed.ema.showInChart ?? DEFAULT_INDICATOR_SETTINGS.ema.showInChart,
          ema1: {
            ...DEFAULT_INDICATOR_SETTINGS.ema.ema1,
            ...(parsed.ema.ema1 || { length: parsed.ema.ema1Length }),
          },
          ema2: {
            ...DEFAULT_INDICATOR_SETTINGS.ema.ema2,
            ...(parsed.ema.ema2 || { length: parsed.ema.ema2Length }),
          },
          ema3: {
            ...DEFAULT_INDICATOR_SETTINGS.ema.ema3,
            ...(parsed.ema.ema3 || { length: parsed.ema.ema3Length }),
          },
          source: parsed.ema.source || DEFAULT_INDICATOR_SETTINGS.ema.source,
        })
        : structuredClone(DEFAULT_INDICATOR_SETTINGS.ema);

      this.sma = merge('sma', DEFAULT_INDICATOR_SETTINGS.sma);
      this.wma = merge('wma', DEFAULT_INDICATOR_SETTINGS.wma);
      this.vwma = merge('vwma', DEFAULT_INDICATOR_SETTINGS.vwma);
      this.hma = merge('hma', DEFAULT_INDICATOR_SETTINGS.hma);
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
      // The cached JSON is a cache key for in-memory consumers, not part of the
      // record: persisting it stored a second full copy of the settings inside
      // the same blob — about twice the quota for this key — and nothing reads
      // it back, because `load()` merges field by field. Dropped before it is
      // written.
      delete data._cachedJson;
      safeLocalStorage.setItem(STORE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error("Save error", e);
    }
  }

  toJSON(): IndicatorSettings {
    // Return a fresh clone of the cached snapshot
    return { ...JSON.parse(this._cachedJson), _cachedJson: this._cachedJson };
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
    this.lineWidth = next.lineWidth;
    this.preferredEngine = next.preferredEngine;
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
    // A fresh deep copy per call, never the literal itself: the fields below
    // become `$state` proxies the UI writes through, so handing out the
    // literal's own subtrees would make the next edit land in the "defaults"
    // again (BUG-0682). `shippedIndicatorDefaults()` is already the pristine
    // copy, so reset and the baseline cannot disagree about what shipped.
    const d = shippedIndicatorDefaults();
    this.historyLimit = d.historyLimit;
    this.precision = d.precision;
    this.lineWidth = d.lineWidth;
    this.preferredEngine = d.preferredEngine;
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
