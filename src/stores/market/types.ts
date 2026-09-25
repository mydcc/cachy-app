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
import type { Kline, KlineBuffers } from "../../services/technicalsTypes";
import type { QuoteSource } from "../../services/priceResolution";

export interface MarketData {
  symbol: string;
  lastPrice: Decimal | null;
  indexPrice: Decimal | null;
  markPrice: Decimal | null;
  fundingRate: Decimal | null;
  nextFundingTime: number | null;
  fundingInterval?: number | null;
  depth?: {
    bids: [string, string][];
    asks: [string, string][];
  };
  highPrice?: Decimal | null;
  lowPrice?: Decimal | null;
  volume?: Decimal | null;
  quoteVolume?: Decimal | null;
  priceChangePercent?: Decimal | null;
  klines: Record<string, Kline[]>;
  // Map, not Record: this is written with a dynamic timeframe key (see
  // klineBuffers.ts's applySymbolKlines) that CodeQL flags as a
  // prototype-polluting assignment on a plain object, Object.create(null)
  // included — a Map is the pattern its own recommendation names that it
  // actually recognizes.
  klinesBuffers?: Map<string, KlineBuffers>;
  technicals?: Record<string, import("../../services/technicalsTypes").TechnicalsData>;
  lastUpdated?: number;
  /**
   * When `markPrice` last arrived with a real value (WS tick or REST
   * gap-bridge), independent of `lastUpdated` — which any channel's traffic
   * refreshes. BUG-0512: pricing money off `markPrice` needs the age of the
   * price, not the age of the object. Stamped in `applyUpdate`, read by the
   * price resolver; nothing else should write it.
   */
  markPriceUpdatedAt?: number;
  /**
   * When `lastPrice` last arrived with a real value (BUG-0558) — the age of
   * the price, not the age of the object. Mirrors BUG-0512's
   * `markPriceUpdatedAt`: `lastUpdated` is refreshed by any channel's
   * traffic (klines, depth), so it cannot tell a live quote from a frozen
   * one. Stamped in `applyUpdate`, read by `resolveMarketQuote`; nothing
   * else should write it.
   */
  lastPriceUpdatedAt?: number;
  /**
   * Source of the last stamped `lastPrice`: WS ticks are primary, REST only
   * fills gaps (the historyFetcher bridge poll). Preserved across updates
   * that carry no source of their own (technicals, depth, funding).
   */
  lastPriceSource?: QuoteSource;
  /** Per-timeframe freshness — set whenever klines for that tf are updated (WS or REST).
   *  Used by the polling loop to detect stale kline channels independently of the
   *  global lastUpdated (which is refreshed by ticker/price messages and would otherwise
   *  mask un-loaded or rate-limited kline fetches). */
  klinesLastUpdated?: Record<string, number>;
}

export interface TradingPairInfo {
  symbol: string;
  basePrecision?: number;
  quotePrecision?: number;
  minTradeVolume?: Decimal | null;
  maxLimitOrderVolume?: Decimal | null;
  maxMarketOrderVolume?: Decimal | null;
  minLeverage?: number;
  maxLeverage?: number;
  defaultLeverage?: number;
  priceProtectScope?: Decimal | null;
  symbolStatus?: string;
  isApiSupported?: boolean;
}

export interface PositionTier {
  level: number;
  startValue: Decimal | null;
  endValue: Decimal | null;
  leverage?: number;
  maintenanceMarginRate: Decimal | null;
}

export type MarketUpdatePayload = {
  [K in keyof MarketData]?: MarketData[K] | string | number | null;
};

export type WSStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error"
  | "reconnecting";

export type RawNumeric = number | string | null | undefined | Decimal;

export interface RawKline {
  time: number;
  open: RawNumeric;
  high: RawNumeric;
  low: RawNumeric;
  close: RawNumeric;
  volume: RawNumeric;
}

export interface RawPriceUpdate {
  price?: string;
  indexPrice?: string;
  markPrice?: string;
  fundingRate?: string;
  nextFundingTime?: number;
}

export interface RawTickerUpdate {
  open?: string;
  lastPrice?: string;
  high?: string;
  low?: string;
  vol?: string;
  quoteVol?: string;
  change?: string;
  fundingRate?: string;
  nextFundingTime?: number;
}

export interface RawDepthUpdate {
  bids: [string, string][];
  asks: [string, string][];
}

export interface RawKlineWsMessage {
  t: number;
  o: string;
  h: string;
  l: string;
  c: string;
  b: string;
}
