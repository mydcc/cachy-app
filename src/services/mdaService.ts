/*
 * Copyright (C) 2026 MYDCT
 *
 * Market Data Adapter (MDA) Service
 * Responsible for transforming raw exchange data into a standardized format.
 */

import type { NormalizedTicker, NormalizedKline } from "./mdaTypes";
import { normalizeSymbol } from "../utils/symbolUtils";

export const mdaService = {
    /**
     * Normalizes ticker data into a standard flat object.
     */
    normalizeTicker(raw: any, provider: string): NormalizedTicker {
        const symbol = normalizeSymbol(raw.symbol || raw.s || "", provider);

        // Default mappings for Bitunix (Current Primary)
        if (provider === "bitunix") {
            return {
                symbol,
                provider,
                lastPrice: raw.lastPrice || raw.lp || raw.mp || "0",
                high: raw.highPrice || raw.h || "0",
                low: raw.lowPrice || raw.l || "0",
                volume: raw.volume || raw.v || "0",
                quoteVolume: raw.quoteVolume || raw.qv || "0",
                priceChangePercent: raw.priceChangePercent || raw.pc || "0",
                timestamp: Date.now()
            };
        }

        // Default mappings for Bitget
        if (provider === "bitget") {
            return {
                symbol,
                provider,
                lastPrice: raw.lastPrice || raw.last || "0",
                high: raw.highPrice || raw.high24h || "0",
                low: raw.lowPrice || raw.low24h || "0",
                volume: raw.volume || raw.baseVolume || "0",
                quoteVolume: raw.quoteVolume || raw.quoteVolume || "0",
                priceChangePercent: raw.priceChangePercent || "0",
                timestamp: Date.now()
            };
        }

        // Fallback/Generic
        return {
            symbol,
            provider,
            lastPrice: raw.price || raw.lastPrice || "0",
            timestamp: Date.now()
        };
    },

    /**
     * Normalizes a collection of klines.
     */
    normalizeKlines(raw: any[], provider: string): NormalizedKline[] {
        return raw.map(k => {
            if (provider === "bitunix") {
                return {
                    time: Number(k.time || k.t),
                    open: k.open || k.o || "0",
                    high: k.high || k.h || "0",
                    low: k.low || k.l || "0",
                    close: k.close || k.c || "0",
                    volume: k.volume || k.v || "0"
                };
            }
            // Generic / Bitget
            return {
                time: Number(k[0] || k.time),
                open: k[1] || k.open || "0",
                high: k[2] || k.high || "0",
                low: k[3] || k.low || "0",
                close: k[4] || k.close || "0",
                volume: k[5] || k.volume || "0"
            };
        });
    }
};
