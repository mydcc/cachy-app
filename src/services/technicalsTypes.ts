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

export interface Kline {
  open: Decimal;
  high: Decimal;
  low: Decimal;
  close: Decimal;
  volume: Decimal;
  time: number; // Unix timestamp in ms
}

export interface IndicatorResult {
  name: string;
  params?: string; // e.g. "14, 14"
  value: Decimal;
  signal?: Decimal; // For MACD signal line, etc.
  histogram?: Decimal; // For MACD histogram
  action: "Buy" | "Sell" | "Neutral" | "Strong Buy" | "Strong Sell";
}

export interface DivergenceItem {
  indicator: string; // "RSI", "MACD", "StochRSI"
  type: "Regular" | "Hidden";
  side: "Bullish" | "Bearish";
  startIdx: number;
  endIdx: number;
  priceStart: Decimal;
  priceEnd: Decimal;
  indStart: Decimal;
  indEnd: Decimal;
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
      r3: Decimal;
      r2: Decimal;
      r1: Decimal;
      p: Decimal;
      s1: Decimal;
      s2: Decimal;
      s3: Decimal;
    };
  };
  pivotBasis?: {
    high: Decimal;
    low: Decimal;
    close: Decimal;
    open: Decimal;
  };
  summary: {
    buy: number;
    sell: number;
    neutral: number;
    action: "Buy" | "Sell" | "Neutral";
  };
  volatility?: {
    atr: Decimal;
    bb: {
      upper: Decimal;
      middle: Decimal;
      lower: Decimal;
      percentP: Decimal; // Price position within bands (0-1)
    };
  };
  // New Fields
  divergences?: DivergenceItem[];
  confluence?: ConfluenceData;
  advanced?: {
    vwap?: Decimal;
    mfi?: { value: Decimal; action: string };
    stochRsi?: { k: Decimal; d: Decimal; action: string };
    williamsR?: { value: Decimal; action: string };
    choppiness?: { value: Decimal; state: "Trend" | "Range" };
    ichimoku?: {
      conversion: Decimal;
      base: Decimal;
      spanA: Decimal;
      spanB: Decimal;
      action: string;
    };
    parabolicSar?: Decimal;
    // Phase 5: Pro Indicators
    superTrend?: { value: Decimal; trend: "bull" | "bear" };
    atrTrailingStop?: { buy: Decimal; sell: Decimal };
    obv?: Decimal;
    volumeProfile?: {
      poc: Decimal;
      vaHigh: Decimal;
      vaLow: Decimal;
      rows: { priceStart: Decimal; priceEnd: Decimal; volume: Decimal }[];
    };
  };
  lastUpdated?: number;
}

export interface SerializedIndicatorResult {
  name: string;
  params?: string;
  value: string;
  signal?: string;
  histogram?: string;
  action: "Buy" | "Sell" | "Neutral" | "Strong Buy" | "Strong Sell";
}

export interface SerializedDivergenceItem {
  indicator: string;
  type: "Regular" | "Hidden";
  side: "Bullish" | "Bearish";
  priceStart: string;
  priceEnd: string;
  indStart: string;
  indEnd: string;
  startIdx: number;
  endIdx: number;
}

export interface SerializedTechnicalsData {
  oscillators: SerializedIndicatorResult[];
  movingAverages: SerializedIndicatorResult[];
  pivots: {
    classic: {
      p: string;
      r1: string;
      r2: string;
      r3: string;
      s1: string;
      s2: string;
      s3: string;
    };
  };
  pivotBasis?: {
    high: string;
    low: string;
    open: string;
    close: string;
  };
  summary: TechnicalsData["summary"];
  volatility?: {
    atr: string;
    bb: {
      upper: string;
      middle: string;
      lower: string;
      percentP: string;
    };
  };
  divergences?: SerializedDivergenceItem[];
  confluence?: ConfluenceData;
  advanced?: {
    vwap?: string;
    mfi?: { value: string; action: string };
    stochRsi?: { k: string; d: string; action: string };
    williamsR?: { value: string; action: string };
    choppiness?: { value: string; state: "Trend" | "Range" };
    ichimoku?: {
      conversion: string;
      base: string;
      spanA: string;
      spanB: string;
      action: string;
    };
    parabolicSar?: string;
    superTrend?: { value: string; trend: "bull" | "bear" };
    atrTrailingStop?: { buy: string; sell: string };
    obv?: string;
    volumeProfile?: {
      poc: string;
      vaHigh: string;
      vaLow: string;
      rows: { priceStart: string; priceEnd: string; volume: string }[];
    };
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

export type WorkerMessageType = "CALCULATE" | "RESULT" | "ERROR";

export interface WorkerMessage {
  type: WorkerMessageType;
  payload?: any;
  error?: string;
  id?: string;
}
