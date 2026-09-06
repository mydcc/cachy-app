/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

/**
 * Pure TypeScript interfaces for indicator settings.
 * DO NOT import Svelte runes or stores here.
 */

export interface IndicatorSettings {
  historyLimit: number;
  precision: number;
  /** Chart-wide indicator line width in px (1-4), Settings → Technicals. */
  lineWidth: number;
  autoOptimize: boolean;
  preferredEngine: 'auto' | 'ts' | 'wasm' | 'gpu';
  performanceMode: 'balanced' | 'quality' | 'speed';

  // Panel Configuration
  panelSections: {
    summary: boolean;
    confluence: boolean;
    volatility: boolean;
    oscillators: boolean;
    movingAverages: boolean;
    pivots: boolean;
    advanced: boolean;
    signals: boolean;
  };

  // Per-indicator flags — fully independent switches:
  // - `enabled` = Technicals panel + alarms only. Never affects the chart.
  // - `showInChart` = chart display only (Settings "Chart" tab). Opt-in:
  //   every entry defaults to hidden; the chart obeys nothing else.
  // - `visible` = chart-only collapse state: open pane vs collapsed strip
  //   (chart pane header chevron).
  rsi: {
    enabled: boolean;
    visible: boolean;
    showInChart: boolean;
    length: number;
    source: "close" | "open" | "high" | "low" | "hl2" | "hlc3";
    showSignal: boolean;
    signalType: "sma" | "ema";
    signalLength: number;
    overbought: number;
    oversold: number;
    defaultTimeframe: string;
  };
  stochRsi: {
    enabled: boolean;
    visible: boolean;
    showInChart: boolean;
    length: number;
    rsiLength: number;
    kPeriod: number;
    dPeriod: number;
    source: "close";
  };
  macd: {
    enabled: boolean;
    visible: boolean;
    showInChart: boolean;
    fastLength: number;
    slowLength: number;
    signalLength: number;
    source: "close" | "open" | "high" | "low" | "hl2" | "hlc3";
    oscillatorMaType: "ema" | "sma";
    signalMaType: "ema" | "sma";
  };
  stochastic: {
    enabled: boolean;
    visible: boolean;
    showInChart: boolean;
    kPeriod: number;
    kSmoothing: number;
    dPeriod: number;
  };
  williamsR: {
    enabled: boolean;
    visible: boolean;
    showInChart: boolean;
    length: number;
  };
  cci: {
    enabled: boolean;
    visible: boolean;
    showInChart: boolean;
    length: number;
    source: "close" | "open" | "high" | "low" | "hl2" | "hlc3";
    threshold: number;
    smoothingType: "sma" | "ema";
    smoothingLength: number;
  };
  adx: {
    enabled: boolean;
    visible: boolean;
    showInChart: boolean;
    adxSmoothing: number;
    diLength: number;
    threshold: number;
  };
  ao: {
    enabled: boolean;
    visible: boolean;
    showInChart: boolean;
    fastLength: number;
    slowLength: number;
  };
  momentum: {
    enabled: boolean;
    visible: boolean;
    showInChart: boolean;
    length: number;
    source: "close" | "open" | "high" | "low" | "hl2" | "hlc3";
  };
  ema: {
    enabled: boolean;
    visible: boolean;
    showInChart: boolean;
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
  sma: {
    enabled: boolean;
    visible: boolean;
    showInChart: boolean;
    sma1: { length: number; };
    sma2: { length: number; };
    sma3: { length: number; };
  };
  wma: { enabled: boolean; visible: boolean; showInChart: boolean; length: number; };
    vwma: {
    enabled: boolean;
    visible: boolean;
    showInChart: boolean; length: number; };
    hma: {
    enabled: boolean;
    visible: boolean;
    showInChart: boolean; length: number; };
  ichimoku: {
    enabled: boolean;
    visible: boolean;
    showInChart: boolean;
    conversionPeriod: number;
    basePeriod: number;
    spanBPeriod: number;
    displacement: number;
  };
  pivots: {
    enabled: boolean;
    visible: boolean;
    showInChart: boolean;
    type: "classic" | "woodie" | "camarilla" | "fibonacci";
    viewMode: "integrated" | "separated" | "abstract";
  };
  atr: { enabled: boolean; visible: boolean; length: number; };
  choppiness: { enabled: boolean; visible: boolean; showInChart: boolean; length: number; };
    superTrend: {
    enabled: boolean;
    visible: boolean;
    showInChart: boolean; factor: number; period: number; };
    atrTrailingStop: {
    enabled: boolean;
    visible: boolean;
    showInChart: boolean; period: number; multiplier: number; };
  obv: { enabled: boolean; visible: boolean; showInChart: boolean; smoothingLength: number; };
  mfi: { enabled: boolean; visible: boolean; showInChart: boolean; length: number; };
  vwap: {
    enabled: boolean;
    visible: boolean;
    showInChart: boolean;
    length: number;
    anchor: "session" | "fixed";
    anchorPoint?: number;
  };
  parabolicSar: {
    enabled: boolean;
    visible: boolean;
    showInChart: boolean;
    start: number;
    increment: number;
    max: number;
  };
  volumeMa: {
    enabled: boolean;
    visible: boolean;
    length: number;
    maType: "sma" | "ema" | "wma";
  };
  volumeProfile: { enabled: boolean; visible: boolean; rows: number; };
  volume: { enabled: boolean; visible: boolean; showInChart: boolean; };
  bollingerBands: {
    enabled: boolean;
    visible: boolean;
    showInChart: boolean;
    length: number;
    stdDev: number;
    source: "close" | "open" | "high" | "low" | "hl2" | "hlc3";
  };
  _cachedJson?: string;
}
