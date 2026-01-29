/*
 * Copyright (C) 2026 MYDCT
 * 
 * CRITICAL TEST: Flash-Close Position Binding
 * 
 * Verifies that flash close operations are strictly bound to known OMS positions
 * and do not use unsafe fallback amounts that could cause overfills.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Decimal } from 'decimal.js';

// Mock services before importing tradeService
vi.mock('../services/omsService', () => ({
    omsService: {
        getPositions: vi.fn(() => []),
        updatePosition: vi.fn(),
        updateOrder: vi.fn(),
        addOptimisticOrder: vi.fn(),
        removeOrder: vi.fn(),
        getOrder: vi.fn(),
        getAllOrders: vi.fn(() => [])
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
        isPro: true,
        apiProvider: 'bitunix',
        capabilities: {
            tradeExecution: true,
            proLicense: true
        },
        apiKeys: {
            bitunix: {
                key: 'test-public-key',
                secret: 'test-secret-key'
            },
            bitget: {
                key: '',
                secret: '',
                passphrase: ''
            }
        }
    }
}));

vi.mock('../stores/market.svelte', () => ({
    marketState: {
        data: {
            'BTCUSDT': {
                lastPrice: new (require('decimal.js').Decimal)('50000')
            },
            'ETHUSDT': {
                lastPrice: new (require('decimal.js').Decimal)('3000')
            }
        }
    }
}));

vi.mock('../services/rmsService', () => ({
    rmsService: {
        validateTrade: vi.fn(() => ({ allowed: true, reason: 'OK' }))
    }
}));

import { tradeService } from '../services/tradeService';
import { omsService } from '../services/omsService';

describe('Flash Close Position Binding (CRITICAL)', () => {
    let signedRequestSpy: any;

    beforeEach(() => {
        // Mock OMS with known position
        vi.mocked(omsService.getPositions).mockReturnValue([
            {
                symbol: 'BTCUSDT',
                side: 'long',
                amount: new Decimal('12.345'),
                entryPrice: new Decimal('50000'),
                leverage: new Decimal('10'),
                liquidationPrice: new Decimal('45000'),
                unrealizedPnl: new Decimal('0'),
                marginMode: 'cross'
            }
        ]);

        // Spy on signedRequest to inspect API calls
        signedRequestSpy = vi.spyOn(tradeService as any, 'signedRequest').mockResolvedValue({
            code: 0,
            msg: 'success',
            data: {
                orderId: 'test-order-123',
                symbol: 'BTCUSDT',
                side: 'SELL',
                orderType: 'MARKET',
                price: '0',
                qty: '12.345',
                status: 'FILLED',
                createTime: Date.now()
            }
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should use exact OMS position amount for flash close', async () => {
        await tradeService.flashClosePosition('BTCUSDT', 'long');

        const callArgs = signedRequestSpy.mock.calls[0];
        const body = callArgs[2];

        // CRITICAL: Must use exact position size, not Safe Max
        expect(body.qty).toBe('12.345');
        expect(body.reduceOnly).toBe(true);
        expect(body.orderType).toBe('MARKET');
    });

    it('should throw error when position is unknown', async () => {
        // Mock OMS with no positions
        vi.mocked(omsService.getPositions).mockReturnValue([]);

        await expect(
            tradeService.flashClosePosition('ETHUSDT', 'long')
        ).rejects.toThrow();
    });

    it('should use exact amount for closePosition with OMS data', async () => {
        await tradeService.closePosition({
            symbol: 'BTCUSDT',
            positionSide: 'long'
        });

        const callArgs = signedRequestSpy.mock.calls[0];
        const body = callArgs[2];

        expect(body.qty).toBe('12.345');
        expect(body.reduceOnly).toBe(true);
    });

    it('should allow partial close with explicit amount', async () => {
        await tradeService.closePosition({
            symbol: 'BTCUSDT',
            positionSide: 'long',
            amount: new Decimal('5.0')
        });

        const callArgs = signedRequestSpy.mock.calls[0];
        const body = callArgs[2];

        expect(body.qty).toBe('5');
        expect(body.reduceOnly).toBe(true);
    });

    it('should prevent opening opposite position with reduceOnly flag', async () => {
        await tradeService.flashClosePosition('BTCUSDT', 'long');

        const callArgs = signedRequestSpy.mock.calls[0];
        const body = callArgs[2];

        // Opposite side for long = sell
        expect(body.side).toBe('SELL');
        // CRITICAL: reduceOnly prevents opening short position
        expect(body.reduceOnly).toBe(true);
    });
});
