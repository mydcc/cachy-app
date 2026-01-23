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

export interface BitgetResponse<T> {
  code: string;
  msg: string;
  data: T;
  requestTime: number;
}

export interface BitgetTicker {
  instId: string;
  last: string;
  bestAsk: string;
  bestBid: string;
  high24h: string;
  low24h: string;
  priceChangePercent?: string; // Sometimes inferred
  volume24h: string; // Base volume
  quoteVolume: string; // Quote volume (usdtVolume)
  open24h: string;
}

// WS Ticker Data
export interface BitgetWSTicker {
  instId: string;
  last: string;
  bestAsk: string;
  bestBid: string;
  high24h: string;
  low24h: string;
  volume24h: string;
  quoteVolume?: string; // Might be usdtVolume
  open24h: string;
  ts: number;
}

export interface BitgetWSArg {
  instType: string;
  channel: string;
  instId: string;
}

export interface BitgetWSMessage {
  action: string;
  arg: BitgetWSArg;
  data: any[];
  ts?: number;
}

export interface BitgetKline {
  // [timestamp, open, high, low, close, volume, quoteVolume]
  // Bitget API usually returns array of strings/numbers
  [index: number]: string | number;
}

// Order Types
export interface BitgetOrder {
  orderId: string;
  clientOid?: string;
  instId: string; // Symbol
  price: string;
  size: string; // Amount/Qty
  side: string; // buy, sell
  orderType: string; // limit, market
  force: string; // normal, gtc, ioc, fok
  status: string; // new, partial_fill, full_fill, cancelled
  fillPrice?: string;
  fillSize?: string; // Executed qty
  accFillSize?: string;
  averagePrice?: string;
  cTime: string; // Creation time (epoch ms)
  uTime?: string;
  fee?: string;
  // Others
  leverage?: string;
  marginMode?: string; // crossed, isolated
  reduceOnly?: boolean;
}

export interface BitgetOrderPayload {
  symbol: string;
  side: string; // buy, sell
  orderType: string; // limit, market
  force: string; // normal, gtc, ioc, fok
  price?: string;
  size: string; // quantity
  clientOid?: string;
  reduceOnly?: boolean;
  presetStopSurplusPrice?: string; // TP
  presetStopLossPrice?: string; // SL
}
