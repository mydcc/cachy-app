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

    // Regression: `new Decimal("MARKET")` throws (decimal.js does not return
    // NaN like Number() does), so a malformed field on a raw WS push used to
    // crash the store outright instead of falling back safely.
    it('should not throw when a new position has a non-numeric field', () => {
        expect(() =>
            accountState.updatePositionFromWs({
                positionId: '456',
                symbol: 'ETHUSDT',
                side: 'long',
                qty: '1.5', // non-zero, so this isn't treated as a CLOSE
                averagePrice: 'MARKET',
                leverage: 'MARKET',
                unrealizedPNL: 'MARKET',
                margin: 'MARKET',
            }),
        ).not.toThrow();

        expect(accountState.positions).toHaveLength(1);
        expect(accountState.positions[0].size.toString()).toBe('1.5');
        expect(accountState.positions[0].entryPrice.toString()).toBe('0');
    });

    it('should not throw when a new order has a non-numeric price', () => {
        expect(() =>
            accountState.updateOrderFromWs({
                orderId: '789',
                symbol: 'ETHUSDT',
                side: 'BUY',
                type: 'MARKET',
                price: 'MARKET',
                qty: 'MARKET',
                dealAmount: 'MARKET',
                orderStatus: 'NEW',
            }),
        ).not.toThrow();

        expect(accountState.openOrders).toHaveLength(1);
        expect(accountState.openOrders[0].price.toString()).toBe('0');
    });

    it('should not throw when a balance push has a non-numeric field', () => {
        expect(() =>
            accountState.updateBalanceFromWs({
                coin: 'USDT',
                available: 'MARKET',
                margin: 'MARKET',
                frozen: 'MARKET',
            }),
        ).not.toThrow();

        expect(accountState.assets).toHaveLength(1);
        expect(accountState.assets[0].total.toString()).toBe('0');
    });

    // Regression: PositionsSidebar.svelte used to assign the raw REST JSON
    // straight into accountState.positions (string fields, no positionId),
    // silently violating the Position type (`response.json()` is `any`, so
    // nothing caught it) and breaking correlation with subsequent WS
    // updates. hydratePositions/hydrateOpenOrders/hydrateBalance replace
    // that with the same Decimal-safe parsing WS updates already use.
    describe('hydratePositions', () => {
        it('converts REST NormalizedPosition[] into typed Decimal positions', () => {
            accountState.hydratePositions([
                {
                    positionId: '456',
                    symbol: 'BTCUSDT',
                    side: 'LONG',
                    size: '1.5',
                    entryPrice: '50000',
                    unrealizedPnL: '100',
                    margin: '500',
                    leverage: '10',
                    marginMode: 'CROSS',
                },
            ]);

            expect(accountState.positions).toHaveLength(1);
            const pos = accountState.positions[0];
            expect(pos.positionId).toBe('456');
            expect(pos.side).toBe('long');
            expect(pos.size.toString()).toBe('1.5');
            expect(pos.entryPrice.toString()).toBe('50000');
            expect(pos.marginMode).toBe('cross');
        });

        it('does not throw on a malformed field and replaces the whole array', () => {
            accountState.hydratePositions([
                { positionId: '1', symbol: 'BTCUSDT', side: 'LONG', size: 'MARKET', marginMode: 'CROSS' },
            ]);
            expect(accountState.positions).toHaveLength(1);
            expect(accountState.positions[0].size.toString()).toBe('0');

            // A second hydration fully replaces the first (REST is a full snapshot).
            accountState.hydratePositions([]);
            expect(accountState.positions).toHaveLength(0);
        });
    });

    describe('hydrateOpenOrders', () => {
        it('converts REST NormalizedOrder[] into typed Decimal orders', () => {
            accountState.hydrateOpenOrders([
                {
                    id: '1', orderId: '1', symbol: 'ETHUSDT', type: 'LIMIT', side: 'BUY',
                    price: '3000', amount: '2', filled: '0', status: 'NEW', time: 1700000000000,
                    fee: '0', realizedPNL: '0',
                },
            ]);

            expect(accountState.openOrders).toHaveLength(1);
            const order = accountState.openOrders[0];
            expect(order.orderId).toBe('1');
            expect(order.side).toBe('buy');
            expect(order.type).toBe('limit');
            expect(order.price.toString()).toBe('3000');
        });
    });

    describe('hydrateBalance', () => {
        it('sets available/margin/frozen and derives total', () => {
            accountState.hydrateBalance({ available: '1000', margin: '50', frozen: '10' });
            expect(accountState.assets).toHaveLength(1);
            const asset = accountState.assets[0];
            expect(asset.available.toString()).toBe('1000');
            expect(asset.total.toString()).toBe('1060');
        });
    });

    // Regression: order history has no WS push channel of its own, so
    // PositionsSidebar relies on this callback to know when to refetch it —
    // it used to only refresh once per session (stale trades).
    describe('registerOrderCloseCallback', () => {
        it('fires when a WS push closes an open order', () => {
            accountState.updateOrderFromWs({
                orderId: '1', symbol: 'ETHUSDT', side: 'BUY', type: 'LIMIT',
                price: '3000', qty: '1', dealAmount: '0', orderStatus: 'NEW',
            });
            expect(accountState.openOrders).toHaveLength(1);

            const onClose = vi.fn();
            accountState.registerOrderCloseCallback(onClose);

            accountState.updateOrderFromWs({
                orderId: '1', orderStatus: 'FILLED',
            });

            expect(accountState.openOrders).toHaveLength(0);
            expect(onClose).toHaveBeenCalledTimes(1);
        });

        it('does not fire for updates that keep the order open', () => {
            accountState.updateOrderFromWs({
                orderId: '2', symbol: 'ETHUSDT', side: 'BUY', type: 'LIMIT',
                price: '3000', qty: '1', dealAmount: '0', orderStatus: 'NEW',
            });

            const onClose = vi.fn();
            accountState.registerOrderCloseCallback(onClose);

            accountState.updateOrderFromWs({
                orderId: '2', orderStatus: 'PARTIALLY_FILLED', dealAmount: '0.5',
            });

            expect(accountState.openOrders).toHaveLength(1);
            expect(onClose).not.toHaveBeenCalled();
        });

        it('does not fire for a close event on an order not being tracked', () => {
            const onClose = vi.fn();
            accountState.registerOrderCloseCallback(onClose);

            accountState.updateOrderFromWs({
                orderId: 'unknown', orderStatus: 'CANCELED',
            });

            expect(onClose).not.toHaveBeenCalled();
        });

        it('unregisters cleanly when passed null', () => {
            accountState.updateOrderFromWs({
                orderId: '3', symbol: 'ETHUSDT', side: 'BUY', type: 'LIMIT',
                price: '3000', qty: '1', dealAmount: '0', orderStatus: 'NEW',
            });

            const onClose = vi.fn();
            accountState.registerOrderCloseCallback(onClose);
            accountState.registerOrderCloseCallback(null);

            expect(() =>
                accountState.updateOrderFromWs({ orderId: '3', orderStatus: 'FILLED' }),
            ).not.toThrow();
            expect(onClose).not.toHaveBeenCalled();
        });
    });

    describe('totalUnrealizedPnl', () => {
        it('sums unrealizedPnl across all open positions', () => {
            accountState.hydratePositions([
                { symbol: 'BTCUSDT', side: 'LONG', unrealizedPnL: '100', marginMode: 'CROSS' },
                { symbol: 'ETHUSDT', side: 'SHORT', unrealizedPnL: '-30', marginMode: 'CROSS' },
            ]);
            expect(accountState.totalUnrealizedPnl.toString()).toBe('70');
        });

        it('is zero with no open positions', () => {
            accountState.hydratePositions([]);
            expect(accountState.totalUnrealizedPnl.toString()).toBe('0');
        });
    });
});
