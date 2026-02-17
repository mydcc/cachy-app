import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tradeService } from './tradeService';
import { omsService } from './omsService';
import { tradeState } from '../stores/trade.svelte';
import { settingsState } from '../stores/settings.svelte';

describe('TradeService TP/SL Reproduction Tests', () => {
    beforeEach(() => {
        vi.restoreAllMocks();

        settingsState.apiProvider = 'bitunix';
        settingsState.apiKeys = {
            bitunix: { key: 'test', secret: 'test' },
            bitget: { key: '', secret: '' }
        };

        vi.spyOn(omsService, 'getPositions').mockReturnValue([
            { symbol: 'BTCUSDT', side: 'long', amount: 1 }
        ] as any);
        tradeState.symbol = 'ETHUSDT';
    });

    it('should filter out invalid orders that do not match schema', async () => {
        const spy = vi.spyOn(tradeService, 'signedRequest');

        spy.mockImplementation(async (method, endpoint, payload: any) => {
            const sym = payload?.params?.symbol;
            if (sym === 'BTCUSDT') {
                // Return MALFORMED data (missing required triggerPrice)
                // TpSlOrder interface requires triggerPrice
                // We provide orderId so it passes deduplication logic
                return { rows: [{ orderId: 'invalid-order-1', symbol: 'BTCUSDT', planType: 'PROFIT' }] };
            }
            return [];
        });

        const orders = await tradeService.fetchTpSlOrders();

        // Currently, the invalid order is returned because there is no validation
        const invalidOrder = orders.find(o => o.orderId === 'invalid-order-1');

        // We want the system to be safe, so we expect it to be undefined
        expect(invalidOrder).toBeUndefined();
    });
});
