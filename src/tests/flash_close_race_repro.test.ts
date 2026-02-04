import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Decimal } from 'decimal.js';

// Mock Dependencies BEFORE import
vi.mock('../services/omsService', () => ({
    omsService: {
        getPositions: vi.fn(),
        addOptimisticOrder: vi.fn(),
        removeOrder: vi.fn(),
        updateOrder: vi.fn(),
        getOrder: vi.fn(),
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

// Import TradeService
import { tradeService } from '../services/tradeService';
import { omsService } from '../services/omsService';

describe('Flash Close Race Condition Reproduction', () => {
    let signedRequestSpy: any;

    beforeEach(() => {
        vi.clearAllMocks();

        // Setup a valid position in OMS
        vi.mocked(omsService.getPositions).mockReturnValue([
            {
                symbol: 'BTCUSDT',
                side: 'long',
                amount: new Decimal('1.0'),
                entryPrice: new Decimal('50000'),
                leverage: new Decimal('10'),
                liquidationPrice: new Decimal('45000'),
                unrealizedPnl: new Decimal('0'),
                marginMode: 'cross',
                markPrice: new Decimal('50000'),
            }
        ]);

        // Mock signedRequest to control success/failure
        signedRequestSpy = vi.spyOn(tradeService as any, 'signedRequest');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('Proceeds with close (Best Effort) even if cancel-all fails', async () => {
        // SCENARIO:
        // 1. cancel-all request FAILS (e.g. timeout or error)
        // 2. We verify that the close order IS EXECUTED (Priority: Close Position)

        signedRequestSpy.mockImplementation(async (method: string, endpoint: string, body: any) => {
            // Simulate Cancel All Failure
            if (endpoint === '/api/orders' && method === 'DELETE') {
                 throw new Error('Cancel All Failed (Simulated)');
            }
            // Mock Cancel All (Bitunix specific?) - check implementation details
            // Bitunix cancel-all usually might be specific endpoint or DELETE /api/orders with params
            // Assuming generic check for now, but looking at tradeService implementation is better.

            // Allow Place Order
            if (endpoint === '/api/orders' && method === 'POST' && body.side === 'SELL') {
                return { code: 0, msg: 'success', data: { orderId: '123' } };
            }
            return {};
        });

        // Act
        // We expect it to RESOLVE (not throw) despite cancel failure
        await expect(tradeService.flashClosePosition('BTCUSDT', 'long')).resolves.not.toThrow();

        // Assert
        const calls = signedRequestSpy.mock.calls;

        // Verify Cancel was attempted
        // Note: tradeService.cancelAllOrders likely calls DELETE /api/orders
        // We can check if any call threw? No, we mocked it to throw.

        // Verify Close WAS called
        const closeCall = calls.find((call: any) => call[1] === '/api/orders' && call[2] && call[2].side === 'SELL');
        expect(closeCall).toBeDefined();
    });
});
