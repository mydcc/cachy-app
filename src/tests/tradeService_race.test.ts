
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tradeService, BitunixApiError } from '../services/tradeService';
import { omsService } from '../services/omsService';
import { settingsState } from '../stores/settings.svelte';
import { Decimal } from 'decimal.js';

// Mocks
vi.mock('../services/omsService', () => ({
    omsService: {
        getPositions: vi.fn(),
        addOptimisticOrder: vi.fn(),
        removeOrder: vi.fn(),
        updateOrder: vi.fn(),
        updatePosition: vi.fn(),
    }
}));

vi.mock('../stores/settings.svelte', () => ({
    settingsState: {
        apiProvider: 'bitunix',
        apiKeys: {
            bitunix: { key: 'k', secret: 's' }
        }
    }
}));

vi.mock('../services/logger', () => ({
    logger: {
        log: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    }
}));

describe('TradeService Race Conditions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        global.fetch = vi.fn();
    });

    it('should handle optimistic order persistence on network failure (Two Generals Problem)', async () => {
        // Setup Position
        const position = {
            symbol: 'BTCUSDT',
            side: 'long',
            amount: new Decimal(1),
            entryPrice: new Decimal(50000),
            unrealizedPnl: new Decimal(100),
            leverage: new Decimal(10),
            marginMode: 'cross',
        };
        (omsService.getPositions as any).mockReturnValue([position]);

        // Mock Fetch Failure (Network Error)
        (global.fetch as any).mockRejectedValue(new Error('Network Error'));

        // Spy on optimistic add
        const addOptimisticSpy = vi.spyOn(omsService, 'addOptimisticOrder');
        const removeOrderSpy = vi.spyOn(omsService, 'removeOrder');

        // Execute
        await expect(tradeService.flashClosePosition('BTCUSDT', 'long')).rejects.toThrow('Network Error');

        // Assertions
        expect(addOptimisticSpy).toHaveBeenCalled();
        const callArgs = addOptimisticSpy.mock.calls[0][0];
        expect(callArgs._isOptimistic).toBe(true);

        // Crucial: In "Two Generals", we must NOT remove the order if we don't know the result
        expect(removeOrderSpy).not.toHaveBeenCalled();
    });

    it('should remove optimistic order on definitive API failure (400 Bad Request)', async () => {
        // Setup Position
        const position = {
            symbol: 'BTCUSDT',
            side: 'long',
            amount: new Decimal(1),
            entryPrice: new Decimal(50000),
            unrealizedPnl: new Decimal(100),
            leverage: new Decimal(10),
            marginMode: 'cross',
        };
        (omsService.getPositions as any).mockReturnValue([position]);

        // Mock Fetch Success but API Error Response (400)
        // Ensure text() is mocked as TradeService uses it
        (global.fetch as any).mockResolvedValue({
            ok: false,
            text: async () => JSON.stringify({ code: '400', msg: 'Bad Request' }),
            json: async () => ({ code: '400', msg: 'Bad Request' }),
        });

        const removeOrderSpy = vi.spyOn(omsService, 'removeOrder');

        // Execute
        await expect(tradeService.flashClosePosition('BTCUSDT', 'long')).rejects.toThrow();

        // Assertions
        expect(removeOrderSpy).toHaveBeenCalled();
    });
});
