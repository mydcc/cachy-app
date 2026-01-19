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

    private getOrCreateSymbol(symbol: string): MarketData {
        if (!this.data[symbol]) {
            this.data[symbol] = {
                symbol,
                lastPrice: null,
                indexPrice: null,
                fundingRate: null,
                nextFundingTime: null,
                klines: {},
            };
        }
        return this.data[symbol];
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

    private enforceCacheLimit() {
        while (Object.keys(this.data).length > MAX_CACHE_SIZE) {
            const toEvict = this.evictLRU();
            if (!toEvict) break;
            delete this.data[toEvict];
        }
    }

    updateSymbol(symbol: string, partial: Partial<MarketData>) {
        this.touchSymbol(symbol);
        const current = this.getOrCreateSymbol(symbol);

        if (partial.lastPrice !== undefined) current.lastPrice = partial.lastPrice;
        if (partial.indexPrice !== undefined) current.indexPrice = partial.indexPrice;
        if (partial.highPrice !== undefined) current.highPrice = partial.highPrice;
        if (partial.lowPrice !== undefined) current.lowPrice = partial.lowPrice;
        if (partial.volume !== undefined) current.volume = partial.volume;
        if (partial.quoteVolume !== undefined) current.quoteVolume = partial.quoteVolume;
        if (partial.priceChangePercent !== undefined) current.priceChangePercent = partial.priceChangePercent;
        if (partial.fundingRate !== undefined) current.fundingRate = partial.fundingRate;
        if (partial.nextFundingTime !== undefined) current.nextFundingTime = partial.nextFundingTime;
        if (partial.depth !== undefined) current.depth = partial.depth;

        this.enforceCacheLimit();
    }

    updateSymbolKlines(symbol: string, timeframe: string, klines: any[]) {
        this.touchSymbol(symbol);
        const current = this.getOrCreateSymbol(symbol);

        klines.forEach(k => {
            current.klines[timeframe] = {
                open: k.open,
                high: k.high,
                low: k.low,
                close: k.close,
                volume: k.volume,
                time: k.time
            };
        });

        this.enforceCacheLimit();
    }

    // Legacy update methods refactored to use updateSymbol
    updatePrice(symbol: string, data: any) {
        let nft = 0;
        if (data.nextFundingTime) {
            nft = /^\d+$/.test(data.nextFundingTime) ? parseInt(data.nextFundingTime, 10) : new Date(data.nextFundingTime).getTime();
        }
        this.updateSymbol(symbol, {
            lastPrice: new Decimal(data.price),
            indexPrice: new Decimal(data.indexPrice),
            fundingRate: new Decimal(data.fundingRate),
            nextFundingTime: nft
        });
    }

    updateTicker(symbol: string, data: any) {
        const last = new Decimal(data.lastPrice);
        const open = new Decimal(data.open);
        let pct = new Decimal(0);
        if (!open.isZero()) pct = last.minus(open).div(open).times(100);

        this.updateSymbol(symbol, {
            lastPrice: last,
            highPrice: new Decimal(data.high),
            lowPrice: new Decimal(data.low),
            volume: new Decimal(data.vol),
            quoteVolume: new Decimal(data.quoteVol),
            priceChangePercent: pct
        });
    }

    updateDepth(symbol: string, data: any) {
        this.updateSymbol(symbol, {
            depth: { bids: data.bids, asks: data.asks }
        });
    }

    updateKline(symbol: string, timeframe: string, data: any) {
        this.updateSymbolKlines(symbol, timeframe, [{
            open: new Decimal(data.o),
            high: new Decimal(data.h),
            low: new Decimal(data.l),
            close: new Decimal(data.c),
            volume: new Decimal(data.b),
            time: data.t
        }]);
    }

    reset() {
        this.cacheMetadata.clear();
        this.data = {};
    }

    cleanup() {
        const now = Date.now();
        const stale: string[] = [];
        this.cacheMetadata.forEach((meta, symbol) => {
            if (now - meta.lastAccessed > TTL_MS) stale.push(symbol);
        });
        stale.forEach((symbol) => {
            this.cacheMetadata.delete(symbol);
            delete this.data[symbol];
        });
    }

    subscribe(fn: (value: Record<string, MarketData>) => void) {
        fn(this.data);
        return $effect.root(() => {
            $effect(() => { fn(this.data); });
        });
    }

    subscribeStatus(fn: (value: WSStatus) => void) {
        fn(this.connectionStatus);
        return $effect.root(() => {
            $effect(() => { fn(this.connectionStatus); });
        });
    }
}

export const marketState = new MarketManager();
