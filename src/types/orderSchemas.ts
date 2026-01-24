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
 * Common regex for validating numeric strings
 * Allows integers and decimals, positive or negative
 */
const numericStringRegex = /^-?\d+(\.\d+)?$/;

const NumericString = z.union([z.number(), z.string()])
  .refine((val) => {
    if (typeof val === "number") return !isNaN(val) && isFinite(val);
    return numericStringRegex.test(val);
  }, { message: "Must be a valid number" })
  .transform((val) => String(val)); // Normalize to string for API

const PositiveNumericString = z.union([z.number(), z.string()])
  .refine((val) => {
    const num = parseFloat(String(val));
    return !isNaN(num) && num > 0;
  }, { message: "Must be a positive number" })
  .transform((val) => String(val));

const ExchangeEnum = z.enum(["bitunix", "bitget"]);

// --- Base Request ---
export const BaseRequestSchema = z.object({
  exchange: ExchangeEnum,
  apiKey: z.string().min(1),
  apiSecret: z.string().min(1),
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
});

// --- Close Position ---
export const ClosePositionSchema = BaseRequestSchema.extend({
  type: z.literal("close-position"),
  symbol: z.string().min(1),
  side: z.string().transform(s => s.toUpperCase()).refine(s => ["BUY", "SELL"].includes(s), { message: "Side must be BUY or SELL" }),
  amount: PositiveNumericString, // quantity to close
  marginCoin: z.string().optional().default("USDT"), // For Bitget
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
  HistorySchema,
  PendingSchema
]);

export type PlaceOrderPayload = z.infer<typeof PlaceOrderSchema>;
export type ClosePositionPayload = z.infer<typeof ClosePositionSchema>;
export type OrderRequestPayload = z.infer<typeof OrderRequestSchema>;
