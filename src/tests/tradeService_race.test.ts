
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

    it('should remove optimistic order on Rate Limit (429)', async () => {
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

        // Mock Rate Limit
        (global.fetch as any).mockResolvedValue({
            ok: false,
            status: 429,
            text: async () => "Too Many Requests",
            json: async () => ({}),
        });

        // We assume the service throws an error with "429" in message based on fetch implementation
        // But TradeService.signedRequest checks "response.ok".
        // If !response.ok, it might throw BitunixApiError or generic Error.
        // Let's verify how signedRequest handles it.
        // It does: if (!response.ok ... ) throw new BitunixApiError(data.code || -1, ...);
        // If data.code is missing (likely in 429 text response), it might be -1.

        // Wait, tradeService.ts:
        // const text = await response.text();
        // const data = safeJsonParse(text);
        // if (!response.ok ...) throw new BitunixApiError(data.code || -1, ...);

        // So for this test to work with the *current* implementation,
        // we need to ensure the error thrown triggers the catch block in flashClosePosition.

        const removeOrderSpy = vi.spyOn(omsService, 'removeOrder');

        // Execute
        try {
            await tradeService.flashClosePosition('BTCUSDT', 'long');
        } catch (e) {
            // Expected
        }

        // With current code, 429 is NOT in the list, so it might FAIL this test (expecting call, but got none)
        // This confirms we need to add 429 handling.
        expect(removeOrderSpy).toHaveBeenCalled();
    });
});
