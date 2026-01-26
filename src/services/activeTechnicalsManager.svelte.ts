/*
 * Copyright (C) 2026 MYDCT
 *
 * Active Technicals Manager
 * Orchestrates background calculation of technical indicators for subscribed symbols.
 * Ensures data is updated in real-time regardless of UI state.
 */

import { untrack } from "svelte";
import { marketState } from "../stores/market.svelte";
import { indicatorState } from "../stores/indicator.svelte";
import { technicalsService } from "./technicalsService";
import { marketWatcher } from "./marketWatcher";
import { browser } from "$app/environment";
import { normalizeTimeframeInput, getIntervalMs, parseTimestamp } from "../utils/utils";
import { logger } from "./logger";
import { Decimal } from "decimal.js";
import type { Kline } from "./technicalsTypes";

class ActiveTechnicalsManager {
    // Ref counting: `symbol:timeframe` -> count
    private subscribers = new Map<string, number>();

    // Active effects cleanups: `symbol:timeframe` -> cleanup function
    private activeEffects = new Map<string, () => void>();

    // Throttle timers: `symbol:timeframe` -> timer ID
    private throttles = new Map<string, any>();

    private readonly CALCULATION_THROTTLE_MS = 250;
    // Lower than 1s to feel "realtime", but throttled to save CPU on crazy volatility

    constructor() {
        // Singleton
    }

    /**
     * Subscribe to updates for a symbol/timeframe pair.
     * Ensures market data is being watched and calculations are running.
     */
    register(symbol: string, timeframe: string) {
        if (!browser || !symbol || !timeframe) return;

        const key = `${symbol}:${timeframe}`;
        const count = this.subscribers.get(key) || 0;
        this.subscribers.set(key, count + 1);

        if (count === 0) {
            this.startMonitoring(symbol, timeframe);
        }
    }

    /**
     * Unsubscribe.
     * Stops calculations if no more subscribers exist.
     */
    unregister(symbol: string, timeframe: string) {
        if (!browser || !symbol || !timeframe) return;

        const key = `${symbol}:${timeframe}`;
        const count = this.subscribers.get(key);

        if (count && count > 0) {
            if (count === 1) {
                this.subscribers.delete(key);
                this.stopMonitoring(symbol, timeframe);
            } else {
                this.subscribers.set(key, count - 1);
            }
        }
    }

    private startMonitoring(symbol: string, timeframe: string) {
        const key = `${symbol}:${timeframe}`;

        // 1. Ensure Market Watcher provides the data
        marketWatcher.register(symbol, `kline_${timeframe}`);
        marketWatcher.register(symbol, "price"); // Ensure we have latest price for real-time candle updates

        // 2. Start Reactive Effect
        // We use $effect.root because we are outside component context
        const cleanup = $effect.root(() => {
            $effect(() => {
                // Dependencies we track:
                const data = marketState.data[symbol];
                if (!data) return;

                // Track kline updates
                // We need to access the specific kline entry to trigger on update
                const klineData = data.klines[timeframe];

                // Also track price for real-time updates (formation of current candle)
                const currentPrice = data.lastPrice;

                untrack(() => {
                    if (klineData || currentPrice) {
                        this.scheduleCalculation(symbol, timeframe);
                    }
                });
            });
        });

        this.activeEffects.set(key, cleanup);

        if (import.meta.env.DEV) {
            logger.debug("technicals", `[ActiveManager] Started monitoring ${key}`);
        }
    }

    private stopMonitoring(symbol: string, timeframe: string) {
        const key = `${symbol}:${timeframe}`;

        // 1. Stop Effect
        const cleanup = this.activeEffects.get(key);
        if (cleanup) {
            cleanup();
            this.activeEffects.delete(key);
        }

        // 2. Clear Timers
        if (this.throttles.has(key)) {
            clearTimeout(this.throttles.get(key));
            this.throttles.delete(key);
        }

        // 3. Unregister from Market Watcher
        marketWatcher.unregister(symbol, `kline_${timeframe}`);
        marketWatcher.unregister(symbol, "price");

        if (import.meta.env.DEV) {
            logger.debug("technicals", `[ActiveManager] Stopped monitoring ${key}`);
        }
    }

    private scheduleCalculation(symbol: string, timeframe: string) {
        const key = `${symbol}:${timeframe}`;

        if (this.throttles.has(key)) return; // Already scheduled

        this.throttles.set(key, setTimeout(() => {
            this.throttles.delete(key);
            this.performCalculation(symbol, timeframe);
        }, this.CALCULATION_THROTTLE_MS));
    }

    private async performCalculation(symbol: string, timeframe: string) {
        // 1. Gather Data
        // We construct the "History" + "Current Realtime Candle" similar to how TechnicalsPanel did
        const marketData = marketState.data[symbol];
        if (!marketData) return;

        // We assume apiService/marketWatcher populates klines history.
        // However, marketState.klines might just be the latest one if not correctly managed.
        // WAIT: marketState.klines[tf] seems to scale to hold ONE kline object in `updateSymbolKlines` in `marketWatcher`?
        // Let's re-read marketWatcher.ts lines 373-382:
        // It calls `apiService.fetch...` which returns an ARRAY.
        // `updateSymbolKlines` in market.svelte.ts line 260 iterates and SETS `current.klines[timeframe] = ...`.
        // It overwrites! `marketState` currently DOES NOT store history for klines, only the latest update? 
        //
        // CHECK: `market.svelte.ts`:
        // klines: Record<string, { open... }> 
        // It maps timeframe -> Single Kline Object?
        //
        // NO, wait. `marketState.data[symbol].klines` is `Record<string, KlineObject>`.
        // It seems `marketState` is designed to hold only the *latest* kline update from WS stream?
        //
        // BUT `TechnicalsPanel` maintained its OWN `klinesHistory`.
        //
        // ISSUE FOUND: If I move logic to Service, the Service needs the HISTORY.
        // `marketState` does NOT seem to hold history.
        //
        // OPTION: `ActiveTechnicalsManager` must manage history for the active symbols.
        // OR: We expand `marketState` to hold history.
        //
        // Expanding `marketState` to hold history for all subscribed symbols might be heavy if not careful, 
        // but `ActiveTechnicalsManager` is exactly the place to manage this "active working set".
        // 
        // I will store the history INSIDE `ActiveTechnicalsManager` (or a dedicated store for it)
        // to keep `marketState` lightweight for just "latest values".
        //
        // Let's recall `TechnicalsPanel.svelte` lines 32: `let klinesHistory: Kline[] = $state([]);`
        //
        // Plan adjustment: `ActiveTechnicalsManager` will maintain `historyCache` for its subscribers.

        const key = `${symbol}:${timeframe}`;
        let history = this.historyCache.get(key) || [];

        // If history is empty, we must Fetch it.
        if (history.length === 0) {
            await this.fetchInitialData(symbol, timeframe);
            // The fetch will trigger recursion via new data availability if we are careful, 
            // or we just continue after await.
            history = this.historyCache.get(key) || [];
            if (history.length === 0) return;
        }

        // Logic to merge "Realtime Tick" into History
        // This duplicates logic from TechnicalsPanel.handleRealTimeUpdate
        // We need the "Realtime Tick" from marketState
        const lastKlineUpdate = marketData.klines[timeframe];
        // AND the current price ticker for the very latest live movement
        // Actually, `marketData.klines` from WS stream IS the realtime kline update usually.
        // But `marketData.lastPrice` is faster.

        // Let's replicate `TechnicalsPanel` logic:
        // It took `klinesHistory` (fetched via REST)
        // And updated the last candle with `handleRealTimeUpdate` using `currentKline` (WS)

        // We need to keep this history updated.

        if (lastKlineUpdate) {
            this.updateHistoryWithKline(key, lastKlineUpdate, timeframe);
        }

        // Now calculate
        const settings = indicatorState; // Global indicator settings

        try {
            if (import.meta.env.DEV) {
                console.log(`[RT-TECH] Calcing ${key} | History: ${history.length} | Price: ${marketData.lastPrice}`);
            }
            const result = await technicalsService.calculateTechnicals(this.historyCache.get(key) || [], settings);


            // Inject timestamp
            if (result) {
                result.lastUpdated = Date.now();
            }

            // Push result back to MarketState so UI can see it
            marketState.updateSymbol(symbol, { technicals: result });

        } catch (e) {
            logger.error("technicals", `Calculation failed for ${key}`, e);
        }
    }

    // --- History Management ---
    private historyCache = new Map<string, Kline[]>();

    private async fetchInitialData(symbol: string, timeframe: string) {
        try {
            const limit = (indicatorState.historyLimit || 750) + 50;
            // Accessing `apiService` from imports
            const { apiService } = await import("./apiService");

            const klines = await apiService.fetchBitunixKlines(symbol, timeframe, limit);
            if (klines && klines.length > 0) {
                this.historyCache.set(`${symbol}:${timeframe}`, klines);
            }
        } catch (e) {
            logger.error("technicals", `Initial fetch failed for ${symbol}:${timeframe}`, e);
        }
    }

    private updateHistoryWithKline(key: string, newKline: any, timeframe: string) {
        let history = this.historyCache.get(key);
        if (!history) return;

        const rawTime = parseTimestamp(newKline.time);
        const intervalMs = getIntervalMs(timeframe);
        const alignedTime = Math.floor(rawTime / intervalMs) * intervalMs;

        // Convert to Decimal
        const close = newKline.close instanceof Decimal ? newKline.close : new Decimal(newKline.close);
        const open = newKline.open instanceof Decimal ? newKline.open : new Decimal(newKline.open);
        const high = newKline.high instanceof Decimal ? newKline.high : new Decimal(newKline.high);
        const low = newKline.low instanceof Decimal ? newKline.low : new Decimal(newKline.low);
        const volume = newKline.volume instanceof Decimal ? newKline.volume : new Decimal(newKline.volume || 0);

        const candleObj: Kline = {
            time: alignedTime,
            open, high, low, close, volume
        };

        const lastIdx = history.length - 1;
        const lastItem = history[lastIdx];

        if (alignedTime > lastItem.time) {
            // New Candle
            history.push(candleObj);
            // Prune
            const limit = (indicatorState.historyLimit || 1000) + 100;
            if (history.length > limit) {
                history = history.slice(-limit);
            }
        } else if (alignedTime === lastItem.time) {
            // Update existing
            history[lastIdx] = candleObj;
        }

        this.historyCache.set(key, history);
    }
}

export const activeTechnicalsManager = new ActiveTechnicalsManager();
