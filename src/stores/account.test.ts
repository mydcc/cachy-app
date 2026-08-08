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
});
