/*
 * Copyright (C) 2026 MYDCT
 *
 * Market Analyst Service
 * Background service that cycles through favorite symbols to calculate 
 * key indicators without overloading the CPU or API.
 */

import { settingsState } from "../stores/settings.svelte";
import { favoritesState } from "../stores/favorites.svelte";
import { analysisState, type SymbolAnalysis } from "../stores/analysis.svelte";
import { apiService } from "./apiService";
import { technicalsService } from "./technicalsService";
import { indicatorState } from "../stores/indicator.svelte";
import { logger } from "./logger";
import { toastService } from "./toastService.svelte";
import { browser } from "$app/environment";
import { Decimal } from "decimal.js";
import { safeSub, safeDiv } from "../utils/utils";

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

        const favorites = favoritesState.items;
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
            const timeframes = settingsState.analysisTimeframes;

            // Determine kline counts per timeframe
            const klineCountMap: Record<string, number> = {
                "5m": 200,
                "15m": 200,
                "1h": 200,
                "4h": 100,
                "1d": 100
            };

            // PARALLEL: Fetch all timeframes at once
            console.log(`[TECHNICALS] Analyst: ${symbol} Fetching ${timeframes.length} timeframes in parallel...`);
            const startFetch = performance.now();

            const klinesPromises = timeframes.map(tf => {
                const count = klineCountMap[tf] || 100;
                return provider === "bitget"
                    ? apiService.fetchBitgetKlines(symbol, tf, count, undefined, undefined, "normal")
                    : apiService.fetchBitunixKlines(symbol, tf, count, undefined, undefined, "normal");
            });

            const klinesResults = await Promise.all(klinesPromises);
            const fetchTime = performance.now() - startFetch;
            console.log(`[TECHNICALS] Analyst: ${symbol} All klines fetched in ${fetchTime.toFixed(0)}ms`);

            // Build a map of timeframe -> klines
            const klinesMap: Record<string, typeof klinesResults[0]> = {};
            timeframes.forEach((tf, i) => {
                klinesMap[tf] = klinesResults[i];
            });

            // Validate minimum data
            const primaryTf = timeframes.includes("1h") ? "1h" : timeframes[0];
            const primaryKlines = klinesMap[primaryTf];
            if (!primaryKlines || primaryKlines.length < 50) throw new Error("MIN_DATA_REQUIRED");

            // PARALLEL: Calculate technicals for all timeframes
            console.log(`[TECHNICALS] Analyst: ${symbol} Calculating technicals for ${timeframes.length} timeframes...`);
            const startCalc = performance.now();

            const techPromises = timeframes.map(tf => {
                const klines = klinesMap[tf];
                if (!klines || klines.length < 20) return Promise.resolve(null);
                return technicalsService.calculateTechnicals(klines, indicatorState);
            });

            const techResults = await Promise.all(techPromises);
            const calcTime = performance.now() - startCalc;
            console.log(`[TECHNICALS] Analyst: ${symbol} All technicals done in ${calcTime.toFixed(0)}ms`);

            // Build a map of timeframe -> technicals
            const techMap: Record<string, typeof techResults[0]> = {};
            timeframes.forEach((tf, i) => {
                techMap[tf] = techResults[i];
            });

            // Extract metrics from available data
            const tech1h = techMap["1h"];
            const tech4h = techMap["4h"];
            const techPrimary = tech1h || techMap[primaryTf];

            if (techPrimary) {
                const klines = primaryKlines;
                const lastKline = klines[klines.length - 1];
                const openKline = klines.length >= 24 ? klines[klines.length - 24] : klines[0];
                const ema200_4h = tech4h?.movingAverages.find(m => m.name === "EMA 200")?.value || 0;
                const rsiObj = techPrimary.oscillators.find((o) => o.name === "RSI");

                const metrics = calculateAnalysisMetrics(
                    lastKline?.close,
                    openKline?.open,
                    ema200_4h,
                    rsiObj?.value
                );

                analysisState.updateAnalysis(symbol, {
                    symbol,
                    updatedAt: Date.now(),
                    confluenceScore: techPrimary.confluence?.score || 0,
                    ...metrics
                });

                console.log(`[TECHNICALS] Analyst: ${symbol} COMPLETE - Fetch: ${fetchTime.toFixed(0)}ms, Calc: ${calcTime.toFixed(0)}ms, Total: ${(fetchTime + calcTime).toFixed(0)}ms`);
            }
        } catch (e) {
            // Log the actual error to understand what's failing
            const errorMsg = e instanceof Error ? e.message : String(e);

            // Log to console/logger always
            console.error(`[TECHNICALS] Analyst: ERROR for ${symbol}:`, errorMsg);
            logger.log("general", `Market Analyst error for ${symbol}: ${errorMsg}`);

            // Toast for significant errors (ignore expected data shortage)
            if (errorMsg !== "MIN_DATA_REQUIRED") {
                toastService.error(`Analysis failed for ${symbol}: ${errorMsg}`);
            }
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
    const price = priceDec.toString();

    const open24hDec = safeDec(open24h);

    let change24hDec = new Decimal(0);
    if (!open24hDec.isZero()) {
        change24hDec = safeDiv(safeSub(priceDec, open24hDec), open24hDec).times(100);
    }
    const change24h = change24hDec.toFixed(2);

    const ema200Dec = safeDec(ema200);

    // Use safe comparison
    const trend4h: SymbolAnalysis["trend4h"] = priceDec.greaterThan(ema200Dec) ? "bullish" : "bearish";

    const rsiDec = safeDec(rsiValue || 50);
    const rsi1h = rsiDec.toFixed(2);

    let condition: SymbolAnalysis["condition"] = "neutral";

    try {
        if (rsiDec.greaterThan(70)) condition = "overbought";
        else if (rsiDec.lessThan(30)) condition = "oversold";
        else if (change24hDec.abs().greaterThan(5)) condition = "trending";
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
