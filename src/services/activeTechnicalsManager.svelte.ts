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
import { indicatorState } from "../stores/indicator.svelte";
import { settingsState } from "../stores/settings.svelte";
import { favoritesState } from "../stores/favorites.svelte";
import { tradeState } from "../stores/trade.svelte";
import { technicalsService } from "./technicalsService";
import { marketWatcher } from "./marketWatcher";
import { browser } from "$app/environment";
import { logger } from "./logger";
import type { KlineBuffers } from "./technicalsTypes";
import type { Decimal } from "decimal.js";
import { networkMonitor } from "../utils/networkMonitor";
import { SubscriptionRegistry } from "./activeTechnicals/subscriptionRegistry";
import { VisibilityController } from "./activeTechnicals/visibilityController";
import { CalculationExecutor } from "./activeTechnicals/calculationExecutor";

class ActiveTechnicalsManager {
    private readonly registry: SubscriptionRegistry;
    private readonly visibility: VisibilityController;
    private readonly executor: CalculationExecutor;

    // Active effects cleanups: `symbol:timeframe` -> cleanup function
    private activeEffects = new Map<string, () => void>();

    // Throttle timers: `symbol:timeframe` -> timer ID
    private throttles = new Map<string, ReturnType<typeof setTimeout> | number>();

    // 🌟 Pro-Level: Debounce State (active-symbol tracking lives here, not in
    // VisibilityController, since it's read/written entirely inside the
    // scheduling logic below)
    private lastActiveSymbolChange = 0;
    private lastActiveSymbol = "";

    constructor() {
        // Singleton
        this.registry = new SubscriptionRegistry(
            (symbol, timeframe) => this.startMonitoring(symbol, timeframe),
            (symbol, timeframe) => this.stopMonitoring(symbol, timeframe),
        );
        this.visibility = new VisibilityController(
            this.throttles,
            (symbol, timeframe) => this.scheduleCalculation(symbol, timeframe),
        );
        this.executor = new CalculationExecutor();
    }

    // The following accessors exist so FEAT-0196 PR 1's characterisation
    // tests (activeTechnicalsManager.test.ts, merged before this split) keep
    // passing unmodified: they assert on this manager's internal bookkeeping
    // by name, and that bookkeeping now lives on the three extracted
    // collaborators above. The state and behaviour genuinely moved; these
    // are thin pass-throughs, not a re-implementation.
    private get subscribers() { return this.registry.subscribers; }
    private get visibleSymbols() { return this.visibility.visibleSymbols; }
    private get pausedCalculations() { return this.visibility.pausedCalculations; }
    private get isTabVisible() { return this.visibility.isTabVisible; }
    private set isTabVisible(v: boolean) { this.visibility.isTabVisible = v; }
    private get workerState() { return this.executor.workerState; }
    private get pool() { return this.executor.pool; }
    private handleVisibilityChange() { this.visibility.handleVisibilityChange(); }
    private prepareBuffersWithRealtime(original: KlineBuffers, timeframe: string, price: Decimal | null): KlineBuffers {
        return this.executor.prepareBuffersWithRealtime(original, timeframe, price);
    }

    /**
     * Takt 2 Control: Set visibility status for viewport sensing.
     * Called by UI components via IntersectionObserver.
     */
    setSymbolVisibility(symbol: string, isVisible: boolean) {
        this.visibility.setSymbolVisibility(symbol, isVisible);
    }

    /**
     * Lifecycle cleanup for HMR / re-init: removes the document
     * visibilitychange listener, clears pending throttle timers and tears
     * down active reactive effects (BUG-0362).
     */
    destroy() {
        this.visibility.destroy();
        for (const timerId of this.throttles.values()) clearTimeout(timerId);
        this.throttles.clear();
        for (const cleanup of this.activeEffects.values()) cleanup();
        this.activeEffects.clear();
    }

    /**
     * Subscribe to updates for a symbol/timeframe pair.
     * Ensures market data is being watched and calculations are running.
     */
    register(symbol: string, timeframe: string) {
        if (!browser || !symbol || !timeframe) return;
        this.registry.register(symbol, timeframe);
    }

    /**
     * Force an immediate calculation, bypassing any backfill throttles.
     * Used after a backfill finishes to ensure store is up-to-date.
     */
    public forceRefresh(symbol: string, timeframe: string) {
        this.executor.forceRefresh(symbol, timeframe);
    }

    /**
     * Unsubscribe.
     * Stops calculations if no more subscribers exist.
     */
    unregister(symbol: string, timeframe: string) {
        if (!browser || !symbol || !timeframe) return;
        this.registry.unregister(symbol, timeframe);
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

                // Track indicator settings changes
                const settingsHash = indicatorState._cachedJson;

                untrack(() => {
                    if (klineData || currentPrice || settingsHash) {
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

        // === FIX: Cleanup Worker State ===
        technicalsService.cleanupTechnicals(symbol, timeframe);
        this.executor.workerState.delete(key);

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

        const isVisible = this.visibility.visibleSymbols.has(symbol) || isActiveSymbol;
        const isFavorite = favoritesState.items.slice(0, 10).includes(symbol);

        let delay = 60000; // Default Takt 3: Idle/Cached (very slow updates)

        if (isActiveSymbol) {
            // === TAKT 1: HIGH FREQUENCY (Realtime) ===
            const timeSinceSwitch = Date.now() - this.lastActiveSymbolChange;

            // Debounce: If switched < 200ms ago, impose small wait to prevent CPU spikes
            if (timeSinceSwitch < 200) {
                delay = 200;
            } else {
                // Use User Settings (e.g. 100ms for Realtime, 500ms for Balanced)
                // Fallback to 250ms if undefined
                let userInterval = settingsState.technicalsUpdateInterval;
                if (!userInterval) {
                    // Derive from mode if interval not explicit
                    const mode = settingsState.technicalsUpdateMode || 'balanced';
                    // Mapping presets manually here or import? Simple mapping:
                    if (mode === 'realtime') userInterval = 100;
                    else if (mode === 'fast') userInterval = 250;
                    else if (mode === 'conservative') userInterval = 2000;
                    else userInterval = 500; // balanced
                }
                delay = userInterval;
            }
        } else if (isVisible) {
            // === TAKT 2: BACKGROUND / VISIBLE (Dashboard) ===
            // 10s - 60s based on settings
            const baseInterval = Math.max(5000, (settingsState.marketAnalysisInterval || 10) * 1000);

            // Staggering: Add random 0-500ms jitter to prevent "Thundering Herd"
            const jitter = Math.floor(Math.random() * 500);
            delay = baseInterval + jitter;

        } else if (isFavorite) {
            // === TAKT 3: HIDDEN FAVORITE ===
            // Keep warm but slow
            delay = 30000;
        }

        // Global Throttle on Blur (Sleep Mode)
        if (settingsState.pauseAnalysisOnBlur && typeof document !== "undefined" && !document.hasFocus() && !isActiveSymbol) {
            delay = delay * 3; // Aggressive throttling when window hidden
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
        if (!this.visibility.isTabVisible && !isActiveSymbol) {
            this.visibility.pausedCalculations.add(key);
            return;
        }

        // Takt 1: Active Symbol → setTimeout (highest priority, realtime)
        if (isActiveSymbol) {
            this.throttles.set(key, setTimeout(() => {
                this.throttles.delete(key);
                this.executor.performCalculation(symbol, timeframe);
            }, delay));
        }
        // Takt 2/3: Non-active symbols → requestIdleCallback (low priority)
        else {
            const callback = (deadline?: IdleDeadline) => {
                // Only execute if enough time remaining (min 10ms) or timeout occurred
                if (!deadline || deadline.timeRemaining() > 10 || deadline.didTimeout) {
                    this.throttles.delete(key);
                    this.executor.performCalculation(symbol, timeframe);
                } else {
                    // Not enough time - reschedule
                    this.scheduleIdleCallback(key, symbol, timeframe, delay);
                }
            };

            // Use requestIdleCallback with polyfill fallback
            const requestIdleCb = this.getRequestIdleCallback();
            const handle = requestIdleCb(callback, { timeout: delay });
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
                this.executor.performCalculation(symbol, timeframe);
            } else {
                // Still not enough time - reschedule again
                this.scheduleIdleCallback(key, symbol, timeframe, delay);
            }
        };

        const requestIdleCb = this.getRequestIdleCallback();
        const handle = requestIdleCb(callback, { timeout: delay });
        this.throttles.set(key, handle);
    }

    /**
     * Get requestIdleCallback with polyfill fallback for older browsers.
     */
    private getRequestIdleCallback(): (callback: (deadline?: IdleDeadline) => void, options?: { timeout: number }) => ReturnType<typeof setTimeout> | number {
        if (typeof window !== 'undefined' && window.requestIdleCallback) {
            return window.requestIdleCallback.bind(window);
        }

        // Polyfill: Use setTimeout with simulated IdleDeadline. `options` is part
        // of the shared call signature (used by the native path above) but the
        // polyfill ignores the timeout hint — it always defers by 1ms.
        return (callback: (deadline?: IdleDeadline) => void) => {
            const start = Date.now();
            return setTimeout(() => {
                callback({
                    didTimeout: false,
                    timeRemaining: () => Math.max(0, 50 - (Date.now() - start))
                } as IdleDeadline);
            }, 1);
        };
    }
}

export const activeTechnicalsManager = new ActiveTechnicalsManager();

// HMR: remove the document visibilitychange listener, clear throttle
// timers and tear down active effects on module disposal (BUG-0362).
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    activeTechnicalsManager.destroy();
  });
}
