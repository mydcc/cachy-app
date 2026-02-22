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
  rsi: {
    length: number;
    source: "close" | "open" | "high" | "low" | "hl2" | "hlc3";
    smoothingType: "none" | "sma" | "ema" | "smma" | "wma" | "vwma" | "sma_bb";
    smoothingLength: number;
    bbStdDev: number;
    overbought: number;
    oversold: number;
    defaultTimeframe: string;
  };
  stochRsi: {
    length: number;
    rsiLength: number;
    kPeriod: number;
    dPeriod: number;
    source: "close" | "open" | "high" | "low" | "hl2" | "hlc3" | "ohlc4";
  };
  macd: {
    fastLength: number;
    slowLength: number;
    signalLength: number;
    source: "close" | "open" | "high" | "low" | "hl2" | "hlc3" | "ohlc4" | "hlcc4";
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
    source: "close" | "open" | "high" | "low" | "hl2" | "hlc3" | "ohlc4";
  };
  cci: {
    length: number;
    source: "close" | "open" | "high" | "low" | "hl2" | "hlc3";
    threshold: number;
    smoothingType: "none" | "sma" | "ema" | "smma" | "wma" | "vwma" | "sma_bb";
    smoothingLength: number;
  };
  adx: {
    adxSmoothing: number;
    diLength: number;
    threshold: number;
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
    };
    ema2: {
      length: number;
      offset: number;
    };
    ema3: {
      length: number;
      offset: number;
    };
    source: "close" | "open" | "high" | "low" | "hl2" | "hlc3";
    smoothingType: "none" | "sma" | "ema" | "smma" | "wma" | "vwma" | "sma_bb";
    smoothingLength: number;
    bbStdDev: number;
  };
  sma: {
    sma1: { length: number; };
    sma2: { length: number; };
    sma3: { length: number; };
  };
  wma: { length: number; };
  vwma: { length: number; };
  hma: { length: number; };
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
  atr: { length: number; };
  bb: { length: number; stdDev: number; };
  choppiness: { length: number; };
  superTrend: { factor: number; period: number; };
  atrTrailingStop: { period: number; multiplier: number; };
  obv: { smoothingLength: number; };
  mfi: { length: number; };
  vwap: {
    length: number;
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
  volumeProfile: { rows: number; };
  bollingerBands: {
    length: number;
    stdDev: number;
    source: "close" | "open" | "high" | "low" | "hl2" | "hlc3";
  };
  _cachedJson?: string;
}
