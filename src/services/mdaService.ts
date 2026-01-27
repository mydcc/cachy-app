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
            // Bitunix often nests data in a .data object OR sends it as flat message
            const d = raw.data || raw;

            return {
                symbol,
                provider,
                // Primary fields and their short aliases (la=last, mp=mark, lp=last)
                lastPrice: d.lastPrice || d.la || d.lp || d.mp || d.ip || "0",
                high: d.highPrice || d.h || "0",
                low: d.lowPrice || d.l || "0",
                // Extended volume checks: b=base, v=vol, q=quote, vol=volume, amount
                volume: d.volume || d.v || d.b || d.vol || d.amount || "0",
                quoteVolume: d.quoteVolume || d.qv || d.q || d.quoteVol || "0",
                priceChangePercent: d.priceChangePercent || d.pc || d.r || "0", // r = rate change
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
                    // Extended volume checks for Klines: v=vol, q=quote (if base missing), vol
                    // IMPORTANT: Bitunix Kline API (REST & WS) swaps Base/Quote volume compared to standard.
                    // 'quoteVol' (q) is often the Quantity (BTC), while 'baseVol' is Turnover (USDT).
                    // We prioritize quoteVol/q here to ensure indicators get the correct quantity.
                    volume: k.quoteVol || k.q || k.volume || k.v || k.vol || k.amount || "0"
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
