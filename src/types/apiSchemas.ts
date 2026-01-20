/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { z } from 'zod';

/**
 * Zod-Schemas für API-Response-Validierung
 */

// Bitunix Ticker Schema
export const BitunixTickerSchema = z.object({
    symbol: z.string(),
    lastPrice: z.union([z.string(), z.number()]),
    open: z.union([z.string(), z.number()]).optional(),
    high: z.union([z.string(), z.number()]).optional(),
    low: z.union([z.string(), z.number()]).optional(),
    baseVol: z.union([z.string(), z.number()]).optional(),
    quoteVol: z.union([z.string(), z.number()]).optional(),
});

export const BitunixTickerResponseSchema = z.object({
    code: z.union([z.number(), z.string()]),
    msg: z.string().optional(),
    data: z.array(BitunixTickerSchema).optional(),
});

// Bitunix Kline Schema
export const BitunixKlineSchema = z.object({
    open: z.union([z.string(), z.number()]),
    high: z.union([z.string(), z.number()]),
    low: z.union([z.string(), z.number()]),
    close: z.union([z.string(), z.number()]),
    vol: z.union([z.string(), z.number()]).optional(),
    timestamp: z.number().optional(),
    time: z.number().optional(),
    ts: z.number().optional(),
});

export const BitunixKlineResponseSchema = z.array(BitunixKlineSchema);

// Binance Ticker Schema
export const BinanceTickerSchema = z.object({
    price: z.union([z.string(), z.number()]).optional(),
    lastPrice: z.union([z.string(), z.number()]).optional(),
    highPrice: z.union([z.string(), z.number()]).optional(),
    lowPrice: z.union([z.string(), z.number()]).optional(),
    volume: z.union([z.string(), z.number()]).optional(),
    quoteVolume: z.union([z.string(), z.number()]).optional(),
    priceChangePercent: z.union([z.string(), z.number()]).optional(),
});

// Binance Kline Schema
export const BinanceKlineSchema = z.tuple([
    z.number(), // Open time
    z.string(), // Open
    z.string(), // High
    z.string(), // Low
    z.string(), // Close
    z.string(), // Volume
    z.number(), // Close time
    z.string(), // Quote asset volume
    z.number(), // Number of trades
    z.string(), // Taker buy base asset volume
    z.string(), // Taker buy quote asset volume
    z.string(), // Ignore
]);

export const BinanceKlineResponseSchema = z.array(BinanceKlineSchema);

/**
 * Validate response size to prevent memory issues
 * @param data Response data as string
 * @param maxSizeMB Maximum allowed size in MB
 * @returns true if size is acceptable
 */
export function validateResponseSize(data: string, maxSizeMB: number = 10): boolean {
    const sizeBytes = new Blob([data]).size;
    const sizeMB = sizeBytes / (1024 * 1024);

    if (sizeMB > maxSizeMB) {
        console.error(`[API] Response too large: ${sizeMB.toFixed(2)}MB (max: ${maxSizeMB}MB)`);
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
export function sanitizeErrorMessage(message: string, maxLength: number = 100): string {
    // Remove potential sensitive data patterns
    let sanitized = message
        .replace(/api[_-]?key[=:]\s*[\w-]+/gi, 'api_key=***')
        .replace(/secret[=:]\s*[\w-]+/gi, 'secret=***')
        .replace(/token[=:]\s*[\w-]+/gi, 'token=***')
        .replace(/password[=:]\s*[\w-]+/gi, 'password=***');

    // Limit length
    if (sanitized.length > maxLength) {
        sanitized = sanitized.slice(0, maxLength) + '...';
    }

    return sanitized;
}
