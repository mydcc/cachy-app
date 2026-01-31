/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { Decimal } from "decimal.js";

// Source Data (Financial Precision required)
export interface Kline {
  open: Decimal;
  high: Decimal;
  low: Decimal;
  close: Decimal;
  volume: Decimal;
  time: number; // Unix timestamp in ms
}

export interface SerializedKline {
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  time: number;
}

export function serializeKline(k: Kline): SerializedKline {
  return {
    open: k.open.toString(),
    high: k.high.toString(),
    low: k.low.toString(),
    close: k.close.toString(),
    volume: k.volume.toString(),
    time: k.time
  };
}

export function deserializeKline(k: SerializedKline): Kline {
  return {
    open: new Decimal(k.open),
    high: new Decimal(k.high),
    low: new Decimal(k.low),
    close: new Decimal(k.close),
    volume: new Decimal(k.volume),
    time: k.time
  };
}

// Technical Analysis Data (Performance optimized: native numbers)
export interface IndicatorResult {
  name: string;
  params?: string; // e.g. "14, 14"
  value: number;
  signal?: number; // For MACD signal line, etc.
  histogram?: number; // For MACD histogram
  action: "Buy" | "Sell" | "Neutral" | "Strong Buy" | "Strong Sell";
}

export interface DivergenceItem {
  indicator: string; // "RSI", "MACD", "StochRSI"
  type: "Regular" | "Hidden";
  side: "Bullish" | "Bearish";
  startIdx: number;
  endIdx: number;
  priceStart: number;
  priceEnd: number;
  indStart: number;
  indEnd: number;
}

export interface ConfluenceData {
  score: number; // 0-100
  level: "Strong Sell" | "Sell" | "Neutral" | "Buy" | "Strong Buy";
  contributing: string[]; // Reasons
}

export interface TechnicalsData {
  oscillators: IndicatorResult[];
  movingAverages: IndicatorResult[];
  pivots: {
    classic: {
      r3: number;
      r2: number;
      r1: number;
      p: number;
      s1: number;
      s2: number;
      s3: number;
    };
  };
  pivotBasis?: {
    high: number;
    low: number;
    close: number;
    open: number;
  };
  summary: {
    buy: number;
    sell: number;
    neutral: number;
    action: "Buy" | "Sell" | "Neutral";
  };
  volatility?: {
    atr: number;
    bb: {
      upper: number;
      middle: number;
      lower: number;
      percentP: number; // Price position within bands (0-1)
    };
  };
  // New Fields
  divergences?: DivergenceItem[];
  confluence?: ConfluenceData;
  advanced?: {
    vwap?: number;
    mfi?: { value: number; action: string };
    stochRsi?: { k: number; d: number; action: string };
    williamsR?: { value: number; action: string };
    choppiness?: { value: number; state: "Trend" | "Range" };
    ichimoku?: {
      conversion: number;
      base: number;
      spanA: number;
      spanB: number;
      action: string;
    };
    parabolicSar?: number;
    // Phase 5: Pro Indicators
    superTrend?: { value: number; trend: "bull" | "bear" };
    atrTrailingStop?: { buy: number; sell: number };
    obv?: number;
    volumeProfile?: {
      poc: number;
      vaHigh: number;
      vaLow: number;
      rows: { priceStart: number; priceEnd: number; volume: number }[];
    };
  };
  lastUpdated?: number;
}

// Deprecated: Serialized types are no longer needed as we transfer numbers directly
// Keeping type alias for compatibility if needed, but pointing to main type
export type SerializedTechnicalsData = TechnicalsData;
export type SerializedIndicatorResult = IndicatorResult;
export type SerializedDivergenceItem = DivergenceItem;

export interface WorkerCalculatePayload {
  klines: {
    time: number;
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
  }[];
  settings: any; // IndicatorSettings
  enabledIndicators?: Partial<Record<string, boolean>>; // Indicator filter
}

export interface WorkerCalculatePayloadSoA {
  times: Float64Array;
  opens: Float64Array;
  highs: Float64Array;
  lows: Float64Array;
  closes: Float64Array;
  volumes: Float64Array;
  settings: any;
  enabledIndicators?: Partial<Record<string, boolean>>;
}

export type WorkerMessageType = "CALCULATE" | "RESULT" | "ERROR";

export interface WorkerMessage {
  type: WorkerMessageType;
  payload?: any;
  error?: string;
  id?: string;
}
