/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */


import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tradeService } from './tradeService';
import { omsService } from './omsService';

// Mock omsService
vi.mock('./omsService', () => ({
    omsService: {
        getPositions: vi.fn(),
        addOptimisticOrder: vi.fn(),
        removeOrder: vi.fn(),
        updateOrder: vi.fn(),
        getOrder: vi.fn()
    }
}));

// Mock logger to suppress errors during test
vi.mock('./logger', () => ({
    logger: {
        log: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
    }
}));

// Mock settingsState
vi.mock('../stores/settings.svelte', () => ({
    settingsState: {
        apiProvider: 'bitunix',
        apiKeys: {
            bitunix: { key: 'test', secret: 'test' }
        }
    }
}));

// Mock marketState
vi.mock('../stores/market.svelte', async () => {
    // Import Decimal dynamically to avoid hoisting issues
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

    it('should PROCEED with flash close even if cancelAllOrders fails (Hardened behavior)', async () => {
        // Import Decimal here for test setup
        const { default: Decimal } = await import('decimal.js');

        // 1. Setup Position
        const mockPosition = {
            symbol: 'BTCUSDT',
            side: 'long',
            amount: new Decimal(1.5),
            lastUpdated: Date.now()
        };
        (omsService.getPositions as any).mockReturnValue([mockPosition]);

        // 2. Mock cancelAllOrders to FAIL
        // We need to spy on the instance method. Since tradeService is an instance, we can spy on it.
        const cancelSpy = vi.spyOn(tradeService, 'cancelAllOrders').mockRejectedValue(new Error('Network Error'));

        // 3. Mock signedRequest (the close order) to SUCCEED
        const requestSpy = vi.spyOn(tradeService, 'signedRequest').mockResolvedValue({ code: '0', msg: 'Success' });

        // 4. Execute & Assert
        // Expectation: It SHOULD SUCCEED now (resolve)
        await expect(tradeService.flashClosePosition('BTCUSDT', 'long')).resolves.toEqual({ success: true, data: { code: '0', msg: 'Success' } });

        // Verify cancel was called
        expect(cancelSpy).toHaveBeenCalledWith('BTCUSDT', true);

        // Verify close order WAS called (despite abort)
        expect(requestSpy).toHaveBeenCalledWith(
            'POST',
            '/api/orders',
            expect.objectContaining({ side: 'SELL', orderType: 'MARKET', reduceOnly: true })
        );
    });
});
