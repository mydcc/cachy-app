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
  autoOptimize: boolean;
  preferredEngine: 'auto' | 'ts' | 'wasm' | 'gpu';
  performanceMode: 'balanced' | 'quality' | 'speed';

  // Panel Configuration
  panelSections: {
    summary: boolean;
    oscillators: boolean;
    movingAverages: boolean;
    pivots: boolean;
  };

  rsi: {
    enabled: boolean;
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
    length: number;
    rsiLength: number;
    kPeriod: number;
    dPeriod: number;
    source: "close";
  };
  macd: {
    enabled: boolean;
    fastLength: number;
    slowLength: number;
    signalLength: number;
    source: "close" | "open" | "high" | "low" | "hl2" | "hlc3";
    oscillatorMaType: "ema" | "sma";
    signalMaType: "ema" | "sma";
  };
  stochastic: {
    enabled: boolean;
    kPeriod: number;
    kSmoothing: number;
    dPeriod: number;
  };
  williamsR: {
    enabled: boolean;
    length: number;
  };
  cci: {
    enabled: boolean;
    length: number;
    source: "close" | "open" | "high" | "low" | "hl2" | "hlc3";
    threshold: number;
    smoothingType: "sma" | "ema";
    smoothingLength: number;
  };
  adx: {
    enabled: boolean;
    adxSmoothing: number;
    diLength: number;
    threshold: number;
  };
  ao: {
    enabled: boolean;
    fastLength: number;
    slowLength: number;
  };
  momentum: {
    enabled: boolean;
    length: number;
    source: "close" | "open" | "high" | "low" | "hl2" | "hlc3";
  };
  ema: {
    enabled: boolean;
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
    sma1: { length: number; };
    sma2: { length: number; };
    sma3: { length: number; };
  };
  wma: { enabled: boolean; length: number; };
  vwma: { enabled: boolean; length: number; };
  hma: { enabled: boolean; length: number; };
  ichimoku: {
    enabled: boolean;
    conversionPeriod: number;
    basePeriod: number;
    spanBPeriod: number;
    displacement: number;
  };
  pivots: {
    enabled: boolean;
    type: "classic" | "woodie" | "camarilla" | "fibonacci";
    viewMode: "integrated" | "separated" | "abstract";
  };
  atr: { enabled: boolean; length: number; };
  bb: { enabled: boolean; length: number; stdDev: number; };
  choppiness: { enabled: boolean; length: number; };
  superTrend: { enabled: boolean; factor: number; period: number; };
  atrTrailingStop: { enabled: boolean; period: number; multiplier: number; };
  obv: { enabled: boolean; smoothingLength: number; };
  mfi: { enabled: boolean; length: number; };
  vwap: {
    enabled: boolean;
    length: number;
    anchor: "session" | "fixed";
    anchorPoint?: number;
  };
  parabolicSar: {
    enabled: boolean;
    start: number;
    increment: number;
    max: number;
  };
  volumeMa: {
    enabled: boolean;
    length: number;
    maType: "sma" | "ema" | "wma";
  };
  volumeProfile: { enabled: boolean; rows: number; };
  bollingerBands: {
    enabled: boolean;
    length: number;
    stdDev: number;
    source: "close" | "open" | "high" | "low" | "hl2" | "hlc3";
  };
  _cachedJson?: string;
}
