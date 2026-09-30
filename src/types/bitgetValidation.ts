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
 * Money boundary (BUG-0425): same contract as MoneyLike in apiSchemas —
 * financial values leave the schema as strings so downstream `new Decimal()`
 * stays exact. Timestamps never go through here.
 */
const MoneyString = z.union([z.string(), z.number()]).transform((v) => String(v));

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
  action: z.string().optional(),
  arg: BitgetWSArgSchema.optional(),
  data: z.array(z.any()).optional(),
  ts: z.number().optional(),
  event: z.string().optional(),
  // BUG-0581: the vendor sends the login code as "0", 0, or "00000"
  // depending on the source — accept string and number, normalize at use.
  code: z.union([z.string(), z.number()]).optional(),
}).refine(
  (msg) => msg.action || msg.event,
  "Message must have either 'action' or 'event' field"
);

/**
 * Schema for Bitget Ticker Data (WS)
 *
 * BUG-0598. The V2 ticker renamed the fields this schema was written against:
 * `last` became `lastPr`, `bestAsk`/`bestBid` became `askPr`/`bidPr`, and the
 * `volume24h`/`usdtVolume` aliases are gone in favour of `baseVolume` and
 * `quoteVolume`. Accepting only the V1 spellings made every V2 push fail
 * validation, so a live socket updated nothing at all.
 *
 * Both spellings stay accepted on purpose. The V1 names are the only ones a
 * socket that has not yet finished reconnecting can still deliver, and a
 * half-migrated transport should show a stale price rather than a blank chart.
 * `lastPrice` resolution happens at the call site, not here — this describes the
 * vendor payload, not our internal ticker.
 */
export const BitgetWSTickerSchema = z.object({
  instId: z.string(),
  // V1 name. Optional so a V2 push parses; the refine below keeps a ticker
  // without any last price from reaching the store.
  last: z.string().optional(),
  // V2 name.
  lastPr: z.string().optional(),
  bestAsk: z.string().optional(),
  bestBid: z.string().optional(),
  askPr: z.string().optional(),
  bidPr: z.string().optional(),
  high24h: z.string().optional(),
  low24h: z.string().optional(),
  volume24h: z.string().optional(), // V1 base volume
  baseVolume: z.string().optional(), // V2 base volume
  quoteVolume: z.string().optional(),
  usdtVolume: z.string().optional(), // V1 alias
  open24h: z.string().optional(),
  // V2 sends this as a fraction of the open, not a percentage. The vendor does
  // not document the unit, and REST has been observed speaking fractions, so
  // `priceChangePercent` is derived from `lastPr` and `open24h` instead of read
  // off this field.
  change24h: z.string().optional(),
  markPrice: z.string().optional(),
  indexPrice: z.string().optional(),
  ts: z.union([z.string(), z.number()]).optional(),
  fundingRate: MoneyString.optional(),
  nextFundingTime: z.union([z.string(), z.number()]).optional(),
}).refine(
  (t) => t.last !== undefined || t.lastPr !== undefined,
  "Ticker must carry a last price (lastPr on V2, last on V1)",
);

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
