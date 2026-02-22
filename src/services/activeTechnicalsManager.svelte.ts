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

/*
 * Copyright (C) 2026 MYDCT
 *
 * Active Technicals Manager
 * Orchestrates background calculation of technical indicators for subscribed symbols.
 * Ensures data is updated in real-time regardless of UI state.
 */

import { untrack } from "svelte";
import { marketState } from "../stores/market.svelte";
import { scheduler } from "../utils/scheduler";
import { indicatorState } from "../stores/indicator.svelte";
import { settingsState } from "../stores/settings.svelte";
import { favoritesState } from "../stores/favorites.svelte";
import { tradeState } from "../stores/trade.svelte";
import { technicalsService } from "./technicalsService";
import { marketWatcher } from "./marketWatcher";
import { browser } from "$app/environment";
import { normalizeTimeframeInput, getIntervalMs, parseTimestamp } from "../utils/utils";
import { logger } from "./logger";
import { Decimal } from "decimal.js";
import type { Kline, KlineBuffers } from "./technicalsTypes";
import { networkMonitor } from "../utils/networkMonitor";
import { BufferPool } from "../utils/bufferPool";
import { idleMonitor } from "../utils/idleMonitor.svelte";


class ActiveTechnicalsManager {
    // Ref counting: `symbol:timeframe` -> count
    private subscribers = new Map<string, number>();

    // Active effects cleanups: `symbol:timeframe` -> cleanup function
    private activeEffects = new Map<string, () => void>();

    // Throttle timers: `symbol:timeframe` -> timer ID
    private throttles = new Map<string, ReturnType<typeof setTimeout>>();

    // 🌟 Pro-Level: Visibility & Debounce State
    private visibleSymbols = new Set<string>();
    private lastActiveSymbolChange = 0;
    private lastActiveSymbol = "";

    // State Tracking for Worker Initialization
    // lastCommittedTime: timestamp of the LAST CLOSED candle seen during init.
    // Phantom candles for the live period do NOT change lastCommittedTime.
    private workerState = new Map<string, { initialized: boolean, lastCommittedTime: number }>();

    // Memory Management: Reuse buffers to prevent GC spikes
    private pool = new BufferPool();

    // Page Visibility State
    private isTabVisible = true;
    private pausedCalculations = new Set<string>();

    constructor() {
        // Singleton
        
        // Page Visibility API: Pause calculations when tab is hidden
        if (browser && typeof document !== 'undefined') {
            this.isTabVisible = !document.hidden;
            
            document.addEventListener('visibilitychange', () => {
                this.handleVisibilityChange();
            });
        }
    }

    /**
     * Handle Page Visibility API changes.
     * Pauses non-critical calculations when tab is hidden.
     */
    private handleVisibilityChange() {
        const wasVisible = this.isTabVisible;
        this.isTabVisible = !document.hidden;

        if (!this.isTabVisible && wasVisible) {
            // Tab just became hidden - pause non-critical calculations
            logger.log('general', '[ActiveManager] Tab hidden - pausing non-critical calculations');
            this.pauseNonCriticalCalculations();
        } else if (this.isTabVisible && !wasVisible) {
            // Tab just became visible - resume calculations
            logger.log('general', '[ActiveManager] Tab visible - resuming calculations');
            this.resumeCalculations();
        }
    }

    /**
     * Pause all calculations except Takt 1 (active symbol).
     */
    private pauseNonCriticalCalculations() {
        const activeSymbol = tradeState.symbol;
        
        for (const [key, timerId] of this.throttles.entries()) {
            const [symbol] = key.split(':');
            
            // Keep active symbol running
            if (symbol === activeSymbol) continue;
            
            // Cancel timer and mark as paused
            clearTimeout(timerId);
            this.throttles.delete(key);
            this.pausedCalculations.add(key);
        }
    }

    /**
     * Resume paused calculations with lower priority.
     */
    private resumeCalculations() {
        for (const key of this.pausedCalculations) {
            const [symbol, timeframe] = key.split(':');
            
            // Resume with a slight delay to avoid thundering herd
            setTimeout(() => {
                this.scheduleCalculation(symbol, timeframe);
            }, Math.random() * 1000); // Stagger 0-1s
        }
        
        this.pausedCalculations.clear();
    }

    /**
     * Takt 2 Control: Set visibility status for viewport sensing.
     * Called by UI components via IntersectionObserver.
     */
    setSymbolVisibility(symbol: string, isVisible: boolean) {
        if (!symbol) return;

        if (isVisible) {
            this.visibleSymbols.add(symbol);
            // If became visible, ensure we have data soon
            // Trigger calculation for default timeframe if not already running
            const tf = tradeState.analysisTimeframe || "1h";
            this.scheduleCalculation(symbol, tf);
        } else {
            this.visibleSymbols.delete(symbol);
        }
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
     * Force an immediate calculation, bypassing any backfill throttles.
     * Used after a backfill finishes to ensure store is up-to-date.
     */
    public forceRefresh(symbol: string, timeframe: string) {
        // Clear state to force full re-initialization with new history
        this.workerState.delete(`${symbol}:${timeframe}`);
        this.performCalculation(symbol, timeframe);
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

                // === FIX: Cleanup Worker State ===
                technicalsService.cleanupTechnicals(symbol, timeframe);
                this.workerState.delete(key);
            } else {
                this.subscribers.set(key, count - 1);
            }
        }
    }

    private startMonitoring(symbol: string, timeframe: string) {
        const key = `${symbol}:${timeframe}`;

        // 1. Ensure Market Watcher provides price/ticker/klines for updates
        marketWatcher.register(symbol, "price", "stateless");
        marketWatcher.register(symbol, "ticker", "stateless");
        // Register for klines without triggering deep history (stateless)
        marketWatcher.register(symbol, `kline_${timeframe}`, "stateless");

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
        marketWatcher.unregister(symbol, "price", "stateless");
        marketWatcher.unregister(symbol, "ticker", "stateless");
        marketWatcher.unregister(symbol, `kline_${timeframe}`, "stateless");

        if (import.meta.env.DEV) {
            logger.debug("technicals", `[ActiveManager] Stopped monitoring ${key}`);
        }
    }

    private scheduleCalculation(symbol: string, timeframe: string) {
        const key = `${symbol}:${timeframe}`;
        // If already scheduled, don't overwrite (unless we want to support urgency upgrades? Keep simple for now)
        if (this.throttles.has(key)) return;

        // --- 3-Tact Strategy Logic ---

        const isActiveSymbol = tradeState.symbol === symbol;

        // Debounce Detection
        if (isActiveSymbol && symbol !== this.lastActiveSymbol) {
            this.lastActiveSymbol = symbol;
            this.lastActiveSymbolChange = Date.now();
        }

        const isVisible = this.visibleSymbols.has(symbol) || isActiveSymbol;
        const isFavorite = favoritesState.items.slice(0, 10).includes(symbol);

        let delay = 60000; // Default Takt 3: Idle/Cached (very slow updates)

        if (isActiveSymbol) {
            // === TAKT 1: HIGH FREQUENCY (Realtime) ===
            const timeSinceSwitch = Date.now() - this.lastActiveSymbolChange;

            // [IDLE OPTIMIZATION]
            if (idleMonitor.isUserIdle) {
                delay = 1000; // Slow down to 1s if idle
            } else if (timeSinceSwitch < 200) {
                // Debounce: If switched < 200ms ago, impose small wait
                delay = 200;
            } else {
                // Use User Settings
                let userInterval = settingsState.technicalsUpdateInterval;
                if (!userInterval) {
                    const mode = settingsState.technicalsUpdateMode || 'balanced';
                    if (mode === 'realtime') userInterval = 100;
                    else if (mode === 'fast') userInterval = 250;
                    else if (mode === 'conservative') userInterval = 2000;
                    else userInterval = 500; // balanced
                }
                delay = userInterval;
            }
        } else if (isVisible) {
            // === TAKT 2: BACKGROUND / VISIBLE (Dashboard) ===
            const baseInterval = Math.max(5000, (settingsState.marketAnalysisInterval || 10) * 1000);
            const jitter = Math.floor(Math.random() * 500);

            if (idleMonitor.isUserIdle) {
                delay = baseInterval * 2; // Double interval if idle
            } else {
                delay = baseInterval + jitter;
            }

        } else if (isFavorite) {
            // === TAKT 3: HIDDEN FAVORITE ===
            // Keep warm but slow
            delay = 30000;
        }

        // Global Throttle on Blur (Sleep Mode)
        // If hidden (not just blurred), we might want to pause completely?
        // But Page Visibility API handles "hidden" via handleVisibilityChange -> pauseNonCriticalCalculations.
        // This check detects "blur" (window visible but not focused).
        if (settingsState.pauseAnalysisOnBlur && typeof document !== "undefined" && !document.hasFocus() && !isActiveSymbol) {
            delay = delay * 3;
        }

        // [IDLE + HIDDEN] Extreme Throttling
        if (typeof document !== 'undefined' && document.hidden) {
             delay = Math.max(delay, 10000); // Min 10s if hidden
        }

        // Connection-Aware Scaling (Pro Feature)
        // Dynamically adjust update rate based on network quality (e.g. Mobile Hotspot)
        const networkInhibitor = networkMonitor.getThrottleMultiplier();
        if (networkInhibitor > 1.0) {
            delay = delay * networkInhibitor;
            if (isActiveSymbol && import.meta.env.DEV) {
                // Warn dev about throttling
                console.debug(`[ActiveManager] Network Throttling Active: ${networkInhibitor}x slowdown`);
            }
        }

        // Skip scheduling if tab is hidden (handled by Page Visibility API)
        if (!this.isTabVisible && !isActiveSymbol) {
            this.pausedCalculations.add(key);
            return;
        }

        // Takt 1: Active Symbol → setTimeout (highest priority, realtime)
        if (isActiveSymbol) {
            this.throttles.set(key, setTimeout(() => {
                this.throttles.delete(key);
                this.performCalculation(symbol, timeframe);
            }, delay));
        }
        // Takt 2/3: Non-active symbols → requestIdleCallback (low priority)
        else {
            const callback = (deadline?: IdleDeadline) => {
                // Only execute if enough time remaining (min 10ms) or timeout occurred
                if (!deadline || deadline.timeRemaining() > 10 || deadline.didTimeout) {
                    this.throttles.delete(key);
                    this.performCalculation(symbol, timeframe);
                } else {
                    // Not enough time - reschedule
                    this.scheduleIdleCallback(key, symbol, timeframe, delay);
                }
            };

            // Use requestIdleCallback with polyfill fallback
            const requestIdleCb = this.getRequestIdleCallback();
            const handle = requestIdleCb(callback, { timeout: delay }) as any;
            this.throttles.set(key, handle);
        }
    }

    /**
     * Schedule calculation using requestIdleCallback.
     * Helper method for rescheduling when not enough idle time is available.
     */
    private scheduleIdleCallback(key: string, symbol: string, timeframe: string, delay: number) {
        const callback = (deadline?: IdleDeadline) => {
            if (!deadline || deadline.timeRemaining() > 10 || deadline.didTimeout) {
                this.throttles.delete(key);
                this.performCalculation(symbol, timeframe);
            } else {
                // Still not enough time - reschedule again
                this.scheduleIdleCallback(key, symbol, timeframe, delay);
            }
        };

        const requestIdleCb = this.getRequestIdleCallback();
        const handle = requestIdleCb(callback, { timeout: delay }) as any;
        this.throttles.set(key, handle);
    }

    /**
     * Get requestIdleCallback with polyfill fallback for older browsers.
     */
    private getRequestIdleCallback(): (callback: (deadline?: IdleDeadline) => void, options?: { timeout: number }) => number {
        if (typeof window !== 'undefined' && window.requestIdleCallback) {
            return window.requestIdleCallback.bind(window);
        }

        // Polyfill: Use setTimeout with simulated IdleDeadline
        return (callback: (deadline?: IdleDeadline) => void, options?: { timeout: number }) => {
            const start = Date.now();
            return setTimeout(() => {
                callback({
                    didTimeout: false,
                    timeRemaining: () => Math.max(0, 50 - (Date.now() - start))
                } as IdleDeadline);
            }, 1) as any;
        };
    }

        // Helper for deep equality
    private isTechnicalsEqual(a: any, b: any): boolean {
        // Fast path for references
        if (!a || !b) return false;
        if (a === b) return true;

        // Specific field checks for efficiency
        if (a.summary?.action !== b.summary?.action) return false;
        if (a.confluence?.score !== b.confluence?.score) return false;
        if (a.oscillators?.length !== b.oscillators?.length) return false;
        if (a.movingAverages?.length !== b.movingAverages?.length) return false;

        // Volatility Deep Check
        const volA = a.volatility;
        const volB = b.volatility;
        if (!volA && !volB) {} // Equal (both undefined)
        else if (!volA || !volB) return false; // One is undefined
        else {
             if (volA.atr?.toString() !== volB.atr?.toString()) return false;
             // Check BB
             const bbA = volA.bb;
             const bbB = volB.bb;
             if (!bbA && !bbB) {}
             else if (!bbA || !bbB) return false;
             else {
                 if (bbA.middle?.toString() !== bbB.middle?.toString()) return false;
                 if (bbA.upper?.toString() !== bbB.upper?.toString()) return false;
                 if (bbA.lower?.toString() !== bbB.lower?.toString()) return false;
             }
        }

        // Oscillators Deep Check (Sample critical ones like RSI, StochRSI)
        // Since we map them in update(), references are new.
        for (let i = 0; i < (a.oscillators?.length || 0); i++) {
            const oscA = a.oscillators[i];
            const oscB = b.oscillators[i];
            if (oscA.name !== oscB.name) return false;
            if (oscA.value?.toString() !== oscB.value?.toString()) return false;
            if (oscA.action !== oscB.action) return false;
            if (oscA.signal?.toString() !== oscB.signal?.toString()) return false; // StochRSI signal
        }

        // Moving Averages (Compare all)
        if (a.movingAverages?.length !== b.movingAverages?.length) return false;
        for (let i = 0; i < (a.movingAverages?.length || 0); i++) {
            const maA = a.movingAverages[i];
            const maB = b.movingAverages[i];
            if (maA.name !== maB.name) return false;
            if (maA.params !== maB.params) return false;
            if (maA.value?.toString() !== maB.value?.toString()) return false;
            if (maA.action !== maB.action) return false;
        }

        return true;
    }


    private async performCalculation(symbol: string, timeframe: string) {
        const key = `${symbol}:${timeframe}`;

        // 1. Gather Data (Single Source of Truth: marketState)
        const marketData = marketState.data[symbol];
        if (!marketData) return;

        // === BACKFILL THROTTLE (Optimization) ===
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
        const enabledIndicators = $state.snapshot(settingsState.enabledIndicators);

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
        // Inject latest price
        if (marketData.lastPrice) {
            this.injectRealtimePrice(history, timeframe, marketData.lastPrice, symbol);
        }

        // Determine Mode: Initialize, Shift, or Update
        const state = this.workerState.get(key);
        const len = history.length;
        const currentLastTime = history[len - 1].time;

        const intervalMs = getIntervalMs(timeframe);
        const currentPeriodStart = Math.floor(Date.now() / intervalMs) * intervalMs;
        const isPhantomAppended = currentLastTime === currentPeriodStart && len >= 2
            && history[len - 2].time !== currentPeriodStart;

        // The timestamp of the last fully closed candle
        const lastCommittedTime = isPhantomAppended
            ? history[len - 2].time
            : currentLastTime;

                // Determine Actions
        const needsInit = !state || !state.initialized;

        // Check gap size for shifting
        // lastCommittedTime is timestamp of newly closed candle (or current forming if just opened)
        // state.lastCommittedTime is timestamp of PREVIOUSLY closed candle

        // Calculate gap in number of intervals
        // Note: intervalMs is in milliseconds.
        // If state.lastCommittedTime = 100, lastCommittedTime = 104, gap = 4.
        const gap = state && state.initialized
            ? (lastCommittedTime - state.lastCommittedTime) / intervalMs
            : 0;

        const needsShift = state && state.initialized && gap === 1;
        const needsReinit = state && state.initialized && gap > 1;

        let result;

        try {
            if (needsInit || needsReinit) {
                // INITIALIZE (Full History)
                // Fallback for cold start OR multi-candle gap
                result = await technicalsService.initializeTechnicals(
                    symbol, timeframe, history, settings, enabledIndicators, isPhantomAppended
                );

                this.workerState.set(key, { initialized: true, lastCommittedTime });
            } else if (needsShift) {
                // SHIFT + UPDATE
                // We have moved to a new candle (gap === 1). Commit the previous closed candle.

                let closedCandle = isPhantomAppended ? history[len - 2] : history[len - 1];

                await technicalsService.shiftTechnicals(symbol, timeframe, closedCandle);

                // Now calculate the current live tick
                const lastK = history[history.length - 1];
                result = await technicalsService.updateTechnicals(
                    symbol, timeframe, lastK
                );

                this.workerState.set(key, { initialized: true, lastCommittedTime });
            } else {
                // UPDATE (Single Tick)
                // Same candle period (gap === 0)
                const lastK = history[history.length - 1];
                result = await technicalsService.updateTechnicals(
                    symbol, timeframe, lastK
                );
            }

            if (result) {
                this.handleResult(symbol, timeframe, marketData, result);
            }


                } catch (e: any) {
            if (e.message === "Worker unavailable for update" || e.message === "Worker unavailable for shift" || e.message === "CALCULATOR_NOT_FOUND") {
                if (import.meta.env.DEV) {
                    logger.debug("technicals", `[ActiveManager] Worker state invalid for ${key} (${e.message}), scheduling re-init.`);
                }
            } else {
                logger.error("technicals", `Calculation failed for ${key}`, e);
            }
            // On error, force re-init next time
            this.workerState.delete(key);
        }

    }


    private handleResult(symbol: string, timeframe: string, marketData: any, result: any) {
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

    private prepareBuffersWithRealtime(original: KlineBuffers, timeframe: string, price: Decimal | null): KlineBuffers {
        const intervalMs = getIntervalMs(timeframe);
        const len = original.times.length;
        if (len === 0) return original; // Should typically clone even here? But empty is empty.

        // Determine if we update last or append
        const lastTime = original.times[len - 1];
        let updateType: 'none' | 'update' | 'append' = 'none';
        let currentPeriodStart = lastTime;

        if (price) {
            const now = Date.now();
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
    private injectRealtimePrice(history: Kline[], timeframe: string, price: Decimal, symbol: string) {
        const intervalMs = getIntervalMs(timeframe);
        if (history.length === 0) return;

        const lastIdx = history.length - 1;
        const lastCandle = { ...history[lastIdx] }; // Clone to avoid mutating state directly outside action

        const now = Date.now();
        const currentPeriodStart = Math.floor(now / intervalMs) * intervalMs;

        if (lastCandle.time === currentPeriodStart) {
            // Update the clone
            let close = price;
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

export const activeTechnicalsManager = new ActiveTechnicalsManager();
