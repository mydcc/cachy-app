/*
 * Copyright (C) 2026 MYDCT
 *
 * Market Data Adapter (MDA) Types
 * Standardized data structures for unified market data ingestion.
 */

export interface NormalizedTicker {
    symbol: string;
    provider: string;
    lastPrice: string | number;
    high?: string | number;
    low?: string | number;
    volume?: string | number;
    quoteVolume?: string | number;
    priceChangePercent?: string | number;
    timestamp: number;
}

export interface NormalizedKline {
    time: number;
    open: string | number;
    high: string | number;
    low: string | number;
    close: string | number;
    volume: string | number;
}

export interface MarketDataAdapter {
    name: string;
    normalizeTicker(raw: any): NormalizedTicker;
    normalizeKline(raw: any): NormalizedKline;
}
