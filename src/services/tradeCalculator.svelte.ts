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
    private trailingTimer: ReturnType<typeof setTimeout> | null = null;
    private readonly CALC_THROTTLE_MS = 250;
    private calculateFn: (() => void) | null = null;
    private initialized = false;
    private stopEffects: (() => void) | null = null;

    /**
     * Validates inputs and runs the calculation. Used by both the leading
     * edge (direct effect run) and the trailing edge (scheduled timer) so a
     * rapid mutation burst always ends in a calculation of the final state
     * (BUG-0360).
     */
    private executeCalculation() {
        const _s = tradeState;
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
    }

    /** Clears any pending trailing calculation (BUG-0360). */
    destroy() {
        if (this.trailingTimer) {
            clearTimeout(this.trailingTimer);
            this.trailingTimer = null;
        }
        // Stop the reactive watcher so a re-init starts clean instead of
        // stacking another $effect.root on top of the old one.
        this.stopEffects?.();
        this.stopEffects = null;
        // Full teardown: reset throttle state and allow re-init (tests / HMR).
        this.lastCalcTime = 0;
        this.calculateFn = null;
        this.initialized = false;
    }

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
        this.stopEffects = $effect.root(() => {
            $effect(() => {
                // 1. Establish dependencies (Accessing values tracks them)
                const _s = tradeState;

                /* eslint-disable @typescript-eslint/no-unused-expressions --
                   These bare property reads are the dependency registration for
                   this $effect: touching a rune-backed property is what
                   subscribes the effect to it. They are not dead code, and
                   removing one would silently stop the calculator from
                   recalculating when that input changes. */

                // Core inputs
                _s.accountSize;
                _s.riskPercentage;
                _s.entryPrice;
                _s.symbol;
                _s.tradeType;
                _s.targets;
                _s.leverage;
                _s.fees;
                // FEAT-0253: the per-leg rates are their own triggers. `fees`
                // mirrors the *exit* rate only, so switching the entry between
                // MARKET and LIMIT moves `entryFees` and nothing else — without
                // these two reads the effect never fires and every result on
                // screen (entry fee, net loss, break-even) stays at the old
                // order type's numbers.
                _s.entryFees;
                _s.exitFees;
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

                /* eslint-enable @typescript-eslint/no-unused-expressions */

                // 2. Throttle check — schedule a trailing execution for the
                // final state instead of dropping the update (BUG-0360)
                const now = Date.now();
                if (now - this.lastCalcTime < this.CALC_THROTTLE_MS) {
                    const remaining = this.CALC_THROTTLE_MS - (now - this.lastCalcTime);
                    if (this.trailingTimer) clearTimeout(this.trailingTimer);
                    this.trailingTimer = setTimeout(() => {
                        this.trailingTimer = null;
                        this.executeCalculation();
                    }, remaining);
                    return;
                }

                // 3. Validation and Execution
                this.executeCalculation();
            });
        });
    }
}

export const tradeCalculator = new TradeCalculator();
