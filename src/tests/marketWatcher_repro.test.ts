
import { describe, it, expect, vi } from 'vitest';
import { marketWatcher } from '../services/marketWatcher';

// Mock dependencies
vi.mock('../services/apiService', () => ({
    apiService: {
        fetchTicker24h: vi.fn(() => new Promise((resolve) => setTimeout(() => resolve({
            lastPrice: '100', highPrice: '110', lowPrice: '90', volume: '1000', quoteVolume: '100000', priceChangePercent: '5'
        }), 2000))), // Slow request
        fetchBitunixKlines: vi.fn(() => Promise.resolve([])),
    }
}));

vi.mock('../stores/settings.svelte', () => ({
    settingsState: {
        apiProvider: 'bitunix',
        capabilities: { marketData: true },
        chartHistoryLimit: 1000
    }
}));

vi.mock('../stores/trade.svelte', () => ({
    tradeState: { symbol: 'BTCUSDT' }
}));

vi.mock('../stores/market.svelte', () => ({
    marketState: {
        data: {},
        updateSymbol: vi.fn(),
        updateSymbolKlines: vi.fn(),
        connectionStatus: 'connected'
    }
}));

describe('MarketWatcher Zombie Requests', () => {
    it('should not double-decrement inFlight counter when zombie is pruned', async () => {
        // Access private properties via casting to any (for testing internals)
        const watcher = marketWatcher as any;

        // Reset state
        watcher.inFlight = 0;
        watcher.pendingRequests.clear();
        watcher.prunedRequestIds.clear();
        watcher.requestStartTimes.clear();

        // 1. Start a slow request
        const promise = watcher.pollSymbolChannel('BTCUSDT', 'price', 'bitunix');

        expect(watcher.inFlight).toBe(1);
        const lockKey = 'BTCUSDT:price';
        expect(watcher.pendingRequests.has(lockKey)).toBe(true);

        // 2. Simulate time passing and prune zombie
        // We manually set the start time to be very old
        watcher.requestStartTimes.set(lockKey, Date.now() - 30000);

        // 3. Trigger prune
        watcher.pruneZombieRequests();

        // Expectation:
        // - Request removed from pending
        // - inFlight decremented by prune
        // - Added to prunedRequestIds
        expect(watcher.pendingRequests.has(lockKey)).toBe(false);
        expect(watcher.inFlight).toBe(0);
        expect(watcher.prunedRequestIds.has(lockKey)).toBe(true);

        // 4. Wait for the original slow request to finish (which is still running in background)
        await promise;

        // Expectation:
        // - Finally block runs
        // - It sees key in prunedRequestIds
        // - It does NOT decrement inFlight again
        expect(watcher.inFlight).toBe(0); // Should stay 0, not -1
        expect(watcher.prunedRequestIds.has(lockKey)).toBe(false); // Should be cleaned up
    });
});
