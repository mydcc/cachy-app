/*
 * Copyright (C) 2026 MYDCT
 *
 * Market Analyst Service
 * Analyzes market data across multiple timeframes for favorite symbols.
 */

import { apiService } from "./apiService";
import { technicalsService } from "./technicalsService";
import { logger } from "./logger";
import { marketState } from "../stores/market.svelte";
import { analysisState, type SymbolAnalysis } from "../stores/analysis.svelte";
import { favoritesState } from "../stores/favorites.svelte";
import { settingsState } from "../stores/settings.svelte";
import { toastService } from "./toastService.svelte";
import { Decimal } from "decimal.js";
import { safeDiv, safeSub } from "../lib/calculators/core";

const DATA_FRESHNESS_TTL = 300 * 1000; // 5 minutes
const REQUIRED_INDICATORS = {
    ema: true, rsi: true, macd: true, atr: true, bb: true, pivots: true,
    stochRsi: true, mfi: true, ichimoku: true, vwap: true, adx: true
};

class MarketAnalystService {
    private timeoutId: any = null;
    private isRunning = false;
    private currentSymbolIndex = 0;

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.processNext();
        logger.log("technicals", "Market Analyst Service Started");
    }

    stop() {
        this.isRunning = false;
        if (this.timeoutId) clearTimeout(this.timeoutId);
        logger.log("technicals", "Market Analyst Service Stopped");
    }

    private getAnalystSettings() {
        // Use user settings but enforce certain defaults for analysis
        const base = settingsState.indicators;
        return {
            ...base,
            // Ensure EMA 200 is included
            ema: {
                ...base.ema,
                ema3: { length: 200 }
            }
        };
    }

    private async processNext() {
        if (!this.isRunning) return;

        // Check visibility/focus (pause if tab hidden to save resources, unless forced)
        const isHidden = typeof document !== "undefined" && document.hidden;

        const favorites = favoritesState.items;
        if (favorites.length === 0) {
            this.scheduleNext(5000);
            return;
        }

        this.currentSymbolIndex = (this.currentSymbolIndex + 1) % favorites.length;
        const symbol = favorites[this.currentSymbolIndex];

        try {
            const existing = analysisState.results[symbol];
            const freshnessThreshold = isHidden ? DATA_FRESHNESS_TTL * 2 : DATA_FRESHNESS_TTL;

            // "Neutral" here implies missing data (EMA200 calculation failed), so we should retry
            const isInvalid = !existing?.trends || existing?.trends["4h"] === "neutral";

            // Check freshness - only skip if fresh AND valid
            if (existing && !isInvalid && (Date.now() - existing.updatedAt < freshnessThreshold)) {
                throw new Error("SKIP_FRESH");
            }

            analysisState.isAnalyzing = true;
            logger.log("technicals", `Analyst: Processing ${symbol}... (Started)`);

            const provider = settingsState.apiProvider;
            // Ensure we have the required timeframes for the dashboard matrix
            const requiredTimeframes = ["15m", "1h", "4h", "1d"];
            const timeframes = Array.from(new Set([...settingsState.analysisTimeframes, ...requiredTimeframes]));

            // Determine kline counts per timeframe
            // Increased to 500 to safely cover EMA 200 + warm-up period
            const klineCountMap: Record<string, number> = {
                "5m": 500,
                "15m": 500,
                "1h": 500,
                "4h": 500,
                "1d": 500
            };

            // PARALLEL: Fetch all timeframes at once
            logger.log("technicals", `Analyst: ${symbol} Fetching ${timeframes.length} timeframes in parallel...`);
            const startFetch = performance.now();

            const klinesPromises = timeframes.map(tf => {
                const count = klineCountMap[tf] || 500;
                return provider === "bitget"
                    ? apiService.fetchBitgetKlines(symbol, tf, count, undefined, undefined, "normal")
                    : apiService.fetchBitunixKlines(symbol, tf, count, undefined, undefined, "normal");
            });

            const klinesResults = await Promise.all(klinesPromises);
            const fetchTime = performance.now() - startFetch;
            logger.log("technicals", `Analyst: ${symbol} All klines fetched in ${fetchTime.toFixed(0)}ms`);

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
            logger.log("technicals", `Analyst: ${symbol} Calculating technicals for ${timeframes.length} timeframes...`);
            const startCalc = performance.now();

            // Prepare settings ONCE (Optimization)
            const settings = this.getAnalystSettings();

            // Force enable them by name (keys must match calculator logic which uses strictly 'EMA' usually)
            // The calculator checks "shouldCalculate('ema')".
            const requiredIndicators = REQUIRED_INDICATORS;

            const techPromises = timeframes.map(tf => {
                const klines = klinesMap[tf];
                if (!klines || klines.length < 20) return Promise.resolve(null);

                return technicalsService.calculateTechnicals(klines, settings, requiredIndicators);
            });

            const techResults = await Promise.all(techPromises);
            const calcTime = performance.now() - startCalc;
            logger.log("technicals", `Analyst: ${symbol} All technicals done in ${calcTime.toFixed(0)}ms`);

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
                    techMap
                );

                analysisState.updateAnalysis(symbol, {
                    symbol,
                    updatedAt: Date.now(),
                    confluenceScore: techPrimary.confluence?.score || 0,
                    ...metrics
                });

                // Update Performance Telemetry
                marketState.updateTelemetry({ lastCalcDuration: calcTime });

                logger.log("technicals", `Analyst: ${symbol} COMPLETE - Fetch: ${fetchTime.toFixed(0)}ms, Calc: ${calcTime.toFixed(0)}ms, Total: ${(fetchTime + calcTime).toFixed(0)}ms`);
            }
        } catch (e) {
            const errorMsg = e instanceof Error ? e.message : String(e);

            if (errorMsg === "SKIP_FRESH") {
                // Expected skip, just log debug
                if (import.meta.env.DEV) {
                    logger.debug("technicals", `Skipping ${symbol} (Fresh)`);
                }
                // Schedule next quickly
                this.scheduleNext(2000);
                return;
            }

            // Log the actual error to understand what's failing
            logger.error("technicals", `Analyst: ERROR for ${symbol}:`, errorMsg);

            // Toast for significant errors (ignore expected data shortage)
            if (errorMsg !== "MIN_DATA_REQUIRED") {
                toastService.error(`Analysis failed for ${symbol}: ${errorMsg}`);
            }
        } finally {
            analysisState.isAnalyzing = false;

            if (this.isRunning && !this.timeoutId) {
                // INTELLIGENT SCHEDULING
                // Check if any favorite needs analysis (missing or neutral trends)
                // If yes, run fast (2s) to fill the dashboard.
                // If no, run at standard interval to maintain freshness.

                const anyNeedsUpdate = favoritesState.items.some(sym => {
                    const data = analysisState.results[sym];
                    return !data || !data.trends || data.trends["4h"] === "neutral";
                });

                const baseDelay = (settingsState.marketAnalysisInterval || 60) * 1000;
                // If filling gaps, go fast (2s). If maintaining, use user setting.
                const delay = anyNeedsUpdate ? 2000 : (isHidden ? baseDelay * 2 : baseDelay);

                this.scheduleNext(delay);
            }
        }
    }

    private scheduleNext(delay: number) {
        if (this.timeoutId) clearTimeout(this.timeoutId);
        if (!this.isRunning) return;

        logger.debug("technicals", `Analyst: Scheduling next cycle in ${delay}ms`);
        this.timeoutId = setTimeout(() => {
            this.timeoutId = null; // Clear ref before running
            this.processNext();
        }, delay);
    }
}

export const marketAnalyst = new MarketAnalystService();

export function calculateAnalysisMetrics(
    lastClose: Decimal.Value | null | undefined,
    open24h: Decimal.Value | null | undefined,
    techMap: Record<string, any>
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

    // Helper to determine trend for a timeframe
    const getTrend = (tf: string): "bullish" | "bearish" | "neutral" => {
        const tech = techMap[tf];
        if (!tech) return "neutral";

        // Use confluence score if available for broad trend, or EMA check
        // Ideally checking Price > EMA200
        const ema = tech.movingAverages?.find((m: any) => m.name === "EMA" && m.params === "200")?.value;
        if (ema === undefined || (typeof ema === "number" && isNaN(ema)) || ema === 0) return "neutral";

        return priceDec.greaterThan(safeDec(ema)) ? "bullish" : "bearish";
    };

    const trends = {
        "15m": getTrend("15m"),
        "1h": getTrend("1h"),
        "4h": getTrend("4h"),
        "1d": getTrend("1d")
    };

    // Keep legacy trend4h for compatibility
    const trend4h = trends["4h"];

    // RSI from 1h or primary
    const techPrimary = techMap["1h"] || Object.values(techMap)[0];
    const rsiValue = techPrimary?.oscillators?.find((o: any) => o.name === "RSI")?.value;
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
        trends,
        rsi1h,
        condition
    };
}
