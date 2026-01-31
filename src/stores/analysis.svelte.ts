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

import { browser } from "$app/environment";
import { settingsState } from "./settings.svelte";

export interface SymbolAnalysis {
    symbol: string;
    updatedAt: number;
    price: string;
    change24h: string;
    trend4h: "bullish" | "bearish" | "neutral";
    rsi1h: string;
    confluenceScore: number; // Score is abstract (0-100), safe as number
    condition: "overbought" | "oversold" | "neutral" | "trending";
    trends?: {
        "15m": "bullish" | "bearish" | "neutral";
        "1h": "bullish" | "bearish" | "neutral";
        "4h": "bullish" | "bearish" | "neutral";
        "1d": "bullish" | "bearish" | "neutral";
    };
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
