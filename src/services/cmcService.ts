/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { settingsState } from "../stores/settings.svelte";

interface CacheEntry<T> {
    data: T;
    timestamp: number;
}

export interface CmcGlobalMetrics {
    btc_dominance: number;
    eth_dominance: number;
    active_cryptocurrencies: number;
    total_market_cap: number;
    total_volume_24h: number;
    last_updated: string;
}

export interface CmcCoinMetadata {
    id: number;
    name: string;
    symbol: string;
    slug: string;
    date_added: string;
    tags: string[];
    platform: any;
    category: string;
}

const CACHE_TTL_GLOBAL = 10 * 60 * 1000; // 10 minutes
const CACHE_TTL_COIN = 60 * 60 * 1000; // 1 hour

class CmcService {
    private globalCache: CacheEntry<CmcGlobalMetrics> | null = null;
    private coinCache: Map<string, CacheEntry<CmcCoinMetadata>> = new Map();

    /**
     * Helper to make proxied requests
     */
    private async fetchFromProxy(endpoint: string, params: Record<string, string> = {}) {
        const apiKey = settingsState.cmcApiKey;
        if (!apiKey) throw new Error("CMC API Key missing");

        const query = new URLSearchParams(params);
        query.append("endpoint", endpoint);

        const res = await fetch(`/api/external/cmc?${query.toString()}`, {
            headers: {
                "x-cmc-api-key": apiKey
            }
        });

        if (!res.ok) {
            throw new Error(`CMC Request failed: ${res.status}`);
        }

        return await res.json();
    }

    /**
     * Get Global Market Metrics (BTC Dom, etc.)
     */
    async getGlobalMetrics(): Promise<CmcGlobalMetrics | null> {
        if (this.globalCache && (Date.now() - this.globalCache.timestamp < CACHE_TTL_GLOBAL)) {
            return this.globalCache.data;
        }

        try {
            const result = await this.fetchFromProxy("/v1/global-metrics/quotes/latest");
            if (result.data) {
                const metrics = result.data.quote.USD; // Assuming USD
                // CMC structure is data: { active_cryptocurrencies, ..., quote: { USD: { ... } } }
                // Let's flatten what we need
                const parsed: CmcGlobalMetrics = {
                    btc_dominance: result.data.btc_dominance,
                    eth_dominance: result.data.eth_dominance,
                    active_cryptocurrencies: result.data.active_cryptocurrencies,
                    total_market_cap: metrics.total_market_cap,
                    total_volume_24h: metrics.total_volume_24h,
                    last_updated: result.data.last_updated
                };

                this.globalCache = { data: parsed, timestamp: Date.now() };
                return parsed;
            }
        } catch (e) {
            console.warn("[CmcService] Global Metrics Fetch Failed:", e);
        }
        return null;
    }

    /**
     * Get Metadata/Info for a specific Symbol (e.g. BTC, ETH)
     * Uses /v1/cryptocurrency/quotes/latest?symbol=BTC
     * Note: This endpoint returns price data too, but also tags and static info?
     * Actually /v1/cryptocurrency/info is better for static metadata (logo, website, tags),
     * but 'quotes/latest' gives tags + circulating supply + rank.
     * The plan listed 'quotes/latest' as allowed. Let's use that.
     */
    async getCoinMetadata(symbol: string): Promise<CmcCoinMetadata | null> {
        // Remove suffixes like USDT if present, CMC uses raw symbols usually
        // But our app uses BTCUSDT. We need to strip USDT.
        const rawSymbol = symbol.replace("USDT", "").replace("USDC", "");

        if (this.coinCache.has(rawSymbol)) {
            const entry = this.coinCache.get(rawSymbol)!;
            if (Date.now() - entry.timestamp < CACHE_TTL_COIN) {
                return entry.data;
            }
        }

        try {
            const result = await this.fetchFromProxy("/v1/cryptocurrency/quotes/latest", {
                symbol: rawSymbol
            });

            // Result structure: { data: { "BTC": { ... } } }
            if (result.data && result.data[rawSymbol]) {
                const coin = result.data[rawSymbol];
                const parsed: CmcCoinMetadata = {
                    id: coin.id,
                    name: coin.name,
                    symbol: coin.symbol,
                    slug: coin.slug,
                    date_added: coin.date_added,
                    tags: coin.tags || [],
                    platform: coin.platform,
                    category: "coin" // Default, CMC field 'category' exists but often 'coin' or 'token'
                };

                this.coinCache.set(rawSymbol, { data: parsed, timestamp: Date.now() });
                return parsed;
            }
        } catch (e) {
            console.warn(`[CmcService] Metadata fetch failed for ${rawSymbol}:`, e);
        }
        return null;
    }
}

export const cmcService = new CmcService();
