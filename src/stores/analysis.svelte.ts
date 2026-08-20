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
 * Analysis Store
 * Holds global market analysis data calculated by the background MarketAnalyst.
 */

import { settingsState } from "./settings.svelte";

/**
 * Trend state per timeframe.
 *
 * "unknown" is NOT a market reading -- it means the trend could not be
 * determined because the required indicator (EMA 200) had no value, which in
 * practice means too few candles arrived. Keeping it distinct from "neutral"
 * matters twice over:
 *  - the analyst must not treat missing data as a result worth re-fetching
 *    forever (BUG-0230: that loop never terminated), and
 *  - the dashboard must not paint "no data" the same as a real signal.
 */
export type TrendState = "bullish" | "bearish" | "neutral" | "unknown";

/** Whether every timeframe of an analysis produced a real reading. */
export type AnalysisQuality = "complete" | "partial";

export interface SymbolAnalysis {
    symbol: string;
    updatedAt: number;
    price: string;
    change24h: string;
    trend4h: TrendState;
    rsi1h: string;
    confluenceScore: number; // Score is abstract (0-100), safe as number
    condition: "overbought" | "oversold" | "neutral" | "trending";
    trends?: {
        "15m": TrendState;
        "1h": TrendState;
        "4h": TrendState;
        "1d": TrendState;
    };
    /**
     * "partial" when at least one timeframe came back "unknown". Drives the
     * analyst's retry backoff and lets the UI mark the row as incomplete
     * instead of showing a fabricated score.
     */
    quality?: AnalysisQuality;
    /**
     * Consecutive "partial" results for this symbol. Feeds the exponential
     * backoff so a symbol that simply lacks history (newly listed token)
     * stops being re-fetched every cycle. Reset to 0 on a complete result.
     */
    partialAttempts?: number;
    /** Last failure reason, when `quality` is "partial" because of an error. */
    lastError?: string;
    /**
     * Human-readable bias for `confluenceScore`, as produced by
     * ConfluenceAnalyzer. The score alone is not interpretable -- 50 is
     * neutral, not "half good" -- so the level is what the UI should lead with.
     */
    confluenceLevel?: "Strong Sell" | "Sell" | "Neutral" | "Buy" | "Strong Buy";
    /**
     * Signed reasons behind the score, e.g. `["+15 MA Trend Bullish",
     * "-5 RSI Bearish"]`. Already computed by the analyzer; surfaced so the
     * dashboard can explain a score instead of asserting one.
     */
    confluenceReasons?: string[];
}

class AnalysisManager {
    results = $state<Record<string, SymbolAnalysis>>({});
    isAnalyzing = $state(false);
    lastUpdate = $state(0);
    lastAnalysisTime = $state(0);

    updateAnalysis(symbol: string, data: SymbolAnalysis) {
        this.results[symbol] = data;
        this.lastUpdate = Date.now();
        this.lastAnalysisTime = Date.now();
        this.enforceCacheLimit();
    }

    private enforceCacheLimit() {
        const maxSize = settingsState.marketCacheSize || 20;
        const keys = Object.keys(this.results);

        if (keys.length <= maxSize) return;

        // Sort by updatedAt (oldest first) - LRU style
        const sorted = keys
            .map(k => ({ key: k, updatedAt: this.results[k].updatedAt }))
            .sort((a, b) => a.updatedAt - b.updatedAt);

        // Remove oldest entries until under limit
        const toRemove = sorted.slice(0, keys.length - maxSize);
        toRemove.forEach(item => {
            delete this.results[item.key];
        });
    }

    reset() {
        this.results = {};
        this.isAnalyzing = false;
        this.lastUpdate = 0;
        this.lastAnalysisTime = 0;
    }

    get sortedByScore() {
        return Object.values(this.results).sort((a, b) => b.confluenceScore - a.confluenceScore);
    }

    get bullishCount() {
        return Object.values(this.results).filter(a => a.trend4h === "bullish").length;
    }

    get bearishCount() {
        return Object.values(this.results).filter(a => a.trend4h === "bearish").length;
    }
}

export const analysisState = new AnalysisManager();
