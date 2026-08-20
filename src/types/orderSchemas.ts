/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { z } from "zod";
import { Decimal } from "decimal.js";

/**
 * Serializes a Decimal to a plain string for exchange API payloads.
 *
 * Exchange APIs (Bitunix, Bitget) reject scientific notation such as "1e-7",
 * which `Decimal.toString()` emits for values with exponent <= -7. Using
 * `toFixed(decimalPlaces())` preserves the full decimal representation for
 * low-priced assets (e.g. PEPE) without introducing artificial trailing
 * zeros for whole numbers.
 */
function serializeDecimal(val: string | number): string {
  const d = new Decimal(val);
  return d.toFixed(d.decimalPlaces() ?? 0);
}

const NumericString = z.union([z.number(), z.string()])
  .refine((val) => {
    try {
      const d = new Decimal(val);
      return d.isFinite() && !d.isNaN();
    } catch {
      return false;
    }
  }, { message: "Must be a valid number" })
  .transform(serializeDecimal); // Normalize to string for API (avoid scientific notation)

const PositiveNumericString = z.union([z.number(), z.string()])
  .refine((val) => {
    try {
      const num = new Decimal(val);
      return num.isFinite() && !num.isNaN() && num.gt(0);
    } catch {
      return false;
    }
  }, { message: "Must be a positive number" })
  .transform(serializeDecimal);

const ExchangeEnum = z.enum(["bitunix", "bitget"]);

// --- Base Request ---
export const BaseRequestSchema = z.object({
  exchange: ExchangeEnum,
  apiKey: z.string().optional(),
  apiSecret: z.string().optional(),
  passphrase: z.string().optional(), // Required for Bitget
});

// --- Place Order ---
export const PlaceOrderSchema = BaseRequestSchema.extend({
  type: z.literal("place-order"),
  symbol: z.string().min(1),
  side: z.string().transform(s => s.toUpperCase()).refine(s => ["BUY", "SELL"].includes(s), { message: "Side must be BUY or SELL" }),
  orderType: z.enum([
    "LIMIT", "MARKET", "STOP_LIMIT", "STOP_MARKET",
    "TAKE_PROFIT_LIMIT", "TAKE_PROFIT_MARKET"
  ]).transform(s => s.toUpperCase()).optional().default("MARKET"), // Mapped from 'type' in body manually usually
  qty: PositiveNumericString,
  price: NumericString.optional(),
  triggerPrice: NumericString.optional(), // alias for stopPrice in some contexts
  stopPrice: NumericString.optional(),
  reduceOnly: z.union([z.boolean(), z.string(), z.number()])
    .transform(val => {
      if (val === true || val === "true" || val === 1 || val === "1") return true;
      return false;
    }).optional().default(false),
  marginCoin: z.string().optional().default("USDT"), // For Bitget
  // HEDGE-mode-only fields (docs/bitunix-api/07_trade.md:583-584): tradeSide
  // is required to disambiguate OPEN vs CLOSE when a symbol can carry both a
  // long and a short position at once; positionId is then required too, to
  // say which one. Omitted entirely for ONE_WAY accounts — see BUG-0062.
  tradeSide: z.enum(["OPEN", "CLOSE"]).optional(),
  positionId: z.string().optional(),

  // --- FEAT-0069 -----------------------------------------------------------
  // Fields place_order accepts (docs/bitunix-api/07_trade.md:577-596) that
  // Cachy did not send. Each closes a concrete gap rather than adding
  // coverage for its own sake.

  /**
   * Time in force. Documented as required for LIMIT and meaningless for
   * MARKET, so the route omits it on a market order rather than sending a
   * value the exchange will ignore.
   */
  effect: z.enum(["IOC", "FOK", "GTC", "POST_ONLY"]).optional(),

  /**
   * Cachy-generated identifier for one submission attempt. Without it a
   * retry after an ambiguous response can double an order, and there is no
   * way to tie a WS confirmation back to the attempt that caused it.
   */
  clientId: z.string().min(1).max(64).optional(),

  // TP/SL attached at entry. Sending these with the order is the difference
  // between a position that is protected from its first tick and one that is
  // unprotected until a second request succeeds.
  tpPrice: PositiveNumericString.optional(),
  tpStopType: z.enum(["MARK_PRICE", "LAST_PRICE"]).optional(),
  tpOrderType: z.enum(["LIMIT", "MARKET"]).optional(),
  tpOrderPrice: PositiveNumericString.optional(),
  slPrice: PositiveNumericString.optional(),
  slStopType: z.enum(["MARK_PRICE", "LAST_PRICE"]).optional(),
  slOrderType: z.enum(["LIMIT", "MARKET"]).optional(),
  slOrderPrice: PositiveNumericString.optional(),
  // NOTE: the "LIMIT TP/SL needs its order price" rule is deliberately NOT a
  // `.refine()` here. This schema is a member of OrderRequestSchema's
  // discriminated union, and a refined object is a ZodEffects, which
  // z.discriminatedUnion cannot take. The rule lives in placeBitunixOrder
  // instead, next to the existing LIMIT-price validation it belongs with.
});

// --- Close Position ---
export const ClosePositionSchema = BaseRequestSchema.extend({
  type: z.literal("close-position"),
  symbol: z.string().min(1),
  side: z.string().transform(s => s.toUpperCase()).refine(s => ["BUY", "SELL"].includes(s), { message: "Side must be BUY or SELL" }),
  amount: PositiveNumericString, // quantity to close
  marginCoin: z.string().optional().default("USDT"), // For Bitget
});

// --- Close All Positions ---
export const CloseAllPositionsSchema = BaseRequestSchema.extend({
  type: z.literal("close-all-positions"),
  symbol: z.string().optional(), // Optional symbol filter
});

// --- Flash Close Single Position ---
export const FlashClosePositionSchema = BaseRequestSchema.extend({
  type: z.literal("flash-close-position"),
  positionId: z.string().min(1),
  symbol: z.string().optional(),
});

// --- Cancel All ---
export const CancelAllSchema = BaseRequestSchema.extend({
  type: z.literal("cancel-all"),
  symbol: z.string().optional(), // Optional filter
});

// --- Cancel Single Order ---
export const CancelOrderSchema = BaseRequestSchema.extend({
  type: z.literal("cancel-order"),
  symbol: z.string().min(1),
  orderId: z.string().min(1),
  marginCoin: z.string().optional().default("USDT"), // For Bitget
});

// --- Order Detail ---
export const OrderDetailSchema = BaseRequestSchema.extend({
  type: z.literal("order-detail"),
  orderId: z.string().optional(),
  clientId: z.string().optional(),
}).refine(data => !!data.orderId || !!data.clientId, {
  message: "Either orderId or clientId must be provided",
});

// --- Modify Order ---
export const ModifyOrderSchema = BaseRequestSchema.extend({
  type: z.literal("modify-order"),
  orderId: z.string().optional(),
  clientId: z.string().optional(),
  symbol: z.string().optional(),
  qty: PositiveNumericString,
  price: NumericString.optional(),
  tpPrice: NumericString.optional(),
  tpStopType: z.string().optional(),
  tpOrderType: z.string().optional(),
  tpOrderPrice: NumericString.optional(),
  slPrice: NumericString.optional(),
  slStopType: z.string().optional(),
  slOrderType: z.string().optional(),
  slOrderPrice: NumericString.optional(),
}).refine(data => !!data.orderId || !!data.clientId, {
  message: "Either orderId or clientId must be provided",
});

// --- History ---
export const HistorySchema = BaseRequestSchema.extend({
  type: z.literal("history"),
  limit: z.union([z.number(), z.string()])
    .transform(val => {
       const n = Number(val);
       return isNaN(n) ? 50 : Math.min(Math.max(n, 1), 100);
    }).optional().default(50),
  symbol: z.string().optional(), // Optional filter
  // Bitunix's get_history_orders excludes CANCELED orders unless this is
  // true — and then it excludes everything else. There is no single call
  // that returns both, so the client fetches once per value and merges.
  queryCanceled: z.boolean().optional().default(false),
  startTime: z.union([z.number(), z.string()])
    .transform(val => Number(val))
    .refine(val => !isNaN(val) && val >= 0, { message: "Invalid startTime" })
    .optional(),
  endTime: z.union([z.number(), z.string()])
    .transform(val => Number(val))
    .refine(val => !isNaN(val) && val >= 0, { message: "Invalid endTime" })
    .optional(),
});

// --- Pending ---
export const PendingSchema = BaseRequestSchema.extend({
  type: z.literal("pending"),
  symbol: z.string().optional(),
});

// --- Union Schema for the Route ---
// Since the 'type' discriminator is inside the body, Zod Discriminated Union is perfect.
// However, the input body has 'type' as the Action ("place-order"), not the OrderType ("LIMIT").
// So we use z.discriminatedUnion on the "type" field.

export const OrderRequestSchema = z.discriminatedUnion("type", [
  PlaceOrderSchema,
  ClosePositionSchema,
  CloseAllPositionsSchema,
  FlashClosePositionSchema,
  CancelAllSchema,
  CancelOrderSchema,
  OrderDetailSchema,
  ModifyOrderSchema,
  HistorySchema,
  PendingSchema
]);

export type PlaceOrderPayload = z.infer<typeof PlaceOrderSchema>;
export type ClosePositionPayload = z.infer<typeof ClosePositionSchema>;
export type CloseAllPositionsPayload = z.infer<typeof CloseAllPositionsSchema>;
export type FlashClosePositionPayload = z.infer<typeof FlashClosePositionSchema>;
export type CancelAllPayload = z.infer<typeof CancelAllSchema>;
export type CancelOrderPayload = z.infer<typeof CancelOrderSchema>;
export type OrderDetailPayload = z.infer<typeof OrderDetailSchema>;
export type ModifyOrderPayload = z.infer<typeof ModifyOrderSchema>;
export type OrderRequestPayload = z.infer<typeof OrderRequestSchema>;
