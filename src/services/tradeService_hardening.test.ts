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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tradeService } from './tradeService';
import { omsService } from './omsService';
import Decimal from 'decimal.js';

// Mock Dependencies
vi.mock('../stores/settings.svelte', () => ({
    settingsState: {
        apiProvider: 'bitunix',
        apiKeys: {
            bitunix: { key: 'test', secret: 'test' }
        }
    }
}));

vi.mock('./logger', () => ({
    logger: {
        warn: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
        debug: vi.fn() // Required by StrictDecimal
    }
}));

describe('TradeService Hardening', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset OMS
        (omsService as any).positions.clear();
        (omsService as any).orders.clear();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should throw critical error if all positions fail validation', async () => {
        // Mock API Response with malformed data (missing qty)
        const malformedResponse = {
            code: 0,
            msg: 'success',
            data: [
                { symbol: 'BTCUSDT', side: 'LONG', entryPrice: 50000 }, // Missing qty
                { symbol: 'ETHUSDT', side: 'SHORT', entryPrice: 3000 }  // Missing qty
            ]
        };

        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            text: () => Promise.resolve(JSON.stringify(malformedResponse)),
            json: () => Promise.resolve(malformedResponse)
        });

        // Use private method via cast or public wrapper if available
        // tradeService.fetchOpenPositionsFromApi is private.
        // We can access it via casting to any
        const service = tradeService as any;

        await expect(service.fetchOpenPositionsFromApi()).rejects.toThrow("Critical: All positions failed validation");
    });

    it('should partially succeed if some positions are valid', async () => {
        const mixedResponse = {
            code: 0,
            msg: 'success',
            data: [
                { symbol: 'BTCUSDT', side: 'LONG', entryPrice: 50000 }, // Invalid
                { symbol: 'ETHUSDT', side: 'SHORT', qty: 10, entryPrice: 3000 } // Valid
            ]
        };

        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            text: () => Promise.resolve(JSON.stringify(mixedResponse)),
            json: () => Promise.resolve(mixedResponse)
        });

        const service = tradeService as any;
        await service.fetchOpenPositionsFromApi();

        const positions = omsService.getPositions();
        expect(positions.length).toBe(1);
        expect(positions[0].symbol).toBe('ETHUSDT');
    });

    it('should force refresh in flashClose if data is stale', async () => {
        const symbol = 'BTCUSDT';
        // 1. Seed Stale Data in OMS
        const staleTime = Date.now() - 10000; // 10s old
        omsService.updatePosition({
            symbol,
            side: 'long',
            amount: new Decimal(1),
            entryPrice: new Decimal(50000),
            unrealizedPnl: new Decimal(0),
            leverage: new Decimal(1),
            marginMode: 'cross',
            timestamp: staleTime
        });

        // Mock API Response for refresh
        const freshResponse = {
            code: 0,
            msg: 'success',
            data: [
                { symbol, side: 'LONG', qty: 2, entryPrice: 50000 } // Amount changed to 2
            ]
        };

        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            text: () => Promise.resolve(JSON.stringify(freshResponse)),
            json: () => Promise.resolve(freshResponse)
        });

        // Mock signedRequest for the close order
        const spySigned = vi.spyOn(tradeService, 'signedRequest').mockResolvedValue({});

        await tradeService.flashClosePosition(symbol, 'long');

        // Expect fetch to have been called (refresh triggered)
        expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/sync/positions-pending'), expect.anything());

        // Expect close order to use the FRESH amount (2), not stale (1)
        expect(spySigned).toHaveBeenCalledWith(
            'POST',
            '/api/orders',
            expect.objectContaining({
                qty: '2'
            })
        );
    });
});
