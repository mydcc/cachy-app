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

export interface BitunixResponse<T> {
  code: number | string;
  msg: string;
  data: T;
}

export interface BitunixOrder {
  orderId: string;
  clientId?: string;
  symbol: string;
  type: string; // LIMIT, MARKET, etc.
  side: string; // BUY, SELL
  price?: string;
  qty?: string;
  amount?: string; // Sometimes used interchangeably
  tradeQty?: string; // Filled qty
  status?: string; // NEW, FILLED, CANCELED
  ctime?: number; // Create time
  createTime?: number; // Alias often found in Plan orders
  mtime?: number; // Modify time
  updateTime?: number; // Alias often found in Plan orders
  leverage?: string;
  marginMode?: string;
  positionMode?: string;
  reduceOnly?: boolean;
  fee?: string;
  realizedPNL?: string;
  tpPrice?: string;
  tpStopType?: string;
  tpOrderType?: string;
  slPrice?: string;
  slStopType?: string;
  slOrderType?: string;
  avgPrice?: string;
  averagePrice?: string;
  role?: string; // MAKER, TAKER
}

export interface BitunixOrderListWrapper {
  orderList: BitunixOrder[];
  [key: string]: any; // Allow other pagination fields
}

export interface BitunixPosition {
  positionId: string;
  symbol: string;
  side: string; // LONG, SHORT
  positionSide?: string;
  holdSide?: string;
  marginCoin?: string;
  marginMode?: string;
  leverage?: string;
  qty: string;
  available?: string;
  frozen?: string;
  avgOpenPrice?: string;
  averagePrice?: string;
  entryPrice?: string;
  maintMargin?: string;
  realizedPNL?: string;
  unrealizedPNL?: string;
  liquidationPrice?: string;
  ctime?: number;
  uTime?: number;
}

// Normalized Internal Order Interface
export interface NormalizedOrder {
  id: string;
  orderId: string;
  clientId?: string;
  symbol: string;
  type: string;
  side: string;
  price: number;
  priceStr: string; // High-precision string
  amount: number;
  amountStr: string; // High-precision string
  filled: number;
  filledStr: string; // High-precision string
  status: string;
  time: number;
  mtime?: number;
  leverage?: string;
  marginMode?: string;
  positionMode?: string;
  reduceOnly?: boolean;
  fee: number;
  feeStr: string; // High-precision string
  realizedPNL: number;
  realizedPNLStr: string; // High-precision string
  tpPrice?: string;
  tpStopType?: string;
  tpOrderType?: string;
  slPrice?: string;
  slStopType?: string;
  slOrderType?: string;
  avgPrice?: number;
  avgPriceStr?: string; // High-precision string
  role?: string;
}

export interface BitunixOrderPayload {
  symbol: string;
  side: string;
  type: string;
  qty: string | number;
  price?: string | number;
  reduceOnly?: boolean;
  leverage?: string | number;
  [key: string]: any;
}

// WebSocket Types
export interface BitunixWSMessage {
  op?: string;
  code?: number | string;
  msg?: string;
  ch?: string; // Channel
  symbol?: string;
  data?: any; // Generic data payload depending on channel
  pong?: number;
  event?: string; // e.g. "login"
}

export interface BitunixPriceData {
  mp: string; // Market Price
  ip: string; // Index Price
  fr: string; // Funding Rate
  nft: number; // Next Funding Time
}

export interface BitunixTickerData {
  la: string; // Last
  h: string; // High
  l: string; // Low
  b: string; // Vol
  q: string; // Quote Vol
  r: string; // Change
  o: string; // Open
}
