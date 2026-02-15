// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tradeService } from './tradeService';
import { omsService } from './omsService';
import Decimal from 'decimal.js';

vi.mock('../stores/settings.svelte', async () => {
    return {
        settingsState: {
            apiProvider: 'bitunix',
            apiKeys: {
                bitunix: { key: 'test', secret: 'test' }
            },
            appAccessToken: 'token'
        }
    };
});

vi.mock('../stores/market.svelte', async () => {
    // Dynamic import for Decimal inside hoisted mock
    const { Decimal } = await import('decimal.js');
    return {
        marketState: {
            data: {
                'BTCUSDT': { lastPrice: new Decimal(50000) }
            },
            updateSymbol: vi.fn()
        }
    };
});

describe('TradeService Flash Close Hardening', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset OMS
        (omsService as any).positions = new Map();
        (omsService as any).orders = new Map();

        // Mock OMS getPositions
        vi.spyOn(omsService, 'getPositions').mockReturnValue([
            {
                symbol: 'BTCUSDT',
                side: 'long',
                amount: new Decimal(1),
                entryPrice: new Decimal(40000),
                unrealizedPnl: new Decimal(10000),
                leverage: new Decimal(1),
                marginMode: 'cross',
                lastUpdated: Date.now()
            }
        ]);

        // Mock addOptimisticOrder
        vi.spyOn(omsService, 'addOptimisticOrder');
    });

    it('should proceed with close even if cancelAllOrders fails', async () => {
        // Mock signedRequest
        const signedRequestSpy = vi.spyOn(tradeService as any, 'signedRequest');

        // Setup cancelAllOrders to fail
        signedRequestSpy.mockImplementation(async (method, endpoint, payload) => {
            if (payload && payload.type === 'cancel-all') {
                throw new Error('Network Error on Cancel');
            }
            // Close order succeeds
            return { code: 0, msg: 'success', data: { orderId: 'close-1' } };
        });

        await tradeService.flashClosePosition('BTCUSDT', 'long');

        // Expect cancel called
        expect(signedRequestSpy).toHaveBeenCalledWith('POST', '/api/orders', expect.objectContaining({
            type: 'cancel-all'
        }));

        // Expect close order called despite cancel failure
        expect(signedRequestSpy).toHaveBeenCalledWith('POST', '/api/orders', expect.objectContaining({
            side: 'SELL',
            reduceOnly: true
        }));
    });

    it('should use UUID for optimistic order', async () => {
        const signedRequestSpy = vi.spyOn(tradeService as any, 'signedRequest').mockResolvedValue({ code: 0 });
        const addOrderSpy = vi.spyOn(omsService, 'addOptimisticOrder');

        await tradeService.flashClosePosition('BTCUSDT', 'long');

        const orderCall = addOrderSpy.mock.calls[0][0];
        expect(orderCall.clientOrderId).toMatch(/^opt-[0-9a-f-]+$/); // UUID-like
    });
});
