
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tradeService } from './tradeService';
import { omsService } from './omsService';
import { RetryPolicy } from '../utils/retryPolicy';

// Mock dependencies
vi.mock('./omsService', () => ({
    omsService: {
        getPositions: vi.fn(),
        addOptimisticOrder: vi.fn(),
        removeOrder: vi.fn(),
        updateOrder: vi.fn(),
        getOrder: vi.fn(),
        updatePosition: vi.fn()
    }
}));

vi.mock('./logger', () => ({
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
        },
        appAccessToken: 'token'
    }
}));

// Mock RetryPolicy
vi.mock('../utils/retryPolicy', () => ({
    RetryPolicy: {
        execute: vi.fn().mockImplementation(async (fn) => fn()) // Default pass-through
    }
}));

// Mock marketState
vi.mock('../stores/market.svelte', async () => {
    const { default: Decimal } = await import('decimal.js');
    return {
        marketState: {
            data: {
                'BTCUSDT': { lastPrice: new Decimal(50000) }
            },
            updateSymbolKlines: vi.fn(),
            updateSymbol: vi.fn()
        }
    };
});

describe('TradeService Flash Close Vulnerability', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('should PROCEED with flash close AND schedule retry if cancelAllOrders fails', async () => {
        const { default: Decimal } = await import('decimal.js');

        // 1. Setup Position
        const mockPosition = {
            symbol: 'BTCUSDT',
            side: 'long',
            amount: new Decimal(1.5),
            lastUpdated: Date.now()
        };
        (omsService.getPositions as any).mockReturnValue([mockPosition]);

        // 2. Mock cancelAllOrders to FAIL initially
        // We mock it to fail on the first call (direct) and succeed on the second (retry)
        // Note: tradeService is a singleton instance, so we spy on it.
        const cancelSpy = vi.spyOn(tradeService, 'cancelAllOrders')
            .mockRejectedValueOnce(new Error('Network Error'));

        // 3. Mock signedRequest (the close order) to SUCCEED
        const requestSpy = vi.spyOn(tradeService, 'signedRequest').mockResolvedValue({ code: '0', msg: 'Success' });

        // 4. Execute
        await expect(tradeService.flashClosePosition('BTCUSDT', 'long')).resolves.toEqual({ code: '0', msg: 'Success' });

        // 5. Verify cancel was called once explicitly
        expect(cancelSpy).toHaveBeenCalledTimes(1);
        expect(cancelSpy).toHaveBeenCalledWith('BTCUSDT', true);

        // 6. Verify RETRY was scheduled
        // Because cancelAllOrders failed, scheduleCancelRetry should be called, which calls RetryPolicy.execute
        expect(RetryPolicy.execute).toHaveBeenCalledWith(
            expect.any(Function),
            expect.objectContaining({ name: 'CancelOrders-BTCUSDT' })
        );
    });
});
