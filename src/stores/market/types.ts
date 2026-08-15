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
