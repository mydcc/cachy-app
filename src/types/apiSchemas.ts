/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { z } from "zod";
import { StrictDecimal } from "./schemas";

/**
 * Zod-Schemas für API-Response-Validierung
 */

const StrictPositiveDecimal = StrictDecimal.refine((val) => val.gt(0), {
    message: "Value must be positive"
});

// Bitunix Ticker Schema
export const BitunixTickerSchema = z.object({
  symbol: z.string(),
  lastPrice: StrictPositiveDecimal,
  open: StrictDecimal.optional(),
  high: StrictDecimal.optional(),
  low: StrictDecimal.optional(),
  baseVol: StrictDecimal.optional(),
  quoteVol: StrictDecimal.optional(),
});

export const BitunixTickerResponseSchema = z.object({
  code: z.union([z.number(), z.string()]),
  msg: z.string().optional(),
  data: z.array(BitunixTickerSchema).optional(),
});

// Bitunix Kline Schema
export const BitunixKlineSchema = z.object({
  open: StrictDecimal,
  high: StrictDecimal,
  low: StrictDecimal,
  close: StrictDecimal,
  vol: StrictDecimal.optional(),
  volume: StrictDecimal.optional(),
  timestamp: z.union([z.number(), z.string()]).optional(),
  time: z.union([z.number(), z.string()]).optional(),
  ts: z.union([z.number(), z.string()]).optional(),
});

export const BitunixKlineResponseSchema = z.array(BitunixKlineSchema);

// Bitget Kline Schema
// Format: [timestamp, open, high, low, close, volume, ...]
// Can be string or number
export const BitgetKlineSchema = z.tuple([
  z.union([z.string(), z.number()]), // timestamp
  z.union([z.string(), z.number()]), // open
  z.union([z.string(), z.number()]), // high
  z.union([z.string(), z.number()]), // low
  z.union([z.string(), z.number()]), // close
  z.union([z.string(), z.number()]), // volume
]).rest(z.unknown()); // Allow extra fields

export const BitgetKlineResponseSchema = z.array(BitgetKlineSchema);

// Generic API Response Wrapper
export const ApiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) => z.object({
    code: z.union([z.string(), z.number()]).transform(String),
    msg: z.string().optional(),
    error: z.string().optional(),
    data: dataSchema.optional().nullable()
});

// Position Schema (Bitunix & Generic)
export const PositionRawSchema = z.object({
    symbol: z.string(),
    // Allow flexibility in field names (Bitunix vs Bitget vs Others)
    // We map them to canonical fields later, but here we define what we expect from raw JSON
    side: z.string().optional(),
    positionSide: z.string().optional(),
    holdSide: z.string().optional(),

    // Amount fields
    qty: z.union([z.string(), z.number()]).optional(),
    size: z.union([z.string(), z.number()]).optional(),
    amount: z.union([z.string(), z.number()]).optional(),

    // Price fields
    avgOpenPrice: z.union([z.string(), z.number()]).optional(),
    entryPrice: z.union([z.string(), z.number()]).optional(),

    // PnL
    unrealizedPNL: z.union([z.string(), z.number()]).optional(),
    unrealizedPnl: z.union([z.string(), z.number()]).optional(),

    leverage: z.union([z.string(), z.number()]).optional(),
    marginMode: z.string().optional(),
    liquidationPrice: z.union([z.string(), z.number()]).optional(),
    liqPrice: z.union([z.string(), z.number()]).optional()
}).refine(data => {
    // Hardening: A position must have at least one quantity field to be valid.
    // Otherwise it's likely a malformed response or an empty object from a weird API state.
    return (data.qty !== undefined || data.size !== undefined || data.amount !== undefined);
}, {
    message: "Position object missing quantity field (qty, size, or amount)",
    path: ["qty"]
});

export const PositionListSchema = z.array(PositionRawSchema);

// Type inference
export type PositionRaw = z.infer<typeof PositionRawSchema>;

// TP/SL Request Schema for API Hardening
export const TpSlRequestSchema = z.object({
  exchange: z.literal("bitunix"),
  apiKey: z.string().min(10),
  apiSecret: z.string().min(10),
  action: z.enum(["pending", "history", "cancel", "modify"]),
  params: z.object({
    symbol: z.string().optional(),
    triggerPrice: z.union([z.string(), z.number()]).optional(),
    qty: z.union([z.string(), z.number()]).optional(),
    planType: z.enum(["PROFIT", "LOSS"]).optional(),
    orderId: z.string().optional(),
    planId: z.string().optional()
  }).optional()
});

/**
 * Validate response size to prevent memory issues
 * @param data Response data as string
 * @param maxSizeMB Maximum allowed size in MB
 * @returns true if size is acceptable
 */
export function validateResponseSize(
  data: string,
  maxSizeMB: number = 10,
): boolean {
  const sizeBytes = new Blob([data]).size;
  const sizeMB = sizeBytes / (1024 * 1024);

  if (sizeMB > maxSizeMB) {
    console.error(
      `[API] Response too large: ${sizeMB.toFixed(2)}MB (max: ${maxSizeMB}MB)`,
    );
    return false;
  }

  return true;
}

/**
 * Sanitize error message for logging (remove sensitive data, limit length)
 * @param message Error message
 * @param maxLength Maximum length
 * @returns Sanitized message
 */
export function sanitizeErrorMessage(
  message: string,
  maxLength: number = 100,
): string {
  // Remove potential sensitive data patterns
  let sanitized = message
    .replace(/api[_-]?key[=:]\s*[\w-]+/gi, "api_key=***")
    .replace(/secret[=:]\s*[\w-]+/gi, "secret=***")
    .replace(/token[=:]\s*[\w-]+/gi, "token=***")
    .replace(/password[=:]\s*[\w-]+/gi, "password=***")
    .replace(/passphrase[=:]\s*[\w-]+/gi, "passphrase=***");

  // Limit length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength) + "...";
  }

  return sanitized;
}
