/*
 * Copyright (C) 2026 MYDCT
 *
 * Active Technicals Manager (Optimized for Svelte 5)
 * Manages which symbols get calculated based on visibility and activity.
 */

import { marketState } from "../stores/market.svelte";
import { tradeState } from "../stores/trade.svelte";
import { settingsState } from "../stores/settings.svelte";
import { indicatorState } from "../stores/indicator.svelte";
import { marketWatcher } from "./marketWatcher";
import { technicalsService } from "./technicalsService";
import { logger } from "./logger";
import { browser } from "$app/environment";
import { favoritesState } from "../stores/favorites.svelte";
import { idleMonitor } from "../utils/idleMonitor.svelte";
import { scheduler } from "../utils/scheduler";
import { Decimal } from "decimal.js";
import { getIntervalMs } from "../utils/utils";
import { BufferPool } from "../utils/bufferPool";
import type { Kline, KlineBuffers } from "./technicalsTypes";

interface WorkerState {
    initialized: boolean;
    lastCommittedTime: number; // Timestamp of the last fully processed candle
}

interface ThrottleHandle {
    id: any;
    type: 'timeout' | 'idle';
}

class ActiveTechnicalsManager {
    // Track calculation throttles/timers
    private throttles = new Map<string, ThrottleHandle>();
    private activeEffects = new Map<string, () => void>();
    private subscribers = new Map<string, number>();

    // Priority Management
    private visibleSymbols = new Set<string>();
    private lastActiveSymbol: string | null = null;
    private lastActiveSymbolChange: number = 0;

    // Worker State Tracking (Per Symbol+Timeframe)
    private workerState = new Map<string, WorkerState>();

    // Generation Tracking to prevent race conditions
    private calculationGenerations = new Map<string, number>();

    // Buffer Pool for allocations
    private pool = new BufferPool();

    // Paused calculations (e.g. when tab is hidden)
    private pausedCalculations = new Set<string>();

    constructor() {
        if (browser) {
            // Monitor visibility changes
            $effect.root(() => {
                $effect(() => {
                    this.handleVisibilityChange(idleMonitor.isDocumentVisible, idleMonitor.isUserIdle);
                });
            });
        }
    }

    private handleVisibilityChange(isVisible: boolean, isIdle: boolean) {
        if (!isVisible) {
            this.pauseNonCriticalCalculations();
        } else {
            this.resumeCalculations();
        }
    }

    private pauseNonCriticalCalculations() {
        if (import.meta.env.DEV) {
            logger.debug("technicals", "[ActiveManager] Pausing non-critical calculations");
        }
        
        // Cancel all pending Takt 2/3 calculations
        for (const [key, handle] of this.throttles) {
            // Don't pause active symbol
            const [symbol] = key.split(':');
            if (symbol === tradeState.symbol) continue;

            if (handle.type === 'timeout') {
                clearTimeout(handle.id);
            } else {
                const cancelIdle = this.getCancelIdleCallback();
                cancelIdle(handle.id);
            }
            this.throttles.delete(key);
            this.pausedCalculations.add(key);
        }
    }

    private resumeCalculations() {
        if (this.pausedCalculations.size === 0) return;

        if (import.meta.env.DEV) {
            logger.debug("technicals", `[ActiveManager] Resuming ${this.pausedCalculations.size} calculations`);
        }

        // Reschedule paused items with staggered start
        for (const key of this.pausedCalculations) {
            const [symbol, timeframe] = key.split(':');
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
        if (this.activeEffects.has(key)) return;

        // 1. Ensure Market Watcher is active
        marketWatcher.register(symbol, "price", "stateless");
        marketWatcher.register(symbol, "ticker", "stateless");
        marketWatcher.register(symbol, `kline_${timeframe}`, "stateless");

        // 2. Reactive Trigger (Svelte 5)
        // We watch marketState for updates and trigger calculation
        const cleanup = $effect.root(() => {
            $effect(() => {
                // Dependency tracking
                const _lastPrice = marketState.data[symbol]?.lastPrice;
                const _klines = marketState.data[symbol]?.klines?.[timeframe];

                // When data changes, schedule calculation
                // Use untracked to avoid loops if needed, but here we want to react.
                // However, we must debounce/throttle.

                // Note: We use a scheduler to decouple reactivity from calculation logic
                scheduler.schedule(() => {
                    if (marketState.data[symbol]) {
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
            const handle = this.throttles.get(key)!;
            if (handle.type === 'timeout') {
                clearTimeout(handle.id);
            } else {
                const cancelIdle = this.getCancelIdleCallback();
                cancelIdle(handle.id);
            }
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
        const isActiveSymbol = tradeState.symbol === symbol;

        // If already scheduled
        if (this.throttles.has(key)) {
            // Priority Upgrade: If it's the active symbol but we have a pending background task (idle),
            // we must cancel the background task and schedule a high-priority one immediately.
            // This prevents the "stale overwrite" issue where a slow background task finishes after a fast active one.
            const handle = this.throttles.get(key)!;

            if (isActiveSymbol && handle.type === 'idle') {
                if (import.meta.env.DEV) {
                    logger.debug("technicals", `[ActiveManager] Upgrading priority for ${key} (cancelling idle)`);
                }
                const cancelIdle = this.getCancelIdleCallback();
                cancelIdle(handle.id);
                this.throttles.delete(key);
                // Proceed to schedule high priority below
            } else {
                // Already scheduled correctly or high priority already
                return;
            }
        }

        // --- 3-Tact Strategy Logic ---

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

            // Schedule Takt 1 (Timeout)
            const timer = setTimeout(() => {
                this.throttles.delete(key);
                this.performCalculation(symbol, timeframe);
            }, delay);
            this.throttles.set(key, { id: timer, type: 'timeout' });

        } else if (isVisible) {
            // === TAKT 2: BACKGROUND / VISIBLE (Dashboard) ===
            const baseInterval = Math.max(5000, (settingsState.marketAnalysisInterval || 10) * 1000);
            const jitter = Math.floor(Math.random() * 500);

            if (idleMonitor.isUserIdle) {
                delay = baseInterval * 2; // Double interval if idle
            } else {
                delay = baseInterval + jitter;
            }

            // Schedule Takt 2 (Idle Callback)
            const handle = this.scheduleIdleCallback(key, symbol, timeframe, delay);
            this.throttles.set(key, { id: handle, type: 'idle' });

        } else if (isFavorite) {
            // === TAKT 3: HIDDEN FAVORITE ===
            // Very slow updates just to keep favorites somewhat fresh
            delay = 30000;
            const handle = this.scheduleIdleCallback(key, symbol, timeframe, delay);
            this.throttles.set(key, { id: handle, type: 'idle' });
        } else {
            // Not visible, not active, not favorite.
            // Why are we here? Maybe explicit subscription?
            // Fallback to very slow.
             const handle = this.scheduleIdleCallback(key, symbol, timeframe, 60000);
             this.throttles.set(key, { id: handle, type: 'idle' });
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
                const handle = this.scheduleIdleCallback(key, symbol, timeframe, delay);
                this.throttles.set(key, { id: handle, type: 'idle' });
            }
        };

        const requestIdleCb = this.getRequestIdleCallback();
        const handle = requestIdleCb(callback, { timeout: delay }) as any;
        return handle;
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

    private getCancelIdleCallback(): (handle: number) => void {
        if (typeof window !== 'undefined' && window.cancelIdleCallback) {
            return window.cancelIdleCallback.bind(window);
        }
        return clearTimeout;
    }

    private async performCalculation(symbol: string, timeframe: string) {
        const key = `${symbol}:${timeframe}`;

        // --- RACE CONDITION PROTECTION ---
        // Increment generation ID. Any previous calculation still running will detect mismatch and abort.
        const currentGen = (this.calculationGenerations.get(key) || 0) + 1;
        this.calculationGenerations.set(key, currentGen);

        const marketData = marketState.data[symbol];

        if (!marketData) return;

        // Ensure we have minimal data
        if (import.meta.env.DEV) {
             if (!marketData.klines || !marketData.klines[timeframe]) {
                 // Debug log only
                 // logger.log("technicals", `[ActiveManager] performCalculation for ${key}. Has data? ${!!marketData.klines && !!marketData.klines[timeframe]} Len: ${marketData.klines?.[timeframe]?.length}`);
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
        const gap = state && state.initialized
            ? (lastCommittedTime - state.lastCommittedTime) / intervalMs
            : 0;

        const needsShift = state && state.initialized && gap === 1;
        const needsReinit = state && state.initialized && gap !== 0 && gap !== 1;

        let result;

        try {
            if (needsInit || needsReinit) {
                // INITIALIZE (Full History)
                result = await technicalsService.initializeTechnicals(
                    symbol, timeframe, history, settings, enabledIndicators, isPhantomAppended
                );

                // STALE CHECK
                if (this.calculationGenerations.get(key) !== currentGen) return;

                this.workerState.set(key, { initialized: true, lastCommittedTime });
            } else if (needsShift) {
                // SHIFT + UPDATE
                let closedCandle = isPhantomAppended ? history[len - 2] : history[len - 1];

                await technicalsService.shiftTechnicals(symbol, timeframe, closedCandle);

                // STALE CHECK 1
                if (this.calculationGenerations.get(key) !== currentGen) return;

                // Now calculate the current live tick
                const lastK = history[history.length - 1];
                result = await technicalsService.updateTechnicals(
                    symbol, timeframe, lastK
                );

                // STALE CHECK 2
                if (this.calculationGenerations.get(key) !== currentGen) return;

                this.workerState.set(key, { initialized: true, lastCommittedTime });
            } else {
                // UPDATE (Single Tick)
                const lastK = history[history.length - 1];
                result = await technicalsService.updateTechnicals(
                    symbol, timeframe, lastK
                );

                // STALE CHECK
                if (this.calculationGenerations.get(key) !== currentGen) return;
            }

            if (result) {
                this.handleResult(symbol, timeframe, marketData, result);
            }


        } catch (e: any) {
            // Even if failed, check generation. If stale, ignore error (new calc handles it).
            if (this.calculationGenerations.get(key) !== currentGen) return;

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
        if (len === 0) return original;

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

    // Helper for deep equality
    private isTechnicalsEqual(a: any, b: any): boolean {
        if (a === b) return true;
        if (!a || !b) return false;

        // Simple comparison of lastUpdated to short-circuit
        // (Assuming results are new objects but maybe structurally equal)

        // Compare summary
        if (a.summary?.action !== b.summary?.action) return false;

        // Compare oscillators length
        if (a.oscillators?.length !== b.oscillators?.length) return false;

        // Compare first oscillator value as a heuristic
        if (a.oscillators?.[0]?.value !== b.oscillators?.[0]?.value) return false;

        // If we really want deep equality, we can use JSON stringify or a more robust check.
        // For performance, we check key indicators.
        // Check MACD specifically as it was buggy
        const macdA = a.oscillators?.find((o: any) => o.name === 'MACD');
        const macdB = b.oscillators?.find((o: any) => o.name === 'MACD');
        if (macdA?.value !== macdB?.value) return false;

        const { lastUpdated: _a, ...restA } = a;
        const { lastUpdated: _b, ...restB } = b;
        return JSON.stringify(restA) === JSON.stringify(restB);
    }
}

export const activeTechnicalsManager = new ActiveTechnicalsManager();
