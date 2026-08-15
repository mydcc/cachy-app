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

import { marketState } from "../../stores/market.svelte";
import { scheduler } from "../../utils/scheduler";
import { indicatorState } from "../../stores/indicator.svelte";
import { technicalsService } from "../technicalsService";
import { marketWatcher } from "../marketWatcher";
import { getIntervalMs } from "../../utils/utils";
import { logger } from "../logger";
import { Decimal } from "decimal.js";
import type { Kline, KlineBuffers, TechnicalsData } from "../technicalsTypes";
import type { MarketData } from "../../stores/market.svelte";
import { BufferPool } from "../../utils/bufferPool";

/**
 * Runs the actual technicals calculation for a symbol/timeframe once
 * ActiveTechnicalsManager's scheduler decides it's time. Fully self-contained
 * -- no callback into the caller is needed, since the result is written
 * straight to marketState via the RAF scheduler.
 */
export class CalculationExecutor {
    // State Tracking for Worker Initialization
    public readonly workerState = new Map<string, { initialized: boolean, lastTime: number, settingsHash?: string }>();

    // Memory Management: Reuse buffers to prevent GC spikes
    public readonly pool = new BufferPool();

    /**
     * Force an immediate calculation, bypassing any backfill throttles.
     * Used after a backfill finishes to ensure store is up-to-date.
     */
    forceRefresh(symbol: string, timeframe: string) {
        // Clear state to force full re-initialization with new history
        this.workerState.delete(`${symbol}:${timeframe}`);
        this.performCalculation(symbol, timeframe);
    }

    async performCalculation(symbol: string, timeframe: string) {
        const key = `${symbol}:${timeframe}`;

        // 1. Gather Data (Single Source of Truth: marketState)
        const marketData = marketState.data[symbol];
        if (!marketData) return;

        // === BACKFILL THROTTLE (Optimization) ===
        // If MarketWatcher is currently backfilling this symbol, we skip calculations
        // to prevent churn. EXCEPT if we have no technicals yet (Initial Load UI needs data)
        if (marketWatcher.isBackfilling(symbol, timeframe)) {
            const hasTechnicals = !!marketData.technicals?.[timeframe];
            if (hasTechnicals) {
                if (import.meta.env.DEV && (timeframe === '15m' || timeframe === '30m')) {
                    logger.debug("technicals", `[ActiveManager] Skipping calculation for ${key} - Backfill in progress.`);
                }
                return;
            }
        }

        if (timeframe === '15m' || timeframe === '30m') {
             if (import.meta.env.DEV) {
                 logger.log("technicals", `[ActiveManager] performCalculation for ${key}. Has data? ${!!marketData.klines && !!marketData.klines[timeframe]} Len: ${marketData.klines?.[timeframe]?.length}`);
             }
        }

        const settings = indicatorState.toJSON();
        // Fallback: Legacy Object Path
        // Get history immediately from MarketState
        let history = (marketData.klines && marketData.klines[timeframe]) ? [...marketData.klines[timeframe]] : [];

        if (history.length === 0) return;

        // ✅ Apply historyLimit enforcement
        const limit = settings.historyLimit || 750;
        if (history.length > limit) {
            history = history.slice(-limit);

            if (import.meta.env.DEV) {
                logger.debug('technicals', `[ActiveManager] Applied historyLimit: ${history.length}/${limit} for ${key}`);
            }
        }

        // REAL-TIME SYNC:
        // Inject latest price (Ensure we clone to avoid mutating reactive array unexpectedly)
        if (marketData.lastPrice) {
            history = [...history]; // Fast shallow copy
            this.injectRealtimePrice(history, timeframe, marketData.lastPrice);
        }

        // Determine Mode: Initialize or Update
        // Check if we have initialized this worker
        const state = this.workerState.get(key);
        // Check if history shifted (new candle)
        // history includes the phantom/realtime candle if we injected it.
        const currentLastTime = history[history.length - 1].time;
        const currentSettingsHash = indicatorState._cachedJson;

        const needsInit = !state || !state.initialized || state.lastTime !== currentLastTime || state.settingsHash !== currentSettingsHash;

        // Wait, if lastTime changed (new candle), we treat it as "needsInit" for Phase 1 simplicity.
        // Or if we are in the SAME candle (lastTime == state.lastTime), we update.
        // Actually, if we injected a phantom candle, history has the NEW time.
        // If the *previous* run had a different time, then we have a new candle.

        // BUT: 'injectRealtimePrice' modifies the history array.
        // If the candle is still forming, the time is the same as the last run.
        // So:
        // 1. First run: !state -> Init.
        // 2. Second run (same candle): state.lastTime == currentLastTime -> Update.
        // 3. New Candle: state.lastTime != currentLastTime -> Init.

        let result;

        try {
            if (needsInit) {
                // INITIALIZE (Full History)
                // Note: We use the Object array for Init as `StatefulTechnicalsCalculator` expects Kline[].
                // We could use buffers but `calculateTechnicalsFromBuffers` is legacy stateless.
                // We need a new `technicalsService.initializeTechnicals`.

                result = await technicalsService.initializeTechnicals(
                    symbol, timeframe, history, settings
                );

                this.workerState.set(key, { initialized: true, lastTime: currentLastTime, settingsHash: currentSettingsHash });
            } else {
                // UPDATE (Single Tick)
                const lastK = history[history.length - 1];
                result = await technicalsService.updateTechnicals(
                    symbol, timeframe, lastK
                );
            }

            if (result) {
                this.handleResult(symbol, timeframe, marketData, result);
            }

        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            if (message === "Worker unavailable for update") {
                // Expected fallback behavior - just log debug and re-init next time
                if (import.meta.env.DEV) {
                    logger.debug("technicals", `[ActiveManager] Worker unavailable for update on ${key}, scheduling re-init.`);
                }
            } else {
                logger.error("technicals", `Calculation failed for ${key}`, e);
            }
            // On error, force re-init next time
            this.workerState.delete(key);
        }
    }

    private handleResult(symbol: string, timeframe: string, marketData: MarketData, result: TechnicalsData) {
        // Anti-Flicker: Check if content actually changed
        // Access technicals for this specific timeframe
        const currentTechnicals = marketData.technicals?.[timeframe];

        if (currentTechnicals && this.isTechnicalsEqual(currentTechnicals, result)) {
            // Skip update if data is effectively identical
            // This prevents Svelte reactivity from firing unnecessarily
            return;
        }

        result.lastUpdated = Date.now();

        // 5. Update State (Orchestrated via RAF)
        scheduler.schedule(() => {
            // Update specific timeframe slot
            marketState.updateSymbol(symbol, { technicals: { [timeframe]: result } });
        });
    }

    // Helper for deep equality – avoids JSON.stringify to reduce GC pressure on every tick.
    // Compares all TechnicalsData fields that can change between calculations.
    // Returns false (allow update) on any uncertainty – safe default for a dedup guard.
    private isTechnicalsEqual(a: TechnicalsData, b: TechnicalsData): boolean {
        // Fast path for references
        if (!a || !b) return false;

        // --- Summary (action + counts) ---
        if (a.summary?.action !== b.summary?.action) return false;
        if (a.summary?.buy !== b.summary?.buy) return false;
        if (a.summary?.sell !== b.summary?.sell) return false;
        if (a.summary?.neutral !== b.summary?.neutral) return false;

        // --- Confluence ---
        if (a.confluence?.score !== b.confluence?.score) return false;
        if (a.confluence?.level !== b.confluence?.level) return false;

        // --- Volatility (atr + Bollinger Bands) ---
        if (a.volatility?.atr?.toString() !== b.volatility?.atr?.toString()) return false;
        if (a.volatility?.bb?.upper !== b.volatility?.bb?.upper) return false;
        if (a.volatility?.bb?.middle !== b.volatility?.bb?.middle) return false;
        if (a.volatility?.bb?.lower !== b.volatility?.bb?.lower) return false;
        if (a.volatility?.bb?.percentP !== b.volatility?.bb?.percentP) return false;

        // --- Oscillators (compare all entries, not just index 0) ---
        if (a.oscillators?.length !== b.oscillators?.length) return false;
        if (a.oscillators) {
            for (let i = 0; i < a.oscillators.length; i++) {
                if (a.oscillators[i]?.value?.toString() !== b.oscillators[i]?.value?.toString()) return false;
                if (a.oscillators[i]?.action !== b.oscillators[i]?.action) return false;
            }
        }

        // --- Moving Averages (compare all entries) ---
        if (a.movingAverages?.length !== b.movingAverages?.length) return false;
        if (a.movingAverages) {
            for (let i = 0; i < a.movingAverages.length; i++) {
                if (a.movingAverages[i]?.value?.toString() !== b.movingAverages[i]?.value?.toString()) return false;
                if (a.movingAverages[i]?.action !== b.movingAverages[i]?.action) return false;
            }
        }

        // --- Pivots ---
        if (a.pivots?.classic?.p !== b.pivots?.classic?.p) return false;
        if (a.pivots?.classic?.r1 !== b.pivots?.classic?.r1) return false;
        if (a.pivots?.classic?.s1 !== b.pivots?.classic?.s1) return false;

        // --- Divergences (length + first entry as fast check) ---
        if (a.divergences?.length !== b.divergences?.length) return false;

        // --- Advanced indicators (spot-check the most volatile fields) ---
        if (a.advanced?.vwap !== b.advanced?.vwap) return false;
        if (a.advanced?.superTrend?.value !== b.advanced?.superTrend?.value) return false;
        if (a.advanced?.superTrend?.trend !== b.advanced?.superTrend?.trend) return false;
        if (a.advanced?.adx?.value !== b.advanced?.adx?.value) return false;
        if (a.advanced?.mfi?.value !== b.advanced?.mfi?.value) return false;
        if (a.advanced?.stochRsi?.k !== b.advanced?.stochRsi?.k) return false;
        if (a.advanced?.parabolicSar !== b.advanced?.parabolicSar) return false;
        if (a.advanced?.obv !== b.advanced?.obv) return false;
        if (a.advanced?.ichimoku?.action !== b.advanced?.ichimoku?.action) return false;
        if (a.advanced?.atrTrailingStop?.buy !== b.advanced?.atrTrailingStop?.buy) return false;
        if (a.advanced?.atrTrailingStop?.sell !== b.advanced?.atrTrailingStop?.sell) return false;

        return true;
    }

    // prepareBuffersWithRealtime has no callers anywhere in this class (or
    // outside it -- it was already private in the pre-split file). Carried
    // forward as-is per FEAT-0196's own note: it also never releases the
    // buffers it acquires from `pool`, so whether to keep it, fix it, or drop
    // it is a deliberate call for whoever next touches this file, not
    // something to change silently in a behaviour-preserving split.
    prepareBuffersWithRealtime(original: KlineBuffers, timeframe: string, price: Decimal | null): KlineBuffers {
        const len = original.times.length;
        if (len === 0) return original; // Should typically clone even here? But empty is empty.

        // Determine if we update last or append
        const lastTime = original.times[len - 1];
        let updateType: 'none' | 'update' | 'append' = 'none';
        let currentPeriodStart = lastTime;

        if (price) {
            const now = Date.now();
            const intervalMs = getIntervalMs(timeframe);
            currentPeriodStart = Math.floor(now / intervalMs) * intervalMs;

            if (lastTime === currentPeriodStart) updateType = 'update';
            else if (currentPeriodStart > lastTime) updateType = 'append';
        }

        // Allocate new buffers
        const newLen = updateType === 'append' ? len + 1 : len;

        // Helper to allocate and copy (using Pool)
        const createAndCopy = (src: Float64Array) => {
            const dest = this.pool.acquire(newLen);
            dest.set(src);
            return dest;
        };

        const b: KlineBuffers = {
            times: createAndCopy(original.times),
            opens: createAndCopy(original.opens),
            highs: createAndCopy(original.highs),
            lows: createAndCopy(original.lows),
            closes: createAndCopy(original.closes),
            volumes: createAndCopy(original.volumes),
        };

        // Apply Realtime Update
        if (updateType === 'update' && price) {
            const priceNum = price.toNumber();
            const idx = len - 1;

            // Logic: High = Max(High, Price), Low = Min(Low, Price), Close = Price
            const oldHigh = b.highs[idx];
            const oldLow = b.lows[idx];

            b.closes[idx] = priceNum;
            if (priceNum > oldHigh) b.highs[idx] = priceNum;
            if (priceNum < oldLow) b.lows[idx] = priceNum;
        }
        else if (updateType === 'append' && price) {
            const priceNum = price.toNumber();
            const idx = len;

            b.times[idx] = currentPeriodStart;
            b.opens[idx] = priceNum;
            b.highs[idx] = priceNum;
            b.lows[idx] = priceNum;
            b.closes[idx] = priceNum;
            b.volumes[idx] = 0; // Phantom candle volume
        }

        return b;
    }

    // Stateless Helper: mutates a copy of the history array found in memory
    // `symbol` was accepted and unused — this helper only ever mutates the
    // history array handed to it, so it never needed the caller's symbol.
    private injectRealtimePrice(history: Kline[], timeframe: string, price: Decimal) {
        if (history.length === 0) return;

        const lastIdx = history.length - 1;
        const lastCandle = { ...history[lastIdx] }; // Clone to avoid mutating state directly outside action

        const now = Date.now();
        const intervalMs = getIntervalMs(timeframe);
        const currentPeriodStart = Math.floor(now / intervalMs) * intervalMs;

        if (lastCandle.time === currentPeriodStart) {
            // Update the clone
            let high = lastCandle.high instanceof Decimal ? lastCandle.high : new Decimal(lastCandle.high);
            let low = lastCandle.low instanceof Decimal ? lastCandle.low : new Decimal(lastCandle.low);

            if (price.greaterThan(high)) high = price;
            if (price.lessThan(low)) low = price;

            lastCandle.close = price;
            lastCandle.high = high;
            lastCandle.low = low;

            history[lastIdx] = lastCandle;
        } else if (currentPeriodStart > lastCandle.time) {
            // New phantom candle for pending period
            // Volume Fix: Phantom candles should start with 0 volume to avoid spikes in Volume-based indicators (OBV, MFI)
            // UNLESS we get real info from ticker, but Ticker Volume is 24h, not 1m/5m.
            // Using "Proxy Volume" caused huge spikes. Better to use 0 or very small epsilon.
            // Most indicators handle 0 volume gracefully (no change).

            const newCandle: Kline = {
                time: currentPeriodStart,
                open: price,
                high: price,
                low: price,
                close: price,
                volume: new Decimal(0) // Fixed: 0 volume for phantom candle to prevent jumping indicators
            };
            history.push(newCandle);
        }
    }
}
