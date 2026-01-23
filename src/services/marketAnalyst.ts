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

const DELAY_BETWEEN_SYMBOLS = 2000; // 2 seconds between checks
const DATA_FRESHNESS_TTL = 5 * 60 * 1000; // 5 minutes (Don't re-analyze if fresh)

class MarketAnalystService {
    private isRunning = false;
    private currentSymbolIndex = 0;
    private timeoutId: any = null;

    start() {
        if (!browser || this.isRunning) return;
        this.isRunning = true;
        logger.log("general", "Market Analyst started.");
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

        const favorites = settingsState.favoriteSymbols;
        if (favorites.length === 0) {
            this.timeoutId = setTimeout(() => this.processNext(), 5000);
            return;
        }

        // Round-robin selection
        this.currentSymbolIndex = (this.currentSymbolIndex + 1) % favorites.length;
        const symbol = favorites[this.currentSymbolIndex];

        try {
            // Skip if data is fresh enough options
            const existing = analysisState.results[symbol];
            if (existing && (Date.now() - existing.updatedAt < DATA_FRESHNESS_TTL)) {
                // Skip, but check slightly faster to find a stale one
                this.timeoutId = setTimeout(() => this.processNext(), 200);
                return;
            }

            analysisState.isAnalyzing = true;
            logger.log("technicals", `Analyzing ${symbol} (Background)...`);

            // 1. Fetch Data (1h for general confluence)
            // We assume 1h is good for "general condition"
            const klines = await apiService.fetchBitunixKlines(symbol, "1h", 200);

            if (!klines || klines.length < 50) {
                throw new Error("Insufficient klines");
            }

            // 2. Fetch Trend Data (4h) - Lightweight check
            // Optional: Could optimize to do this less often or reuse klines if possible
            // For now, let's stick to 1h analysis to keep it light, or infer 4h trend from 1h EMAs roughly?
            // Better to fetch 4h properly.
            const klines4h = await apiService.fetchBitunixKlines(symbol, "4h", 100);

            // 3. Calculate 1H Technicals
            const tech1h = await technicalsService.calculateTechnicals(klines, indicatorState);
            const tech4h = await technicalsService.calculateTechnicals(klines4h, indicatorState);

            if (tech1h && tech4h) {
                // 4. Derive Insights
                // Convert Decimal to numbers for calculation/storage
                const price = klines[klines.length - 1].close.toNumber();
                const open24h = klines.length >= 24 ? klines[klines.length - 24].open.toNumber() : klines[0].open.toNumber();
                const change24h = ((price - open24h) / open24h) * 100;

                // Trend 4H (based on EMA 50 vs EMA 200 or Price vs EMA 200)
                const ema200Val = tech4h.movingAverages.find(m => m.name === "EMA 200")?.value;
                const ema200_4h = ema200Val ? ema200Val.toNumber() : 0;
                const trend4h = price > ema200_4h ? "bullish" : "bearish";

                // RSI 1H
                const rsiVal = tech1h.oscillators.find(o => o.name === "RSI")?.value;
                const rsi1h = rsiVal ? rsiVal.toNumber() : 50;

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
            this.timeoutId = setTimeout(() => this.processNext(), DELAY_BETWEEN_SYMBOLS);
        }
    }
}

export const marketAnalyst = new MarketAnalystService();
