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
            logger.log("technicals", `Analyst: Processing ${symbol}...`);

            const provider = settingsState.apiProvider;

            // Use 'normal' priority for background analysis to not interfere with trade UI
            const klines = await (provider === "bitget"
                ? apiService.fetchBitgetKlines(symbol, "1h", 200, undefined, undefined, "normal")
                : apiService.fetchBitunixKlines(symbol, "1h", 200, undefined, undefined, "normal"));

            if (!klines || klines.length < 50) throw new Error("MIN_DATA_REQUIRED");

            const klines4h = await (provider === "bitget"
                ? apiService.fetchBitgetKlines(symbol, "4h", 100, undefined, undefined, "normal")
                : apiService.fetchBitunixKlines(symbol, "4h", 100, undefined, undefined, "normal"));

            // Offload to worker via technicalsService
            const tech1h = await technicalsService.calculateTechnicals(klines, indicatorState);
            const tech4h = await technicalsService.calculateTechnicals(klines4h, indicatorState);

            if (tech1h && tech4h) {
                const lastKline = klines[klines.length - 1];
                const price = new Decimal(lastKline.close).toNumber();
                const open24h = new Decimal(klines.length >= 24 ? klines[klines.length - 24].open : klines[0].open).toNumber();
                const change24h = ((price - open24h) / open24h) * 100;

                const ema200_4h = tech4h.movingAverages.find(m => m.name === "EMA 200")?.value || 0;
                const trend4h = price > new Decimal(ema200_4h).toNumber() ? "bullish" : "bearish";

                const rsiObj = tech1h.oscillators.find((o) => o.name === "RSI");
                const rsi1h = rsiObj ? (rsiObj.value instanceof Decimal ? rsiObj.value.toNumber() : Number(rsiObj.value)) : 50;

                let condition: SymbolAnalysis["condition"] = "neutral";
                if (rsi1h > 70) condition = "overbought";
                else if (rsi1h < 30) condition = "oversold";
                else if (Math.abs(change24h) > 5) condition = "trending";

                analysisState.updateAnalysis(symbol, {
                    symbol,
                    updatedAt: Date.now(),
                    price,
                    change24h,
                    trend4h,
                    rsi1h,
                    confluenceScore: tech1h.confluence?.score || 0,
                    condition
                });
            }
        } catch (e) {
            // Silently handle analysis errors to keep the loop alive
        } finally {
            analysisState.isAnalyzing = false;
            const baseDelay = (settingsState.marketAnalysisInterval || 60) * 1000;
            const finalDelay = isHidden ? baseDelay * 2 : baseDelay;
            this.timeoutId = setTimeout(() => this.processNext(), finalDelay);
        }
    }
}

export const marketAnalyst = new MarketAnalystService();
// export const marketAnalyst = null as any;
