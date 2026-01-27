/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { untrack } from "svelte";
import { tradeState } from "../stores/trade.svelte";

/**
 * Trade Calculator Service
 * 
 * Responsibilities:
 * - Watches tradeState for changes in input values
 * - Throttles calculation requests to prevent performance issues
 * - Triggers the main calculation logic (in CalculatorService)
 * 
 * This service extracts the reactive logic previously hosted in +page.svelte,
 * enabling a "Thin View" architecture where the UI only binds data and the
 * service handles business logic triggers.
 */
class TradeCalculator {
    private lastCalcTime = 0;
    private readonly CALC_THROTTLE_MS = 250;
    private calculateFn: (() => void) | null = null;
    private initialized = false;

    /**
     * Initialize the calculator watcher.
     * @param calculateFn The function to call when calculation is needed (usually app.calculateAndDisplay)
     */
    init(calculateFn: () => void) {
        if (this.initialized) return;
        this.calculateFn = calculateFn;
        this.initialized = true;

        // Use $effect.root to ensure the effect lives as long as the app
        // independent of any component lifecycle.
        $effect.root(() => {
            $effect(() => {
                // 1. Establish dependencies (Accessing values tracks them)
                const _s = tradeState;

                // Core inputs
                _s.accountSize;
                _s.riskPercentage;
                _s.entryPrice;
                _s.symbol;
                _s.tradeType;
                _s.targets;
                _s.leverage;
                _s.fees;
                _s.useAtrSl;
                _s.isRiskAmountLocked;
                _s.isPositionSizeLocked;
                _s.lockedPositionSize;

                // Conditional triggers:
                // If ATR is active, stopLossPrice is a RESULT, not a TRIGGER.
                if (_s.useAtrSl) {
                    _s.atrValue;
                    _s.atrMultiplier;
                    _s.atrMode;
                    _s.atrTimeframe;
                } else {
                    // If ATR is off, Stop Loss is a manual input TRIGGER.
                    _s.stopLossPrice;
                }

                // 2. Throttle check
                const now = Date.now();
                if (now - this.lastCalcTime < this.CALC_THROTTLE_MS) return;

                // 3. Validation and Execution
                if (
                    _s.accountSize !== undefined &&
                    _s.riskPercentage !== undefined &&
                    _s.entryPrice !== undefined &&
                    _s.symbol !== undefined &&
                    _s.tradeType !== undefined &&
                    _s.targets !== undefined
                ) {
                    untrack(() => {
                        this.calculateFn?.();
                        this.lastCalcTime = Date.now();
                    });
                }
            });
        });
    }
}

export const tradeCalculator = new TradeCalculator();
