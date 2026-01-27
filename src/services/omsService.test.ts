
import { describe, it, expect, beforeEach } from 'vitest';
import { omsService } from './omsService';
import { Decimal } from 'decimal.js';

describe('OMS Service Memory Limits', () => {
    beforeEach(() => {
        // Reset internal state
        // Since omsService is a singleton, we cast to any to access private members for testing
        (omsService as any).orders = new Map();
        (omsService as any).positions = new Map();
    });

    it('should prune finalized orders when soft limit is reached', () => {
        const MAX_ORDERS = (omsService as any).MAX_ORDERS;

        // Fill with finalized orders
        for (let i = 0; i < MAX_ORDERS + 10; i++) {
            omsService.updateOrder({
                id: `ord-${i}`,
                symbol: 'BTCUSDT',
                side: 'buy',
                type: 'market',
                status: 'filled', // Finalized
                price: new Decimal(50000),
                amount: new Decimal(1),
                filledAmount: new Decimal(1),
                timestamp: Date.now() + i
            });
        }

        // Should have pruned to <= MAX_ORDERS
        const size = (omsService as any).orders.size;
        expect(size).toBeLessThanOrEqual(MAX_ORDERS);
    });

    it('should enforce HARD LIMIT even for active orders', () => {
        const HARD_LIMIT = 1000; // We expect to implement this
        // Currently (before fix), this test might fail or behavior is undefined (it just grows)

        // Determine the limit we are testing against (if not yet implemented, we assume we will add it)
        // For TDD, let's try to exceed the current soft limit with ACTIVE orders
        const SOFT_LIMIT = (omsService as any).MAX_ORDERS; // 500
        const OVERFLOW = 600;

        for (let i = 0; i < OVERFLOW; i++) {
            omsService.updateOrder({
                id: `active-${i}`,
                symbol: 'BTCUSDT',
                side: 'buy',
                type: 'limit',
                status: 'pending', // ACTIVE!
                price: new Decimal(50000),
                amount: new Decimal(1),
                filledAmount: new Decimal(0),
                timestamp: Date.now() + i
            });
        }

        const size = (omsService as any).orders.size;

        // BEFORE FIX: The soft limit (500) only prunes finalized. Active orders stay.
        // So size should be 600.
        // WE WANT: A Hard Limit (e.g. 1000) that prevents infinite growth.
        // Or if we set Hard Limit = Soft Limit * 2.

        // For this test to "fail" meaningfully before fix, let's assert that we want a mechanism
        // that caps it eventually.
        // Let's assume we want to cap at 1000.
        // If we inject 1100 active orders, it should be 1000.

        // Let's inject 1100
        for (let i = OVERFLOW; i < 1100; i++) {
             omsService.updateOrder({
                id: `active-${i}`,
                symbol: 'BTCUSDT',
                side: 'buy',
                type: 'limit',
                status: 'pending',
                price: new Decimal(50000),
                amount: new Decimal(1),
                filledAmount: new Decimal(0),
                timestamp: Date.now() + i
            });
        }

        // Assert Hard Limit (1000)
        expect((omsService as any).orders.size).toBeLessThanOrEqual(1000);
    });
});
