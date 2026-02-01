
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
                // positionId and breakEvenPrice are not in OMSPosition interface
            }
        ]);

        // Mock signedRequest to control success/failure
        // We use spyOn to intercept the calls
        signedRequestSpy = vi.spyOn(tradeService as any, 'signedRequest');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('PREVENTS race condition: ABORTS close if cancel-all fails', async () => {
        // SCENARIO:
        // 1. cancel-all request FAILS (e.g. timeout or error)
        // 2. We verify that the close order IS ABORTED (the fix)

        signedRequestSpy.mockImplementation(async (method: string, endpoint: string, body: any) => {
            if (body && body.type === 'cancel-all') {
                throw new Error('Cancel All Failed (Simulated)');
            }
            if (endpoint === '/api/orders' && body.side === 'SELL') {
                return { code: 0, msg: 'success', data: { orderId: '123' } };
            }
            return {};
        });

        // Act
        // We expect it TO THROW now, because we are strict about cancellation
        await expect(tradeService.flashClosePosition('BTCUSDT', 'long')).rejects.toThrow('Cancel All Failed (Simulated)');

        // Assert
        const calls = signedRequestSpy.mock.calls;

        // Find the Close call
        const closeCall = calls.find((call: any) => call[2] && call[2].side === 'SELL');

        // VERIFICATION: We expect the close call to NOT exist
        expect(closeCall).toBeUndefined();

        // Also verify cancel was attempted
        const cancelCall = calls.find((call: any) => call[2] && call[2].type === 'cancel-all');
        expect(cancelCall).toBeDefined();
    });
});
