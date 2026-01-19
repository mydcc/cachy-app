/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { Decimal } from "decimal.js";
import { browser } from "$app/environment";

export interface MarketData {
    symbol: string;
    lastPrice: Decimal | null;
    indexPrice: Decimal | null;
    fundingRate: Decimal | null;
    nextFundingTime: number | null; // Unix timestamp in ms
    depth?: {
        bids: [string, string][]; // [price, qty]
        asks: [string, string][];
    };
    highPrice?: Decimal | null;
    lowPrice?: Decimal | null;
    volume?: Decimal | null;
    quoteVolume?: Decimal | null;
    priceChangePercent?: Decimal | null;
    klines: Record<
        string,
        {
            open: Decimal;
            high: Decimal;
            low: Decimal;
            close: Decimal;
            volume: Decimal;
            time: number;
        }
    >;
}

export type WSStatus =
    | "disconnected"
    | "connecting"
    | "connected"
    | "error"
    | "reconnecting";

// LRU Cache Configuration
const MAX_CACHE_SIZE = 600;
const TTL_MS = 10 * 60 * 1000; // 10 minutes

interface CacheMetadata {
    lastAccessed: number;
    createdAt: number;
}

class MarketManager {
    data = $state<Record<string, MarketData>>({});
    connectionStatus = $state<WSStatus>("disconnected");

    private cacheMetadata = new Map<string, CacheMetadata>();
    private cleanupIntervalId: any = null;

    constructor() {
        if (browser) {
            this.cleanupIntervalId = setInterval(() => {
                this.cleanup();
            }, 60 * 1000);
        }
    }

    // Helper: Touch symbol to update LRU
    private touchSymbol(symbol: string) {
        const now = Date.now();
        const existing = this.cacheMetadata.get(symbol);
        this.cacheMetadata.set(symbol, {
            lastAccessed: now,
            createdAt: existing?.createdAt || now,
        });
    }

    // Helper: Evict LRU symbol
    private evictLRU(): string | null {
        if (this.cacheMetadata.size === 0) return null;

        // Find oldest by lastAccessed
        let oldest: string | null = null;
        let oldestTime = Infinity;

        this.cacheMetadata.forEach((meta, symbol) => {
            if (meta.lastAccessed < oldestTime) {
                oldestTime = meta.lastAccessed;
                oldest = symbol;
            }
        });

        if (oldest) {
            this.cacheMetadata.delete(oldest);
            return oldest;
        }
        return null;
    }

    // Helper: Enforce cache size limit
    private enforceCacheLimit() {
        const keys = Object.keys(this.data);
        if (keys.length <= MAX_CACHE_SIZE) return;

        // Clone to avoid mutation issues during iteration if needed, 
        // but here we just need to delete from the proxy
        while (Object.keys(this.data).length > MAX_CACHE_SIZE) {
            const toEvict = this.evictLRU();
            if (!toEvict) break;
            delete this.data[toEvict];
        }
    }

    updatePrice(
        symbol: string,
        data: {
            price: string;
            indexPrice: string;
            fundingRate: string;
            nextFundingTime: string;
        }
    ) {
        this.touchSymbol(symbol);

        const current = this.data[symbol] || {
            symbol,
            lastPrice: null,
            indexPrice: null,
            fundingRate: null,
            nextFundingTime: null,
            klines: {},
        };

        // Bitunix timestamps often come as strings, ensure conversion if needed
        let nft = 0;
        if (data.nextFundingTime) {
            if (/^\d+$/.test(data.nextFundingTime)) {
                nft = parseInt(data.nextFundingTime, 10);
            } else {
                nft = new Date(data.nextFundingTime).getTime();
            }
        }

        this.data[symbol] = {
            ...current,
            lastPrice: new Decimal(data.price),
            indexPrice: new Decimal(data.indexPrice),
            fundingRate: new Decimal(data.fundingRate),
            nextFundingTime: nft,
        };

        this.enforceCacheLimit();
    }

    updateTicker(
        symbol: string,
        data: {
            lastPrice: string;
            high: string;
            low: string;
            vol: string;
            quoteVol: string;
            change: string;
            open: string;
        }
    ) {
        this.touchSymbol(symbol);

        const current = this.data[symbol] || {
            symbol,
            lastPrice: null,
            indexPrice: null,
            fundingRate: null,
            nextFundingTime: null,
            klines: {},
        };

        const last = new Decimal(data.lastPrice);
        const open = new Decimal(data.open);
        let pct = new Decimal(0);
        if (!open.isZero()) {
            pct = last.minus(open).div(open).times(100);
        }

        this.data[symbol] = {
            ...current,
            lastPrice: last,
            highPrice: new Decimal(data.high),
            lowPrice: new Decimal(data.low),
            volume: new Decimal(data.vol),
            quoteVolume: new Decimal(data.quoteVol),
            priceChangePercent: pct,
        };

        this.enforceCacheLimit();
    }

    updateDepth(symbol: string, data: { bids: any[]; asks: any[] }) {
        this.touchSymbol(symbol);

        const current = this.data[symbol] || {
            symbol,
            lastPrice: null,
            indexPrice: null,
            fundingRate: null,
            nextFundingTime: null,
            klines: {},
        };

        this.data[symbol] = {
            ...current,
            depth: {
                bids: data.bids,
                asks: data.asks,
            },
        };

        this.enforceCacheLimit();
    }

    updateKline(
        symbol: string,
        timeframe: string,
        data: {
            o: string;
            h: string;
            l: string;
            c: string;
            b: string;
            t: number;
        }
    ) {
        this.touchSymbol(symbol);

        const current = this.data[symbol] || {
            symbol,
            lastPrice: null,
            indexPrice: null,
            fundingRate: null,
            nextFundingTime: null,
            klines: {},
        };

        this.data[symbol] = {
            ...current,
            klines: {
                ...current.klines,
                [timeframe]: {
                    open: new Decimal(data.o),
                    high: new Decimal(data.h),
                    low: new Decimal(data.l),
                    close: new Decimal(data.c),
                    volume: new Decimal(data.b),
                    time: data.t,
                },
            },
        };

        this.enforceCacheLimit();
    }

    reset() {
        this.cacheMetadata.clear();
        this.data = {};
    }

    cleanup() {
        const now = Date.now();
        const stale: string[] = [];

        this.cacheMetadata.forEach((meta, symbol) => {
            if (now - meta.lastAccessed > TTL_MS) {
                stale.push(symbol);
            }
        });

        stale.forEach((symbol) => {
            this.cacheMetadata.delete(symbol);
            delete this.data[symbol];
        });
    }

    // Compatibility for legacy subscribers (if any remain during migration)
    subscribe(fn: (value: Record<string, MarketData>) => void) {
        fn(this.data);
        return $effect.root(() => {
            $effect(() => {
                fn(this.data);
            });
        });
    }

    subscribeStatus(fn: (value: WSStatus) => void) {
        fn(this.connectionStatus);
        return $effect.root(() => {
            $effect(() => {
                fn(this.connectionStatus);
            });
        });
    }
}

export const marketState = new MarketManager();
