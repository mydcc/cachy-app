/*
 * Copyright (C) 2026 MYDCT
 *
 * Analysis Store
 * Holds global market analysis data calculated by the background MarketAnalyst.
 */

import { browser } from "$app/environment";

export interface SymbolAnalysis {
    symbol: string;
    updatedAt: number;
    price: number;
    change24h: number;
    trend4h: "bullish" | "bearish" | "neutral";
    rsi1h: number;
    confluenceScore: number;
    condition: "overbought" | "oversold" | "neutral" | "trending";
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
