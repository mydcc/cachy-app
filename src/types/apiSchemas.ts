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

// Bitunix Ticker Schema
export const BitunixTickerSchema = z.object({
  symbol: z.string(),
  lastPrice: StrictDecimal,
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
