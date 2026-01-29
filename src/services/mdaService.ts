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
                // HARDENING: Force String conversion to ensure Decimal safety downstream
                lastPrice: String(d.lastPrice || d.la || d.lp || d.mp || d.ip || "0"),
                high: String(d.highPrice || d.h || "0"),
                low: String(d.lowPrice || d.l || "0"),
                // Extended volume checks: b=base, v=vol, q=quote, vol=volume, amount
                volume: String(d.volume || d.v || d.b || d.vol || d.amount || "0"),
                quoteVolume: String(d.quoteVolume || d.qv || d.q || d.quoteVol || "0"),
                priceChangePercent: String(d.priceChangePercent || d.pc || d.r || "0"), // r = rate change
                timestamp: Date.now()
            };
        }

        // Default mappings for Bitget
        if (provider === "bitget") {
            return {
                symbol,
                provider,
                lastPrice: String(raw.lastPrice || raw.last || "0"),
                high: String(raw.highPrice || raw.high24h || "0"),
                low: String(raw.lowPrice || raw.low24h || "0"),
                volume: String(raw.volume || raw.baseVolume || "0"),
                quoteVolume: String(raw.quoteVolume || raw.quoteVolume || "0"),
                priceChangePercent: String(raw.priceChangePercent || "0"),
                timestamp: Date.now()
            };
        }

        // Fallback/Generic
        return {
            symbol,
            provider,
            lastPrice: String(raw.price || raw.lastPrice || "0"),
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
