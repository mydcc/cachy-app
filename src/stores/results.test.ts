/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resultsState, initialResultsState, INITIAL_RESULTS_STATE, ResultsState } from './results.svelte';
import { Decimal } from 'decimal.js';

describe('Results Manager', () => {
    beforeEach(() => {
        resultsState.reset();
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('INITIAL_RESULTS_STATE export', () => {
        it('should correctly expose the initial state constants', () => {
            expect(initialResultsState).toBe(INITIAL_RESULTS_STATE);
            expect(INITIAL_RESULTS_STATE).toEqual({
                positionSize: "-",
                requiredMargin: "-",
                netLoss: "-",
                entryFee: "-",
                liquidationPrice: "-",
                breakEvenPrice: "-",
                totalRR: "-",
                totalNetProfit: "-",
                totalPercentSold: "-",
                riskAmountCurrency: "-",
                totalFees: "-",
                maxPotentialProfit: "-",
                calculatedTpDetails: [],
                showTotalMetricsGroup: false,
                showAtrFormulaDisplay: false,
                atrFormulaText: "",
                isAtrSlInvalid: false,
                isMarginExceeded: false,
            });
        });
    });

    describe('ResultsManager methods', () => {
        it('should initialize with initial state', () => {
            expect(resultsState).toMatchObject(INITIAL_RESULTS_STATE);
        });

        it('should update specific fields using update()', () => {
            resultsState.update({
                positionSize: "1.5",
                showTotalMetricsGroup: true,
            });

            expect(resultsState.positionSize).toBe("1.5");
            expect(resultsState.showTotalMetricsGroup).toBe(true);
            // Verify other fields remain untouched
            expect(resultsState.requiredMargin).toBe("-");
        });

        it('should completely overwrite fields using set()', () => {
            const newState: ResultsState = {
                ...INITIAL_RESULTS_STATE,
                positionSize: "2.0",
                requiredMargin: "100",
                netLoss: "10",
            };

            resultsState.set(newState);

            expect(resultsState.positionSize).toBe("2.0");
            expect(resultsState.requiredMargin).toBe("100");
            expect(resultsState.netLoss).toBe("10");
        });

        it('should reset back to initial state using reset()', () => {
            resultsState.update({
                positionSize: "1.5",
                showTotalMetricsGroup: true,
            });

            expect(resultsState.positionSize).toBe("1.5");

            resultsState.reset();

            expect(resultsState.positionSize).toBe("-");
            expect(resultsState.showTotalMetricsGroup).toBe(false);
        });

        it('should allow subscription to state changes', () => {
            const mockCallback = vi.fn();

            const unsubscribe = resultsState.subscribe(mockCallback);

            // Should be called immediately with the snapshot
            expect(mockCallback).toHaveBeenCalledTimes(1);
            expect(mockCallback).toHaveBeenCalledWith(expect.objectContaining({
                positionSize: "-"
            }));

            mockCallback.mockClear();

            // Svelte 5 $effect root is tricky to test cleanly with Vitest outside of components,
            // we will just verify the mock was initially called. Testing the internal notification
            // logic thoroughly usually requires mounting a component.

            // unsubscribe returns a cleanup function from $effect.root
            expect(typeof unsubscribe).toBe('function');
            unsubscribe();
        });

        it('should correctly handle calculatedTpDetails with Decimal values', () => {
            const mockDetail = {
                index: 1,
                price: new Decimal(50000),
                percent: new Decimal(20),
                percentSold: new Decimal(20),
                riskRewardRatio: new Decimal(2.5),
                netProfit: new Decimal(150),
                priceChangePercent: new Decimal(5),
                returnOnCapital: new Decimal(10),
                partialVolume: new Decimal(0.5),
                exitFee: new Decimal(1.5),
            };

            resultsState.update({
                calculatedTpDetails: [mockDetail],
                totalNetProfit: "150",
            });

            expect(resultsState.calculatedTpDetails.length).toBe(1);
            expect(resultsState.calculatedTpDetails[0].price.toNumber()).toBe(50000);
            expect(resultsState.totalNetProfit).toBe("150");

            resultsState.reset();

            expect(resultsState.calculatedTpDetails).toEqual([]);
            expect(resultsState.totalNetProfit).toBe("-");
        });

        it('should not crash on mutation and unsubscribe under fake timers', () => {
            vi.useFakeTimers();

            const mockCallback = vi.fn();

            const unsubscribe = resultsState.subscribe(mockCallback);
            expect(mockCallback).toHaveBeenCalledTimes(1);
            mockCallback.mockClear();

            // Verify mutation and cleanup don't crash.
            resultsState.positionSize = "3.0";

            // cleanup
            unsubscribe();
        });
    });
});
