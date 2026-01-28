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
import type { Kline } from "./technicalsTypes";
import { networkMonitor } from "../utils/networkMonitor";

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

    constructor() {
        // Singleton
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

        this.throttles.set(key, setTimeout(() => {
            this.throttles.delete(key);
            this.performCalculation(symbol, timeframe);
        }, delay));
    }

    // Helper for deep equality
    private isTechnicalsEqual(a: any, b: any): boolean {
        // Fast path for references
        if (!a || !b) return false;

        // Check timestamp first (optimization)
        if (a.lastUpdated !== b.lastUpdated) {
            // If only lastUpdated changed but rest is same...
            // But usually calculation changes result. 
            // We ignore lastUpdated for content equality check if we generated it.
        }

        // Specific field checks for efficiency instead of full recursive JSON stringify
        // Summary Action
        if (a.summary?.action !== b.summary?.action) return false;
        if (a.confluence?.score !== b.confluence?.score) return false;

        // Oscillators (check length and values of first few)
        if (a.oscillators?.length !== b.oscillators?.length) return false;
        if (a.oscillators?.[0]?.value?.toString() !== b.oscillators?.[0]?.value?.toString()) return false;

        // Volatility
        if (a.volatility?.atr?.toString() !== b.volatility?.atr?.toString()) return false;

        // Deep verification for critical changes
        try {
            const cleanA = { ...a, lastUpdated: 0 };
            const cleanB = { ...b, lastUpdated: 0 };
            return JSON.stringify(cleanA) === JSON.stringify(cleanB);
        } catch {
            return false;
        }
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
            this.injectRealtimePrice(history, timeframe, marketData.lastPrice, symbol);
        }

        // Now calculate
        // 🌟 Optimization: Pass enabled indicators to Worker and unwrap proxies
        const settings = indicatorState.toJSON();
        const enabledIndicators = $state.snapshot(settingsState.enabledIndicators);

        try {
            const result = await technicalsService.calculateTechnicals(history, settings, enabledIndicators);

            if (result) {
                // Anti-Flicker: Check if content actually changed
                const currentTechnicals = marketData.technicals;

                if (currentTechnicals && this.isTechnicalsEqual(currentTechnicals, result)) {
                    // Skip update if data is effectively identical
                    // This prevents Svelte reactivity from firing unnecessarily
                    return;
                }

                result.lastUpdated = Date.now();

                // 5. Update State (Orchestrated via RAF)
                scheduler.schedule(() => {
                    marketState.updateSymbol(symbol, { technicals: result });
                });
            }

        } catch (e) {
            logger.error("technicals", `Calculation failed for ${key}`, e);
        }
    }

    // Stateless Helper: mutates a copy of the history array found in memory
    private injectRealtimePrice(history: Kline[], timeframe: string, price: Decimal, symbol: string) {
        if (history.length === 0) return;

        const lastIdx = history.length - 1;
        const lastCandle = { ...history[lastIdx] }; // Clone to avoid mutating state directly outside action

        const now = Date.now();
        const intervalMs = getIntervalMs(timeframe);
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
