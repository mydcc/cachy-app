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
  [key: string]: unknown; // Allow other pagination fields
}

// `NormalizedOrder` and `NormalizedPosition` moved to `types/exchange.ts` in
// FEAT-0016 — they are what both exchanges normalise *into*, so they no longer
// live under one venue's name. This file keeps only Bitunix wire shapes.

export interface BitunixOrderPayload {
  symbol: string;
  side: string;
  /**
   * `orderType`, not `type` — this object is serialised straight onto the
   * wire, and place_order documents the field as `orderType` and requires it
   * (docs/bitunix-api/07_trade.md:584). Sending `type` meant no order type
   * reached the exchange at all; see BUG-0219.
   */
  orderType: string;
  qty: string | number;
  price?: string | number;
  reduceOnly?: boolean;
  leverage?: string | number;
  // HEDGE-mode-only (docs/bitunix-api/07_trade.md:583-584) — see BUG-0062.
  tradeSide?: "OPEN" | "CLOSE";
  positionId?: string;
  // FEAT-0069 — 07_trade.md:586-596.
  effect?: "IOC" | "FOK" | "GTC" | "POST_ONLY";
  clientId?: string;
  tpPrice?: string | number;
  tpStopType?: "MARK_PRICE" | "LAST_PRICE";
  tpOrderType?: "LIMIT" | "MARKET";
  tpOrderPrice?: string | number;
  slPrice?: string | number;
  slStopType?: "MARK_PRICE" | "LAST_PRICE";
  slOrderType?: "LIMIT" | "MARKET";
  slOrderPrice?: string | number;
  [key: string]: unknown;
}

// WebSocket Types
export interface BitunixWSMessage {
  op?: string;
  code?: number | string;
  msg?: string;
  ch?: string; // Channel
  topic?: string; // Channel alias (Bitunix v2)
  symbol?: string;
  // Generic data payload depending on channel — kept `any` rather than `unknown`
  // since `bitunixWs.ts`'s handleMessage() reads named fields off it directly
  // (e.g. `message.data.symbol`) before its own per-channel schema validation
  // narrows it further; that file has its own extensive documentation of the
  // reachability subtleties here, so narrowing this declaration alone would
  // just push the same `any` onto several call sites without fixing anything.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
  pong?: number;
  event?: string; // e.g. "login"
  ts?: number; // Timestamp from root message
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
