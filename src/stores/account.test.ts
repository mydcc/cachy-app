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

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { accountState } from './account.svelte';
import { Decimal } from 'decimal.js';

describe('AccountManager', () => {
    beforeEach(() => {
        accountState.reset();
        vi.restoreAllMocks();
    });

    it('should update an existing position with partial data', () => {
        // Setup existing position
        accountState.updatePositionFromWs({
            positionId: '123',
            symbol: 'BTCUSDT',
            side: 'long',
            qty: '1.0',
            averagePrice: '50000',
            leverage: '10',
            unrealizedPNL: '100',
            margin: '500',
            marginMode: 'cross'
        });

        expect(accountState.positions).toHaveLength(1);
        expect(accountState.positions[0].size.toString()).toBe('1');

        // Partial update (no side, no leverage, just qty and pnl)
        accountState.updatePositionFromWs({
            positionId: '123',
            symbol: 'BTCUSDT',
            qty: '1.5',
            unrealizedPNL: '150'
        });

        expect(accountState.positions).toHaveLength(1);
        expect(accountState.positions[0].size.toString()).toBe('1.5'); // Should update
        expect(accountState.positions[0].side).toBe('long'); // Should persist
    });

    it('should trigger sync callback on partial update for unknown position (Race Condition Fix)', () => {
        const consoleSpy = vi.spyOn(console, 'warn');
        const syncCallback = vi.fn();

        // Register the callback
        accountState.registerSyncCallback(syncCallback);

        // Partial update for unknown position (missing side)
        accountState.updatePositionFromWs({
            positionId: '999',
            symbol: 'ETHUSDT',
            qty: '10.0',
            unrealizedPNL: '50'
            // side is missing
        });

        // It should still drop the update locally (because it's invalid)
        expect(accountState.positions).toHaveLength(0);

        // BUT it should trigger the sync callback
        expect(syncCallback).toHaveBeenCalledTimes(1);

        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining('Ignored position update'),
            expect.anything()
        );
    });

    it('should remove a position when event is CLOSE', () => {
        accountState.updatePositionFromWs({
            positionId: '123',
            symbol: 'BTCUSDT',
            side: 'long',
            qty: '1.0',
            averagePrice: '50000'
        });
        expect(accountState.positions).toHaveLength(1);

        accountState.updatePositionFromWs({
            positionId: '123',
            event: 'CLOSE'
        });
        expect(accountState.positions).toHaveLength(0);
    });

    it('should remove a position when quantity is zero', () => {
        accountState.updatePositionFromWs({
            positionId: '123',
            symbol: 'BTCUSDT',
            side: 'long',
            qty: '1.0',
            averagePrice: '50000'
        });
        expect(accountState.positions).toHaveLength(1);

        accountState.updatePositionFromWs({
            positionId: '123',
            qty: '0'
        });
        expect(accountState.positions).toHaveLength(0);
    });

    // --- Order Management Tests ---

    it('should add a new open order', () => {
        accountState.updateOrderFromWs({
            orderId: 'o1',
            symbol: 'BTCUSDT',
            side: 'buy',
            type: 'limit',
            price: '40000',
            qty: '1.5',
            dealAmount: '0',
            orderStatus: 'NEW',
            ctime: Date.now()
        });

        expect(accountState.openOrders).toHaveLength(1);
        const order = accountState.openOrders[0];
        expect(order.orderId).toBe('o1');
        expect(order.symbol).toBe('BTCUSDT');
        expect(order.side).toBe('buy');
        expect(order.type).toBe('limit');
        expect(order.price.toString()).toBe('40000');
        expect(order.amount.toString()).toBe('1.5');
        expect(order.filled.toString()).toBe('0');
        expect(order.status).toBe('NEW');
    });

    it('should update an existing open order', () => {
        // Add order first
        accountState.updateOrderFromWs({
            orderId: 'o2',
            symbol: 'ETHUSDT',
            side: 'sell',
            type: 'limit',
            price: '3000',
            qty: '10',
            dealAmount: '0',
            orderStatus: 'NEW'
        });

        expect(accountState.openOrders).toHaveLength(1);
        expect(accountState.openOrders[0].filled.toString()).toBe('0');
        expect(accountState.openOrders[0].status).toBe('NEW');

        // Update the order
        accountState.updateOrderFromWs({
            orderId: 'o2',
            dealAmount: '5',
            orderStatus: 'PART_FILLED'
        });

        expect(accountState.openOrders).toHaveLength(1);
        expect(accountState.openOrders[0].filled.toString()).toBe('5');
        expect(accountState.openOrders[0].status).toBe('PART_FILLED');
        // Unchanged fields should remain
        expect(accountState.openOrders[0].side).toBe('sell');
        expect(accountState.openOrders[0].price.toString()).toBe('3000');
    });

    it('should remove an order when status is FILLED', () => {
        accountState.updateOrderFromWs({
            orderId: 'o3',
            symbol: 'SOLUSDT',
            side: 'buy',
            qty: '20'
        });
        expect(accountState.openOrders).toHaveLength(1);

        accountState.updateOrderFromWs({
            orderId: 'o3',
            orderStatus: 'FILLED'
        });
        expect(accountState.openOrders).toHaveLength(0);
    });

    it('should remove an order when status is CANCELED or PART_FILLED_CANCELED', () => {
        accountState.updateOrderFromWs({ orderId: 'o4', symbol: 'BTCUSDT' });
        accountState.updateOrderFromWs({ orderId: 'o5', symbol: 'ETHUSDT' });
        expect(accountState.openOrders).toHaveLength(2);

        accountState.updateOrderFromWs({ orderId: 'o4', orderStatus: 'CANCELED' });
        expect(accountState.openOrders).toHaveLength(1);

        accountState.updateOrderFromWs({ orderId: 'o5', orderStatus: 'PART_FILLED_CANCELED' });
        expect(accountState.openOrders).toHaveLength(0);
    });


    // --- Balance Management Tests ---

    it('should add a new USDT balance', () => {
        accountState.updateBalanceFromWs({
            coin: 'USDT',
            available: '1000',
            margin: '500',
            frozen: '100'
        });

        expect(accountState.assets).toHaveLength(1);
        const asset = accountState.assets[0];
        expect(asset.currency).toBe('USDT');
        expect(asset.available.toString()).toBe('1000');
        expect(asset.margin.toString()).toBe('500');
        expect(asset.frozen.toString()).toBe('100');
        expect(asset.total.toString()).toBe('1600'); // 1000 + 500 + 100
    });

    it('should update an existing USDT balance', () => {
        accountState.updateBalanceFromWs({
            coin: 'USDT',
            available: '1000',
            margin: '500',
            frozen: '100'
        });

        expect(accountState.assets).toHaveLength(1);

        accountState.updateBalanceFromWs({
            coin: 'USDT',
            available: '1200',
            margin: '600',
            frozen: '200'
        });

        expect(accountState.assets).toHaveLength(1);
        const asset = accountState.assets[0];
        expect(asset.available.toString()).toBe('1200');
        expect(asset.margin.toString()).toBe('600');
        expect(asset.frozen.toString()).toBe('200');
        expect(asset.total.toString()).toBe('2000'); // 1200 + 600 + 200
    });

    it('should ignore non-USDT balances', () => {
        accountState.updateBalanceFromWs({
            coin: 'BTC',
            available: '1.5',
            margin: '0',
            frozen: '0'
        });

        expect(accountState.assets).toHaveLength(0);
    });


    // --- Batch Updates Tests ---

    it('should handle batch position updates gracefully for empty or invalid arrays', () => {
        accountState.updatePositionsBatch([]);
        expect(accountState.positions).toHaveLength(0);

        accountState.updatePositionsBatch(null as any);
        expect(accountState.positions).toHaveLength(0);

        accountState.updatePositionsBatch(undefined as any);
        expect(accountState.positions).toHaveLength(0);
    });

    it('should process multiple positions in a batch', () => {
        accountState.updatePositionsBatch([
            { positionId: 'p1', symbol: 'BTCUSDT', side: 'long', qty: '1.0' },
            { positionId: 'p2', symbol: 'ETHUSDT', side: 'short', qty: '10.0' }
        ]);

        expect(accountState.positions).toHaveLength(2);
        expect(accountState.positions[0].positionId).toBe('p1');
        expect(accountState.positions[1].positionId).toBe('p2');
    });

    it('should handle batch order updates gracefully for empty or invalid arrays', () => {
        accountState.updateOrdersBatch([]);
        expect(accountState.openOrders).toHaveLength(0);

        accountState.updateOrdersBatch(null as any);
        expect(accountState.openOrders).toHaveLength(0);
    });

    it('should process multiple orders in a batch', () => {
        accountState.updateOrdersBatch([
            { orderId: 'o1', symbol: 'BTCUSDT', side: 'buy', type: 'limit', price: '40000', qty: '1.0' },
            { orderId: 'o2', symbol: 'ETHUSDT', side: 'sell', type: 'market', qty: '10.0' }
        ]);

        expect(accountState.openOrders).toHaveLength(2);
        expect(accountState.openOrders[0].orderId).toBe('o1');
        expect(accountState.openOrders[1].orderId).toBe('o2');
    });

    it('should handle batch balance updates gracefully for empty or invalid arrays', () => {
        accountState.updateBalanceBatch([]);
        expect(accountState.assets).toHaveLength(0);

        accountState.updateBalanceBatch(null as any);
        expect(accountState.assets).toHaveLength(0);
    });

    it('should process multiple balances in a batch', () => {
        accountState.updateBalanceBatch([
            { coin: 'USDT', available: '1000' }, // valid
            { coin: 'BTC', available: '1.0' },   // invalid coin
            { coin: 'USDT', available: '1500' }  // updates the valid one
        ]);

        expect(accountState.assets).toHaveLength(1);
        expect(accountState.assets[0].currency).toBe('USDT');
        expect(accountState.assets[0].available.toString()).toBe('1500');
    });


    // --- Subscription & Reset Tests ---

    it('should reset all state correctly', () => {
        accountState.updatePositionFromWs({ positionId: 'p1', symbol: 'BTCUSDT', side: 'long', qty: '1' });
        accountState.updateOrderFromWs({ orderId: 'o1', symbol: 'BTCUSDT', side: 'buy', type: 'limit', price: '40000', qty: '1' });
        accountState.updateBalanceFromWs({ coin: 'USDT', available: '1000' });

        expect(accountState.positions).toHaveLength(1);
        expect(accountState.openOrders).toHaveLength(1);
        expect(accountState.assets).toHaveLength(1);

        accountState.reset();

        expect(accountState.positions).toHaveLength(0);
        expect(accountState.openOrders).toHaveLength(0);
        expect(accountState.assets).toHaveLength(0);
    });

    it('should subscribe to state changes and receive initial snapshot immediately', () => {
        const mockFn = vi.fn();

        // Add some data
        accountState.updatePositionFromWs({ positionId: 'p1', symbol: 'BTCUSDT', side: 'long', qty: '1' });

        const unsubscribe = accountState.subscribe(mockFn);

        // It should call immediately with the initial state
        expect(mockFn).toHaveBeenCalledTimes(1);
        expect(mockFn).toHaveBeenCalledWith({
            positions: expect.any(Array),
            openOrders: expect.any(Array),
            assets: expect.any(Array)
        });
        expect(mockFn.mock.calls[0][0].positions).toHaveLength(1);

        // Cleanup
        unsubscribe();
    });

    it('should notify listeners after a debounce delay', async () => {
        const mockFn = vi.fn();
        const unsubscribe = accountState.subscribe(mockFn);

        // Initial call done
        expect(mockFn).toHaveBeenCalledTimes(1);

        // Update data
        accountState.updatePositionFromWs({ positionId: 'p1', symbol: 'BTCUSDT', side: 'long', qty: '1' });
        accountState.updatePositionFromWs({ positionId: 'p2', symbol: 'ETHUSDT', side: 'short', qty: '10' });

        // Debounce timer is running, not called yet
        expect(mockFn).toHaveBeenCalledTimes(1);

        // Wait for debounce timer (50ms in account.svelte.ts)
        await new Promise(resolve => setTimeout(resolve, 60));

        // Listener should be notified
        expect(mockFn).toHaveBeenCalledTimes(2);
        expect(mockFn.mock.calls[1][0].positions).toHaveLength(2);

        unsubscribe();
    });

});
