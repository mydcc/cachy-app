// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { marketWatcher } from './marketWatcher';
import { apiService } from './apiService';
import { marketState } from '../stores/market.svelte';
import Decimal from 'decimal.js';

// Mocks
vi.mock('./apiService');
vi.mock('../stores/market.svelte', async () => {
    const { Decimal } = await import('decimal.js');
    return {
        marketState: {
            data: {},
            updateSymbol: vi.fn(),
            updateSymbolKlines: vi.fn(),
            connectionStatus: 'connected'
        }
    };
});
vi.mock('../stores/settings.svelte', () => ({
    settingsState: {
        apiProvider: 'bitunix',
        capabilities: { marketData: true }
    }
}));
vi.mock('./storageService', () => ({
    storageService: {
        saveKlines: vi.fn()
    }
}));

describe('MarketWatcher Zombie Protection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset marketWatcher internals
        marketWatcher.forceCleanup();
    });

    it('should ignore data from zombie requests', async () => {
        const symbol = 'BTCUSDT';

        // Mock apiService to be slow
        let resolveSlowRequest: (value: any) => void;
        vi.spyOn(apiService, 'fetchTicker24h').mockReturnValueOnce(
            new Promise(resolve => {
                resolveSlowRequest = resolve;
            })
        );

        // Start first request
        // Access private method
        (marketWatcher as any).pollSymbolChannel(symbol, 'ticker', 'bitunix');

        // We need to simulate that the first request becomes a "zombie" meaning the lock is removed/overwritten.
        const lockKey = `${symbol}:ticker`;
        const pendingMap = (marketWatcher as any).pendingRequests;
        const firstEntry = pendingMap.get(lockKey);
        expect(firstEntry).toBeDefined();

        // Simulate Prune: Remove the lock
        pendingMap.delete(lockKey);

        // Start second request (fast)
        vi.spyOn(apiService, 'fetchTicker24h').mockResolvedValueOnce({
            lastPrice: new Decimal(60000),
            priceChangePercent: new Decimal(5),
            highPrice: new Decimal(61000),
            lowPrice: new Decimal(59000),
            volume: new Decimal(1000),
            quoteVolume: new Decimal(60000000),
            provider: 'bitunix',
            symbol: symbol
        });

        await (marketWatcher as any).pollSymbolChannel(symbol, 'ticker', 'bitunix');

        // Verify second request updated state
        expect(marketState.updateSymbol).toHaveBeenCalledWith(symbol, expect.objectContaining({
            lastPrice: new Decimal(60000)
        }));

        vi.clearAllMocks(); // Clear call history

        // Now resolve the first (slow) request
        if (resolveSlowRequest!) {
            resolveSlowRequest({
                lastPrice: new Decimal(50000), // Old price
                priceChangePercent: new Decimal(1),
                highPrice: new Decimal(51000),
                lowPrice: new Decimal(49000),
                volume: new Decimal(1000),
                quoteVolume: new Decimal(50000000),
                provider: 'bitunix',
                symbol: symbol
            });
        }

        // Wait for microtasks
        await new Promise(resolve => setTimeout(resolve, 0));

        // Expect NO update from the first request because ID mismatch (it was removed from map)
        expect(marketState.updateSymbol).not.toHaveBeenCalled();
    });
});
