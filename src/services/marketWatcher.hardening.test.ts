import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { marketWatcher } from './marketWatcher';
import { apiService } from './apiService';
import { marketState } from '../stores/market.svelte';
import { settingsState } from '../stores/settings.svelte';

describe('MarketWatcher Hardening Tests', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.restoreAllMocks();
        // Reset marketWatcher state (best effort)
        (marketWatcher as any).requests.clear();
        (marketWatcher as any).pendingRequests.clear();
        (marketWatcher as any).inFlight = 0;
        (marketWatcher as any).requestStartTimes.clear();
        // If we add prunedRequestIds later, clear it too
        if ((marketWatcher as any).prunedRequestIds) {
            (marketWatcher as any).prunedRequestIds.clear();
        }

        settingsState.capabilities.marketData = true;
        settingsState.apiProvider = 'bitunix';
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should prevent zombie requests from updating state or double-decrementing inFlight', async () => {
        // Mock apiService to delay response
        const fetchSpy = vi.spyOn(apiService, 'fetchTicker24h');

        let resolveRequest: (val: any) => void;
        const delayedResponse = new Promise((resolve) => {
            resolveRequest = resolve;
        });

        fetchSpy.mockImplementation(async () => {
            return delayedResponse;
        });

        // Register a request
        marketWatcher.register('BTCUSDT', 'price');

        const mw = marketWatcher as any;

        // Initial state
        expect(mw.inFlight).toBe(0);

        // Start polling manually
        mw.pollSymbolChannel('BTCUSDT', 'price', 'bitunix');

        // Should be in flight
        expect(mw.inFlight).toBe(1);
        expect(mw.pendingRequests.has('BTCUSDT:price')).toBe(true);

        // Advance time by 21 seconds (zombie threshold is 20s)
        vi.advanceTimersByTime(21000);

        // Trigger prune
        mw.pruneZombieRequests();

        // Should be pruned
        expect(mw.inFlight).toBe(0); // Decremented by prune
        expect(mw.pendingRequests.has('BTCUSDT:price')).toBe(false);

        // Mock updateSymbol to verify if it gets called
        const updateSpy = vi.spyOn(marketState, 'updateSymbol');

        // Set inFlight to 5 to check for double decrement
        mw.inFlight = 5;

        // Now resolve the delayed request
        resolveRequest!({ lastPrice: '10000' });

        // Wait for promise resolution
        await vi.runAllTimersAsync();

        // Assertions for FIXED behavior:
        // 1. updateSymbol should NOT be called (because it was pruned/zombie).
        expect(updateSpy).not.toHaveBeenCalled();

        // 2. inFlight should remain 5 (should not decrement again).
        expect(mw.inFlight).toBe(5);
    });
});
