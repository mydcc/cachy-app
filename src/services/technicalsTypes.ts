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
import { z } from "zod";
import type { IndicatorSettings } from "../types/indicators";

export type { IndicatorSettings };

// Raw Kline Schema for validation before Decimal conversion
// Allows string or number inputs, but verifies presence of required fields
export const KlineRawSchema = z.object({
  time: z.number(),
  open: z.union([z.string(), z.number()]),
  high: z.union([z.string(), z.number()]),
  low: z.union([z.string(), z.number()]),
  close: z.union([z.string(), z.number()]),
  volume: z.union([z.string(), z.number()]),
}).passthrough();

export type KlineRaw = z.infer<typeof KlineRawSchema>;

// Source Data (Financial Precision required)
export interface Kline {
  open: Decimal;
  high: Decimal;
  low: Decimal;
  close: Decimal;
  volume: Decimal;
  time: number; // Unix timestamp in ms
}

export interface KlineBuffers {
  times: Float64Array;
  opens: Float64Array;
  highs: Float64Array;
  lows: Float64Array;
  closes: Float64Array;
  volumes: Float64Array;
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

export interface IndicatorResult {
  name: string;
  params?: string; // e.g. "14, 14"
  value: number;
  signal?: number; // For MACD signal line, etc.
  histogram?: number; // For MACD histogram
  action: "Buy" | "Sell" | "Neutral" | "Strong Buy" | "Strong Sell";
  extra?: string; // Optional extra info string (e.g., "D: 80")
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
    bb?: {
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
    choppiness?: { value: number; state: "Trend" | "Range" | "Neutral" };
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
    volumeMa?: number;
    adx?: { value: number; pdi: number; mdi: number; trend: string; dir: string };
    marketStructure?: { highs: { value: number; type: string }[]; lows: { value: number; type: string }[]; };
  };
  lastUpdated?: number;
}

// Deprecated: Serialized types are no longer needed as we transfer numbers directly
// Keeping type alias for compatibility if needed, but pointing to main type
export type SerializedTechnicalsData = TechnicalsData;
export type SerializedIndicatorResult = IndicatorResult;
export type SerializedDivergenceItem = DivergenceItem;

export function getEmptyData(): TechnicalsData {
  return {
    oscillators: [],
    movingAverages: [],
    pivots: {
      classic: {
        p: 0,
        r1: 0,
        r2: 0,
        r3: 0,
        s1: 0,
        s2: 0,
        s3: 0,
      },
    },
    pivotBasis: {
      high: 0,
      low: 0,
      close: 0,
      open: 0,
    },
    summary: { buy: 0, sell: 0, neutral: 0, action: "Neutral" },
  };
}

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

export type WorkerMessageType = "CALCULATE" | "RESULT" | "ERROR" | "INITIALIZE" | "UPDATE" | "SHIFT" | "CLEANUP";

export interface WorkerMessage {
  type: WorkerMessageType;
  payload?: any;
  error?: string;
  id?: string;
  buffers?: KlineBuffers; // Returned buffers for recycling (Zero-Copy Ping-Pong)
}

// --- Stateful Indicator Types ---

export interface EmaState {
  prevEma: number;
}

export interface SmaState {
  // For sliding window SMA, we usually need the full window to subtract the old value.
  // However, for pure streaming, if we have the ring buffer of history, we can fetch old value.
  // The worker will hold a RingBuffer of price history.
  prevSum: number;
  prevSumSq?: number; // Optimization for Variance
}

export interface RsiState {
  avgGain: number;
  avgLoss: number;
  prevPrice: number;
}

export interface TechnicalsState {
  // History Buffer (Circular)
  // Needed for indicators that require looking back N periods (SMA, Bollinger, etc.)
  // We only need to store 'Close' for most, but High/Low for some.
  // For MVP, we might just store the last N candles.
  lastCandle: Kline | null;

  // Indicator States
  ema?: Record<string, EmaState>; // Keyed by length
  sma?: Record<string, SmaState>;
  rsi?: Record<string, RsiState>;

  // Last calculated result (to update incrementally)
  lastResult?: TechnicalsData;
}
