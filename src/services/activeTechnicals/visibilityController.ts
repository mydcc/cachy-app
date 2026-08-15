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

import { browser } from "$app/environment";
import { tradeState } from "../../stores/trade.svelte";
import { logger } from "../logger";

/**
 * Page Visibility API integration for ActiveTechnicalsManager: which symbols
 * are in the viewport (Takt 2), and the tab-hidden pause/resume path.
 *
 * Owns `throttles` by reference (shared with the caller, not copied) because
 * pausing means clearing entries out of the same map scheduleCalculation()
 * writes into -- this class only ever touches entries whose symbol isn't the
 * active one, so the active symbol keeps calculating while others pause.
 */
export class VisibilityController {
    public isTabVisible = true;
    public readonly visibleSymbols = new Set<string>();
    public readonly pausedCalculations = new Set<string>();

    constructor(
        private readonly throttles: Map<string, ReturnType<typeof setTimeout> | number>,
        private readonly scheduleCalculation: (symbol: string, timeframe: string) => void,
    ) {
        if (browser && typeof document !== "undefined") {
            this.isTabVisible = !document.hidden;

            document.addEventListener("visibilitychange", () => {
                this.handleVisibilityChange();
            });
        }
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
     * Handle Page Visibility API changes.
     * Pauses non-critical calculations when tab is hidden.
     */
    handleVisibilityChange() {
        const wasVisible = this.isTabVisible;
        this.isTabVisible = !document.hidden;

        if (!this.isTabVisible && wasVisible) {
            // Tab just became hidden - pause non-critical calculations
            logger.log("general", "[ActiveManager] Tab hidden - pausing non-critical calculations");
            this.pauseNonCriticalCalculations();
        } else if (this.isTabVisible && !wasVisible) {
            // Tab just became visible - resume calculations
            logger.log("general", "[ActiveManager] Tab visible - resuming calculations");
            this.resumeCalculations();
        }
    }

    /**
     * Pause all calculations except Takt 1 (active symbol).
     */
    private pauseNonCriticalCalculations() {
        const activeSymbol = tradeState.symbol;

        for (const [key, timerId] of this.throttles.entries()) {
            const [symbol] = key.split(":");

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
            const [symbol, timeframe] = key.split(":");

            // Resume with a slight delay to avoid thundering herd
            setTimeout(() => {
                this.scheduleCalculation(symbol, timeframe);
            }, Math.random() * 1000); // Stagger 0-1s
        }

        this.pausedCalculations.clear();
    }
}
