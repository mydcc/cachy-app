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

        if (!settingsState.capabilities.marketData || settingsState.marketAnalysisInterval <= 0) {
            this.timeoutId = setTimeout(() => this.processNext(), 10000);
            return;
        }

        // Pause if tab is hidden and setting is enabled
        if (settingsState.pauseAnalysisOnBlur && document.hidden) {
            this.timeoutId = setTimeout(() => this.processNext(), 5000); // Re-check in 5s
            return;
        }

        const favorites = settingsState.favoriteSymbols;
        if (favorites.length === 0) {
            this.timeoutId = setTimeout(() => this.processNext(), 5000);
            return;
        }

        // --- NEW LOGIC: Respect "Balanced" Mode (Top 4 only) ---
        const limit = settingsState.analyzeAllFavorites ? favorites.length : Math.min(favorites.length, 4);

        // Ensure index wraps correctly within the limit
        this.currentSymbolIndex = (this.currentSymbolIndex + 1) % limit;
        const symbol = favorites[this.currentSymbolIndex];

        try {
            // Skip if data is fresh enough options
            const existing = analysisState.results[symbol];
            if (existing && (Date.now() - existing.updatedAt < DATA_FRESHNESS_TTL)) {
                // Skip, but check slightly faster to find a stale one
                this.timeoutId = setTimeout(() => this.processNext(), 5000);
                return;
            }

            analysisState.isAnalyzing = true;
            logger.log("technicals", `Analyzing ${symbol} (Background)...`);

            const provider = settingsState.apiProvider;

            // 1. Fetch Data (1h for general confluence)
            const klines = await (provider === "bitget"
                ? apiService.fetchBitgetKlines(symbol, "1h", 200)
                : apiService.fetchBitunixKlines(symbol, "1h", 200));

            if (!klines || klines.length < 50) {
                throw new Error("Insufficient klines");
            }

            // 2. Fetch Trend Data (4h)
            const klines4h = await (provider === "bitget"
                ? apiService.fetchBitgetKlines(symbol, "4h", 100)
                : apiService.fetchBitunixKlines(symbol, "4h", 100));

            // 3. Calculate 1H Technicals
            const tech1h = await technicalsService.calculateTechnicals(klines, indicatorState);
            const tech4h = await technicalsService.calculateTechnicals(klines4h, indicatorState);

            if (tech1h && tech4h) {
                // 4. Derive Insights
                // Convert Decimal to number for arithmetic
                const price = new Decimal(klines[klines.length - 1].close).toNumber();
                const openVal = klines.length >= 24 ? klines[klines.length - 24].open : klines[0].open;
                const open24h = new Decimal(openVal).toNumber();
                const change24h = ((price - open24h) / open24h) * 100;

                // Trend 4H (based on EMA 50 vs EMA 200 or Price vs EMA 200)
                const ema200_4h = tech4h.movingAverages.find(m => m.name === "EMA 200")?.value || 0;
                const ema200Num = new Decimal(ema200_4h).toNumber();
                const trend4h = price > ema200Num ? "bullish" : "bearish";

                // RSI 1H
                const rsiObj = tech1h.oscillators.find((o) => o.name === "RSI");
                const rsiVal = rsiObj ? rsiObj.value : 50;
                const rsi1h = rsiVal instanceof Decimal ? rsiVal.toNumber() : Number(rsiVal);

                let condition: SymbolAnalysis["condition"] = "neutral";
                if (rsi1h > 70) condition = "overbought";
                else if (rsi1h < 30) condition = "oversold";
                else if (Math.abs(change24h) > 5) condition = "trending";

                const analysis: SymbolAnalysis = {
                    symbol,
                    updatedAt: Date.now(),
                    price,
                    change24h,
                    trend4h,
                    rsi1h,
                    confluenceScore: tech1h.confluence?.score || 0,
                    condition
                };

                analysisState.updateAnalysis(symbol, analysis);
                logger.log("technicals", `Analysis complete for ${symbol}: Score ${analysis.confluenceScore}`);
            }

        } catch (e) {
            if (import.meta.env.DEV) {
                logger.warn("general", `Analyst failed for ${symbol}`, e);
            }
        } finally {
            analysisState.isAnalyzing = false;

            // Dynamic delay from settings
            let delay = (settingsState.marketAnalysisInterval || 60) * 1000;

            // Check for Pause on Blur
            if (settingsState.pauseAnalysisOnBlur && document.hidden) {
                delay = 30000; // Slow trickle check (30s) if hidden
                // Note: Main check happens at start of processNext, so this just schedules the next check.
            }

            this.timeoutId = setTimeout(() => this.processNext(), delay);
        }
    }
}

export const marketAnalyst = new MarketAnalystService();
// export const marketAnalyst = null as any;
