/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { z } from "zod";

// Zod-Schemas für WebSocket-Messages

/**
 * Schema for Bitunix Price Data
 */
export const BitunixPriceDataSchema = z.object({
  mp: z.union([z.string(), z.number()]).optional(), // Mark Price
  ip: z.union([z.string(), z.number()]).optional(), // Index Price
  fr: z.union([z.string(), z.number()]).optional(), // Funding Rate
  nft: z.union([z.string(), z.number()]).optional(), // Next Funding Time
});

/**
 * Strict Schema for Bitunix Price Data (Hardening Phase)
 * Enforces string conversion for all numeric fields
 */
const SafeString = z.union([z.string(), z.number(), z.null()])
  .transform((val) => (val === null ? undefined : String(val)));

export const StrictPriceDataSchema = z.object({
  mp: SafeString.optional(), // Mark Price
  ip: SafeString.optional(), // Index Price
  fr: SafeString.optional(), // Funding Rate
  nft: SafeString.optional(), // Next Funding Time
  lastPrice: SafeString.optional(),
  lp: SafeString.optional(),
  la: SafeString.optional(),
}).passthrough();

/**
 * Schema for Bitunix Ticker Data
 */
export const BitunixTickerDataSchema = z.object({
  la: z.union([z.string(), z.number()]).optional(), // Last Price
  o: z.union([z.string(), z.number()]).optional(), // Open
  h: z.union([z.string(), z.number()]).optional(), // High
  l: z.union([z.string(), z.number()]).optional(), // Low
  b: z.union([z.string(), z.number()]).optional(), // Base Volume
  q: z.union([z.string(), z.number()]).optional(), // Quote Volume
  r: z.union([z.string(), z.number()]).optional(), // Change Rate
});

/**
 * Strict Schema for Ticker Data
 */
export const StrictTickerDataSchema = z.object({
  lastPrice: SafeString.optional(),
  close: SafeString.optional(),
  volume: SafeString.optional(),
  quoteVolume: SafeString.optional(),
  high: SafeString.optional(),
  low: SafeString.optional(),
  priceChangePercent: SafeString.optional(),
  // Aliases
  la: SafeString.optional(),
  o: SafeString.optional(),
  h: SafeString.optional(),
  l: SafeString.optional(),
  b: SafeString.optional(),
  q: SafeString.optional(),
  v: SafeString.optional(),
  r: SafeString.optional(),
}).passthrough();

/**
 * Strict Schema for Depth Data
 */
export const StrictDepthDataSchema = z.object({
  b: z.array(z.array(SafeString)), // Bids [price, qty]
  a: z.array(z.array(SafeString)), // Asks [price, qty]
}).passthrough();

/**
 * Schema for Bitunix Order Data
 * Strictly enforces orderId as string to prevent precision loss
 */
export const BitunixOrderSchema = z.object({
  orderId: z.string(), // Strict string required
  symbol: z.string(),
  side: z.string().optional(),
  type: z.string().optional(),
  orderStatus: z.string(),
  price: z.union([z.string(), z.number()]).optional(),
  qty: z.union([z.string(), z.number()]).optional(),
  amount: z.union([z.string(), z.number()]).optional(),
  dealAmount: z.union([z.string(), z.number()]).optional(),
  ctime: z.union([z.string(), z.number()]).optional(),
}).passthrough(); // Allow other fields

/**
 * Schema for Bitunix Position Data
 */
export const BitunixPositionSchema = z.object({
  symbol: z.string(),
  side: z.string().optional(),
  positionSide: z.string().optional(),
  holdSide: z.string().optional(),
  qty: z.union([z.string(), z.number()]).optional(),
  size: z.union([z.string(), z.number()]).optional(),
  amount: z.union([z.string(), z.number()]).optional(),
  averagePrice: z.union([z.string(), z.number()]).optional(),
  avgOpenPrice: z.union([z.string(), z.number()]).optional(),
  entryPrice: z.union([z.string(), z.number()]).optional(),
  unrealizedPNL: z.union([z.string(), z.number()]).optional(),
  unrealizedPnl: z.union([z.string(), z.number()]).optional(),
  leverage: z.union([z.string(), z.number()]).optional(),
  marginMode: z.string().optional(),
  liquidationPrice: z.union([z.string(), z.number()]).optional(),
  liqPrice: z.union([z.string(), z.number()]).optional(),
  event: z.string().optional(),
}).passthrough();

/**
 * Schema for Bitunix WebSocket Message
 */
export const BitunixWSMessageSchema = z.object({
  event: z.string().optional(),
  code: z.union([z.number(), z.string()]).optional(),
  msg: z.string().optional(),
  op: z.string().optional(),
  pong: z.any().optional(),
  ch: z.string().optional(),
  topic: z.string().optional(),
  symbol: z.string().optional(),
  data: z.any().optional(),
  ts: z.number().optional(),
});

/**
 * Whitelist of allowed channels
 */
export const ALLOWED_CHANNELS = [
  "price",
  "ticker",
  "depth_book5",
  "market_kline_1min",
  "market_kline_5min",
  "market_kline_15min",
  "market_kline_30min",
  "market_kline_60min",
  "market_kline_4h",
  "market_kline_1day",
  "market_kline_1week",
  "market_kline_1month",
  "mark_kline_1day",
  "position",
  "order",
  "wallet",
  "trade",
] as const;

export type AllowedChannel = (typeof ALLOWED_CHANNELS)[number];

/**
 * Check if a channel is in the whitelist
 */
export function isAllowedChannel(ch: string): ch is AllowedChannel {
  return ALLOWED_CHANNELS.includes(ch as AllowedChannel);
}

/**
 * Validate symbol format
 * - Must be string
 * - Length between 3-20 characters
 * - Only uppercase letters and numbers
 */
export function validateSymbol(symbol: unknown): symbol is string {
  if (typeof symbol !== "string") return false;
  if (symbol.length < 3 || symbol.length > 20) return false;
  return /^[A-Z0-9]+$/.test(symbol);
}

/**
 * Sanitize symbol (convert to uppercase, remove special chars)
 */
export function sanitizeSymbol(symbol: string): string {
  return symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
