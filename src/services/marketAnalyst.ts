/*
 * Copyright (C) 2026 MYDCT
 *
 * Market Analyst Service
 * Background service that cycles through favorite symbols to calculate 
 * key indicators without overloading the CPU or API.
 */

import { settingsState } from "../stores/settings.svelte";
import { analysisState, type SymbolAnalysis } from "../stores/analysis.svelte";
import { apiService } from "./apiService";
import { technicalsService } from "./technicalsService";
import { indicatorState } from "../stores/indicator.svelte";
import { logger } from "./logger";
import { browser } from "$app/environment";
import { Decimal } from "decimal.js";
import { safeSub, safeDiv, safeMul } from "../utils/utils";

// DELAY_BETWEEN_SYMBOLS is now dynamic from settingsState
const DATA_FRESHNESS_TTL = 10 * 60 * 1000; // 10 minutes cache

class MarketAnalystService {
    private isRunning = false;
    private currentSymbolIndex = 0;
    private timeoutId: any = null;

    start() {
        if (!browser || this.isRunning) return;
        this.isRunning = true;
        logger.log("general", "Market Analyst started (Optimized Cycle).");
        this.processNext();
    }

    stop() {
        this.isRunning = false;
        if (this.timeoutId) clearTimeout(this.timeoutId);
        analysisState.isAnalyzing = false;
        logger.log("general", "Market Analyst stopped.");
    }

    private async processNext() {
        if (!this.isRunning) return;

        const { capabilities, marketAnalysisInterval, pauseAnalysisOnBlur, analyzeAllFavorites } = settingsState;

        if (!capabilities.marketData || marketAnalysisInterval <= 0) {
            this.timeoutId = setTimeout(() => this.processNext(), 10000);
            return;
        }

        // Pause / Slow down if hidden
        const isHidden = browser && document.hidden;
        if (pauseAnalysisOnBlur && isHidden) {
            this.timeoutId = setTimeout(() => this.processNext(), 15000);
            return;
        }

        const favorites = settingsState.favoriteSymbols;
        if (favorites.length === 0) {
            this.timeoutId = setTimeout(() => this.processNext(), 5000);
            return;
        }

        const limit = analyzeAllFavorites ? favorites.length : Math.min(favorites.length, 6);
        this.currentSymbolIndex = (this.currentSymbolIndex + 1) % limit;
        const symbol = favorites[this.currentSymbolIndex];

        try {
            const existing = analysisState.results[symbol];
            const freshnessThreshold = isHidden ? DATA_FRESHNESS_TTL * 2 : DATA_FRESHNESS_TTL;

            if (existing && (Date.now() - existing.updatedAt < freshnessThreshold)) {
                this.timeoutId = setTimeout(() => this.processNext(), 2000); // Check next favorite quickly
                return;
            }

            analysisState.isAnalyzing = true;
            console.log(`[TECHNICALS] Analyst: Processing ${symbol}... (Started)`);

            const provider = settingsState.apiProvider;

            // Use 'normal' priority for background analysis to not interfere with trade UI
            const klines = await (provider === "bitget"
                ? apiService.fetchBitgetKlines(symbol, "1h", 200, undefined, undefined, "normal")
                : apiService.fetchBitunixKlines(symbol, "1h", 200, undefined, undefined, "normal"));

            if (!klines || klines.length < 50) throw new Error("MIN_DATA_REQUIRED");
            console.log(`[TECHNICALS] Analyst: ${symbol} 1h klines fetched (${klines.length} candles)`);

            const klines4h = await (provider === "bitget"
                ? apiService.fetchBitgetKlines(symbol, "4h", 100, undefined, undefined, "normal")
                : apiService.fetchBitunixKlines(symbol, "4h", 100, undefined, undefined, "normal"));

            console.log(`[TECHNICALS] Analyst: ${symbol} 4h klines fetched (${klines4h.length} candles)`);

            // Offload to worker via technicalsService
            console.log(`[TECHNICALS] Analyst: ${symbol} Starting technicals calc...`);
            const tech1h = await technicalsService.calculateTechnicals(klines, indicatorState);
            console.log(`[TECHNICALS] Analyst: ${symbol} 1h technicals done`);
            const tech4h = await technicalsService.calculateTechnicals(klines4h, indicatorState);
            console.log(`[TECHNICALS] Analyst: ${symbol} 4h technicals done`);

            if (tech1h && tech4h) {
                const lastKline = klines[klines.length - 1];
                const openKline = klines.length >= 24 ? klines[klines.length - 24] : klines[0];
                const ema200_4h = tech4h.movingAverages.find(m => m.name === "EMA 200")?.value || 0;
                const rsiObj = tech1h.oscillators.find((o) => o.name === "RSI");

                const metrics = calculateAnalysisMetrics(
                    lastKline?.close,
                    openKline?.open,
                    ema200_4h,
                    rsiObj?.value
                );

                analysisState.updateAnalysis(symbol, {
                    symbol,
                    updatedAt: Date.now(),
                    confluenceScore: tech1h.confluence?.score || 0,
                    ...metrics
                });
            }
        } catch (e) {
            // Log the actual error to understand what's failing
            const errorMsg = e instanceof Error ? e.message : String(e);
            console.error(`[TECHNICALS] Analyst: ERROR for ${symbol}:`, errorMsg);
            logger.log("general", `Market Analyst error for ${symbol}: ${errorMsg}`);
        } finally {
            analysisState.isAnalyzing = false;
            const baseDelay = (settingsState.marketAnalysisInterval || 60) * 1000;
            const finalDelay = isHidden ? baseDelay * 2 : baseDelay;
            console.log(`[TECHNICALS] Analyst: Scheduling next cycle in ${finalDelay}ms`);
            this.timeoutId = setTimeout(() => this.processNext(), finalDelay);
        }
    }
}

export const marketAnalyst = new MarketAnalystService();
// export const marketAnalyst = null as any;

export function calculateAnalysisMetrics(
    lastClose: Decimal.Value | null | undefined,
    open24h: Decimal.Value | null | undefined,
    ema200: Decimal.Value | null | undefined,
    rsiValue: Decimal.Value | null | undefined
) {
    const safeDec = (v: Decimal.Value | null | undefined): Decimal => {
        try {
            if (v === null || v === undefined) return new Decimal(0);
            return new Decimal(v);
        } catch {
            return new Decimal(0);
        }
    };

    const priceDec = safeDec(lastClose);
    const price = priceDec.toNumber();

    const open24hDec = safeDec(open24h);

    let change24h = 0;
    if (!open24hDec.isZero()) {
        change24h = safeDiv(safeSub(priceDec, open24hDec), open24hDec).times(100).toNumber();
    }

    const ema200Dec = safeDec(ema200);

    // Use safe comparison
    const trend4h = priceDec.greaterThan(ema200Dec) ? "bullish" : "bearish";

    const rsiDec = safeDec(rsiValue || 50);
    const rsi1h = rsiDec.toNumber();

    let condition: SymbolAnalysis["condition"] = "neutral";

    try {
        if (rsiDec.greaterThan(70)) condition = "overbought";
        else if (rsiDec.lessThan(30)) condition = "oversold";
        else if (new Decimal(change24h).abs().greaterThan(5)) condition = "trending";
    } catch (err) {
        condition = "neutral";
    }

    return {
        price,
        change24h,
        trend4h,
        rsi1h,
        condition
    };
}
