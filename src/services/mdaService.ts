/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

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
    normalizeTicker(raw: any, provider: string): NormalizedTicker | null {
        // Robust symbol extraction: check root fields, then data object fields
        const rawSymbol = raw.symbol || raw.s || (raw.data && (raw.data.symbol || raw.data.s)) || "";
        const symbol = normalizeSymbol(rawSymbol, provider);

        // Default mappings for Bitunix (Current Primary)
        if (provider === "bitunix") {
            // Bitunix often nests data in a .data object OR sends it as flat message
            const d = raw.data || raw;

            // HARDENING: Check critical fields. If lastPrice is missing, data is invalid.
            const lp = d.lastPrice || d.la || d.lp || d.mp || d.ip;
            if (lp === undefined || lp === null || lp === "") return null;

            return {
                symbol,
                provider,
                // Primary fields and their short aliases (la=last, mp=mark, lp=last)
                // HARDENING: Force String conversion to ensure Decimal safety downstream
                lastPrice: String(lp),
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
            const lp = raw.lastPrice || raw.last;
            if (lp === undefined || lp === null || lp === "") return null;

            return {
                symbol,
                provider,
                lastPrice: String(lp),
                high: String(raw.highPrice || raw.high24h || "0"),
                low: String(raw.lowPrice || raw.low24h || "0"),
                volume: String(raw.volume || raw.baseVolume || "0"),
                quoteVolume: String(raw.quoteVolume || raw.quoteVolume || "0"),
                priceChangePercent: String(raw.priceChangePercent || "0"),
                timestamp: Date.now()
            };
        }

        // Fallback/Generic
        const genericLp = raw.price || raw.lastPrice;
        if (genericLp === undefined || genericLp === null) return null;

        return {
            symbol,
            provider,
            lastPrice: String(genericLp),
            timestamp: Date.now()
        };
    },

    /**
     * Normalizes a collection of klines.
     */
    normalizeKlines(raw: any[], provider: string): NormalizedKline[] {
        return raw.map(k => {
            if (provider === "bitunix") {
                const open = k.open || k.o;
                const close = k.close || k.c;
                // Invalid candle check
                if (open === undefined || close === undefined) return null;

                return {
                    time: Number(k.time || k.t || k.ts || k.timestamp),
                    open: open,
                    high: k.high || k.h || open, // Fallback to open if high missing? Or strict?
                    low: k.low || k.l || open,
                    close: close,
                    // Extended volume checks for Klines: v=vol, q=quote (if base missing), vol
                    // IMPORTANT: Bitunix Kline API (REST & WS) swaps Base/Quote volume compared to standard.
                    // 'quoteVol' (q) is often the Quantity (BTC), while 'baseVol' is Turnover (USDT).
                    // We prioritize quoteVol/q here to ensure indicators get the correct quantity.
                    volume: k.quoteVol || k.q || k.volume || k.v || k.vol || k.amount || "0"
                };
            }
            // Generic / Bitget
            const open = k[1] || k.open;
            const close = k[4] || k.close;
            if (open === undefined || close === undefined) return null;

            return {
                time: Number(k[0] || k.time),
                open: open,
                high: k[2] || k.high || open,
                low: k[3] || k.low || open,
                close: close,
                volume: k[5] || k.volume || "0"
            };
        }).filter((k): k is NormalizedKline => k !== null);
    }
};
