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
  klinesBuffers?: Record<string, KlineBuffers>;
  technicals?: Record<string, import("../../services/technicalsTypes").TechnicalsData>;
  lastUpdated?: number;
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
