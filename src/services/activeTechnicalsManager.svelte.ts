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
        marketWatcher.register(symbol, "ticker"); // Ensure we have latest price for real-time candle updates

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
        marketWatcher.unregister(symbol, "ticker");

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
        // 1. Gather Data (Single Source of Truth: marketState)
        const marketData = marketState.data[symbol];
        if (!marketData) return;

        // Get history immediately from MarketState
        let history = (marketData.klines && marketData.klines[timeframe]) ? [...marketData.klines[timeframe]] : [];

        if (history.length === 0) return;

        const key = `${symbol}:${timeframe}`;

        // REAL-TIME SYNC:
        // Inject latest price
        if (marketData.lastPrice) {
            this.injectRealtimePrice(history, timeframe, marketData.lastPrice);
        }

        // Now calculate
        const settings = indicatorState;

        try {
            const result = await technicalsService.calculateTechnicals(history, settings);

            // Inject timestamp
            if (result) {
                result.lastUpdated = Date.now();
            }

            // Push result back to MarketState
            marketState.updateSymbol(symbol, { technicals: result });

        } catch (e) {
            logger.error("technicals", `Calculation failed for ${key}`, e);
        }
    }

    // Stateless Helper: mutates a copy of the history array found in memory
    private injectRealtimePrice(history: Kline[], timeframe: string, price: Decimal) {
        if (history.length === 0) return;

        const lastIdx = history.length - 1;
        const lastCandle = { ...history[lastIdx] }; // Clone to avoid mutating state directly outside action

        const now = Date.now();
        const intervalMs = getIntervalMs(timeframe);
        const currentPeriodStart = Math.floor(now / intervalMs) * intervalMs;

        if (lastCandle.time === currentPeriodStart) {
            // Update the clone
            let close = price;
            // Ensure we respect existing High/Low unless broken by new price
            // Using Decimal comparison methods for safety
            let high = lastCandle.high instanceof Decimal ? lastCandle.high : new Decimal(lastCandle.high);
            let low = lastCandle.low instanceof Decimal ? lastCandle.low : new Decimal(lastCandle.low);

            if (price.greaterThan(high)) high = price;
            if (price.lessThan(low)) low = price;

            lastCandle.close = price;
            lastCandle.high = high;
            lastCandle.low = low;

            // Preserve volume!
            // If the candle came from WebSocket kline update, it has volume.
            // If it was a phantom candle from previous tick, it might have 0.
            // We do NOT reset it to 0 here.

            history[lastIdx] = lastCandle;
        } else if (currentPeriodStart > lastCandle.time) {
            // New phantom candle for pending period
            // We must start with volume 0 as we only have price info from Ticker.
            // The next 'market_kline' update via WS will fill in the volume.
            const newCandle: Kline = {
                time: currentPeriodStart,
                open: price,
                high: price,
                low: price,
                close: price,
                volume: new Decimal(0)
            };
            history.push(newCandle);
        }
    }
}

export const activeTechnicalsManager = new ActiveTechnicalsManager();
