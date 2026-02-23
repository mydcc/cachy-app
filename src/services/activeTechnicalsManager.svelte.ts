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
 * Active Technicals Manager (Simplified)
 * Orchestrates background calculation of technical indicators for subscribed symbols.
 * Replaces complex 3-Takt system with direct, robust updates.
 */

import { untrack } from "svelte";
import { marketState } from "../stores/market.svelte";
import { indicatorState } from "../stores/indicator.svelte";
import { settingsState } from "../stores/settings.svelte";
import { technicalsService } from "./technicalsService";
import { marketWatcher } from "./marketWatcher";
import { browser } from "$app/environment";
import { logger } from "./logger";

class ActiveTechnicalsManager {
    // Ref counting: symbol:timeframe -> count
    private subscribers = new Map<string, number>();

    // Active effects cleanups: symbol:timeframe -> cleanup function
    private activeEffects = new Map<string, () => void>();

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
     * Force an immediate calculation.
     */
    public forceRefresh(symbol: string, timeframe: string) {
        this.performCalculation(symbol, timeframe);
    }

    // Stub for compatibility with existing components
    setSymbolVisibility(symbol: string, isVisible: boolean) {
        // No-op in simplified version
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
                technicalsService.cleanupTechnicals(symbol, timeframe);
            } else {
                this.subscribers.set(key, count - 1);
            }
        }
    }

    private startMonitoring(symbol: string, timeframe: string) {
        const key = `${symbol}:${timeframe}`;

        // 1. Ensure Market Watcher provides price/ticker/klines for updates
        // Using "stateless" mode to avoid deep history if supported by marketWatcher,
        // or just standard registration.
        // Assuming "stateless" is valid based on original code usage.
        marketWatcher.register(symbol, "price", "stateless");
        marketWatcher.register(symbol, `kline_${timeframe}`, "stateless");

        // 2. Start Reactive Effect
        const cleanup = $effect.root(() => {
            $effect(() => {
                // Dependencies we track:
                const data = marketState.data[symbol];
                if (!data) return;

                // Track kline updates (length or content change)
                const klines = data.klines ? data.klines[timeframe] : undefined;

                // Track price for real-time updates
                const currentPrice = data.lastPrice;

                untrack(() => {
                    if (klines || currentPrice) {
                        // Direct execution without throttling
                        this.performCalculation(symbol, timeframe);
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

        // 2. Unregister from Market Watcher
        marketWatcher.unregister(symbol, "price", "stateless");
        marketWatcher.unregister(symbol, `kline_${timeframe}`, "stateless");

        if (import.meta.env.DEV) {
            logger.debug("technicals", `[ActiveManager] Stopped monitoring ${key}`);
        }
    }

    private async performCalculation(symbol: string, timeframe: string) {
        const data = marketState.data[symbol];
        if (!data || !data.klines || !data.klines[timeframe]) return;

        const klines = [...data.klines[timeframe]]; // Clone to be safe
        const settings = indicatorState.toJSON();

        // Use snapshot to avoid reactive tracking inside async
        const enabledIndicators = $state.snapshot(settingsState.enabledIndicators);

        try {
            // We simplify by always running full initialization (or smart init via service)
            // This avoids "state poisoning" from incorrect incremental updates.
            // The service handles worker communication.
            const result = await technicalsService.initializeTechnicals(
                symbol, timeframe, klines, settings, enabledIndicators
            );

            if (result) {
                // Update specific timeframe slot in marketState
                marketState.updateSymbol(symbol, { technicals: { [timeframe]: result } });
            }
        } catch (e) {
            logger.error("technicals", `Calculation failed for ${symbol}:${timeframe}`, e);
        }
    }
}

export const activeTechnicalsManager = new ActiveTechnicalsManager();
