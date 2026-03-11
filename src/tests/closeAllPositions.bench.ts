import { bench, describe, vi } from 'vitest';
import { tradeService } from '../services/tradeService';
import { omsService } from '../services/omsService';
import { Decimal } from 'decimal.js';

vi.mock('../services/omsService', () => ({
    omsService: {
        getPositions: vi.fn(() => [
            { symbol: 'BTCUSDT', side: 'long', amount: new Decimal('1'), lastUpdated: 0 },
            { symbol: 'ETHUSDT', side: 'short', amount: new Decimal('1'), lastUpdated: 0 },
            { symbol: 'XRPUSDT', side: 'long', amount: new Decimal('1'), lastUpdated: 0 },
            { symbol: 'SOLUSDT', side: 'short', amount: new Decimal('1'), lastUpdated: 0 },
            { symbol: 'DOGEUSDT', side: 'long', amount: new Decimal('1'), lastUpdated: 0 }
        ])
    }
}));

vi.mock('../services/logger', () => ({
    logger: {
        log: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
    }
}));

vi.mock('../stores/settings.svelte', () => ({
    settingsState: {
        apiProvider: 'bitunix',
        apiKeys: {
            bitunix: { key: 'test', secret: 'test' }
        }
    }
}));

describe('tradeService benchmark (Optimized)', () => {
    bench('closeAllPositions with pre-fetch', async () => {
        const origFetch = (tradeService as any)._doFetchOpenPositionsFromApi;
        (tradeService as any)._doFetchOpenPositionsFromApi = vi.fn().mockImplementation(async () => {
            await new Promise(resolve => setTimeout(resolve, 50));
            // Simulate that fetchOpenPositionsFromApi updates the cache correctly!
            vi.mocked(omsService.getPositions).mockReturnValue([
                { symbol: 'BTCUSDT', side: 'long', amount: new Decimal('1'), lastUpdated: Date.now() },
                { symbol: 'ETHUSDT', side: 'short', amount: new Decimal('1'), lastUpdated: Date.now() },
                { symbol: 'XRPUSDT', side: 'long', amount: new Decimal('1'), lastUpdated: Date.now() },
                { symbol: 'SOLUSDT', side: 'short', amount: new Decimal('1'), lastUpdated: Date.now() },
                { symbol: 'DOGEUSDT', side: 'long', amount: new Decimal('1'), lastUpdated: Date.now() }
            ]);
        });

        const origSignedReq = (tradeService as any).signedRequest;
        (tradeService as any).signedRequest = vi.fn().mockResolvedValue({ code: 0 });

        // Force a stale environment for the original code path:
        vi.mocked(omsService.getPositions).mockReturnValue([
            { symbol: 'BTCUSDT', side: 'long', amount: new Decimal('1'), lastUpdated: 0 },
            { symbol: 'ETHUSDT', side: 'short', amount: new Decimal('1'), lastUpdated: 0 },
            { symbol: 'XRPUSDT', side: 'long', amount: new Decimal('1'), lastUpdated: 0 },
            { symbol: 'SOLUSDT', side: 'short', amount: new Decimal('1'), lastUpdated: 0 },
            { symbol: 'DOGEUSDT', side: 'long', amount: new Decimal('1'), lastUpdated: 0 }
        ]);

        await (tradeService as any).closeAllPositions();

        (tradeService as any)._doFetchOpenPositionsFromApi = origFetch;
        (tradeService as any).signedRequest = origSignedReq;
    });
});
