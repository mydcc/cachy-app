/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { z } from "zod";

/**
 * Schema for Bitget WebSocket Argument
 */
export const BitgetWSArgSchema = z.object({
  instType: z.string().optional(),
  channel: z.string(),
  instId: z.string(),
});

/**
 * Schema for Bitget WebSocket Message
 */
export const BitgetWSMessageSchema = z.object({
  action: z.string(),
  arg: BitgetWSArgSchema,
  data: z.array(z.any()).optional(),
  ts: z.number().optional(),
});

/**
 * Schema for Bitget Ticker Data (WS)
 */
export const BitgetWSTickerSchema = z.object({
  instId: z.string(),
  last: z.string(),
  bestAsk: z.string().optional(),
  bestBid: z.string().optional(),
  high24h: z.string().optional(),
  low24h: z.string().optional(),
  volume24h: z.string().optional(), // base volume
  baseVolume: z.string().optional(), // alias
  quoteVolume: z.string().optional(),
  usdtVolume: z.string().optional(), // alias
  open24h: z.string().optional(),
  ts: z.union([z.string(), z.number()]).optional(),
});

/**
 * Schema for Bitget Kline Data (WS)
 * Returns [timestamp, open, high, low, close, volume, quoteVolume]
 * But in WS it might be an object or array.
 * For 'candle1m' channel, data is usually:
 * [ [ "167...", "23000", "23100", ... ], ... ]
 */
export const BitgetWSKlineSchema = z.array(z.union([z.string(), z.number()]));

/**
 * Allowed Channels whitelist
 */
export const ALLOWED_BITGET_CHANNELS = [
  "ticker",
  "candle1m",
  "candle5m",
  "candle15m",
  "candle30m",
  "candle1H",
  "candle4H",
  "candle1D",
  "candle1W",
  "books",   // Depth
  "books5",
  "books15",
  "orders",  // Private: Order updates
  "positions", // Private: Position updates
  "account",   // Private: Wallet/Account updates
] as const;

export type AllowedBitgetChannel = (typeof ALLOWED_BITGET_CHANNELS)[number];

export function isAllowedBitgetChannel(ch: string): ch is AllowedBitgetChannel {
  return ALLOWED_BITGET_CHANNELS.includes(ch as AllowedBitgetChannel);
}

/**
 * Validate symbol format for Bitget
 * Expected: e.g. BTCUSDT_UMCBL
 */
export function validateBitgetSymbol(symbol: unknown): symbol is string {
  if (typeof symbol !== "string") return false;
  return /^[A-Z0-9_]+$/.test(symbol);
}
