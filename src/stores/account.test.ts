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

    // Regression (BUG-0058): a WS push that omits `qty` entirely (e.g. an
    // UPDATE carrying only a margin/PnL change) used to be treated as a
    // close, because the same `Decimal(0)` fallback used for "field absent"
    // was also what `.isZero()` checked against — silently deleting a still
    // -open position from the store on the very next such push.
    it('does not close an existing position when a WS push omits qty', () => {
        accountState.updatePositionFromWs({
            positionId: '123', symbol: 'BTCUSDT', side: 'long',
            qty: '1.0', averagePrice: '50000', leverage: '10',
            unrealizedPNL: '100', margin: '500', marginMode: 'cross',
        });
        expect(accountState.positions).toHaveLength(1);

        // Margin/PnL-only update, no qty field at all.
        accountState.updatePositionFromWs({
            positionId: '123', unrealizedPNL: '150', margin: '520',
        });

        expect(accountState.positions).toHaveLength(1);
        expect(accountState.positions[0].size.toString()).toBe('1'); // preserved
        expect(accountState.positions[0].unrealizedPnl.toString()).toBe('150');
    });

    it('still closes a position when the push explicitly carries qty "0"', () => {
        accountState.updatePositionFromWs({
            positionId: '123', symbol: 'BTCUSDT', side: 'long',
            qty: '1.0', averagePrice: '50000', marginMode: 'cross',
        });
        expect(accountState.positions).toHaveLength(1);

        accountState.updatePositionFromWs({ positionId: '123', qty: '0' });

        expect(accountState.positions).toHaveLength(0);
    });

    it('still closes a position on an explicit CLOSE event with no qty', () => {
        accountState.updatePositionFromWs({
            positionId: '123', symbol: 'BTCUSDT', side: 'long',
            qty: '1.0', averagePrice: '50000', marginMode: 'cross',
        });
        expect(accountState.positions).toHaveLength(1);

        accountState.updatePositionFromWs({ positionId: '123', event: 'CLOSE' });

        expect(accountState.positions).toHaveLength(0);
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

    // Bug found during dev.cachy.app testing: a position opened directly on
    // the exchange (not through Cachy) reaches the WS position channel
    // before PositionsSidebar's one-time onMount REST fetch has hydrated it.
    // The WS position channel never carries entryPrice/liqPrice/marginRate
    // (see docs/bitunix-api/08_websocket.md's Position Channel — only qty,
    // side, leverage, margin, PnL, funding, fee), so a brand-new position
    // was created with those fields hard-defaulted to 0 and *nothing* ever
    // corrected it afterwards: fetchPositions() only runs on mount/key
    // change, never in response to a new-position WS event, and the
    // pre-existing syncCallback hook (already used for the "missing side"
    // case above) was never invoked for this case either.
    it('triggers sync callback when a brand-new WS position has no REST-only fields yet', () => {
        const syncCallback = vi.fn();
        accountState.registerSyncCallback(syncCallback);

        accountState.updatePositionFromWs({
            positionId: '777',
            symbol: 'ETHUSDT',
            side: 'short',
            qty: '0.003',
            leverage: '10',
            margin: '0.58',
            marginMode: 'ISOLATION',
            // No averagePrice/avgOpenPrice — matches the real WS position
            // channel payload shape.
        });

        expect(accountState.positions).toHaveLength(1);
        const pos = accountState.positions[0];
        expect(pos.entryPrice.toString()).toBe('0');
        expect(pos.liquidationPrice.toString()).toBe('0');

        // The position is usable immediately (qty/side/leverage/margin are
        // all live), but its REST-only fields are placeholders — the
        // callback signals "go fetch the real values".
        expect(syncCallback).toHaveBeenCalledTimes(1);
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

    // The wallet channel (08_websocket.md's Balance Channel) also carries
    // isolationMargin/crossMargin/isolationFrozen/crossFrozen/expMoney, which
    // updateBalanceFromWs discarded before parsing anything but
    // available/margin/frozen.
    it('parses isolationFrozen/crossFrozen/expMoney from a wallet push', () => {
        accountState.updateBalanceFromWs({
            coin: 'USDT',
            available: '1000',
            margin: '10',
            frozen: '0',
            isolationFrozen: '5',
            crossFrozen: '2',
            expMoney: '3.5',
        });

        const asset = accountState.assets.find((a) => a.currency === 'USDT');
        expect(asset?.isolationFrozen?.toString()).toBe('5');
        expect(asset?.crossFrozen?.toString()).toBe('2');
        expect(asset?.expMoney?.toString()).toBe('3.5');
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

        // Regression (order tooltip): leverage/marginMode/positionMode/TP-SL
        // were dropped at the OpenOrder type boundary even after the server
        // started sending them — the Orders tab tooltip showed "Leverage: x"
        // and a blank Margin Mode regardless of what the exchange returned.
        it('carries leverage/marginMode/positionMode/TP-SL through', () => {
            accountState.hydrateOpenOrders([
                {
                    id: '1', orderId: '1', symbol: 'ETHUSDT', type: 'LIMIT', side: 'BUY',
                    price: '3000', amount: '2', filled: '0', status: 'NEW', time: 1700000000000,
                    fee: '0', realizedPNL: '0', leverage: '15', marginMode: 'ISOLATION',
                    positionMode: 'HEDGE', tpPrice: '3100', slPrice: '2900',
                },
            ]);

            const order = accountState.openOrders[0];
            expect(order.leverage).toBe('15');
            expect(order.marginMode).toBe('ISOLATION');
            expect(order.positionMode).toBe('HEDGE');
            expect(order.tpPrice).toBe('3100');
            expect(order.slPrice).toBe('2900');
        });
    });

    describe('updateOrderFromWs — descriptive metadata (order tooltip)', () => {
        it('sets leverage/marginMode/TP-SL from a WS push (positionType, not marginMode)', () => {
            accountState.updateOrderFromWs({
                orderId: '1', symbol: 'ETHUSDT', side: 'BUY', type: 'LIMIT',
                price: '3000', qty: '2', dealAmount: '0', orderStatus: 'NEW',
                leverage: '15', positionType: 'ISOLATION', positionMode: 'HEDGE',
                tpPrice: '3100', slPrice: '2900',
            });

            const order = accountState.openOrders[0];
            expect(order.leverage).toBe('15');
            expect(order.marginMode).toBe('ISOLATION');
            expect(order.positionMode).toBe('HEDGE');
            expect(order.tpPrice).toBe('3100');
            expect(order.slPrice).toBe('2900');
        });

        it('preserves descriptive metadata across an update that omits it', () => {
            accountState.updateOrderFromWs({
                orderId: '1', symbol: 'ETHUSDT', side: 'BUY', type: 'LIMIT',
                price: '3000', qty: '2', dealAmount: '0', orderStatus: 'NEW',
                leverage: '15', positionType: 'ISOLATION',
            });

            // A later push (e.g. a PART_FILLED update) that doesn't repeat
            // leverage/marginMode must not wipe them.
            accountState.updateOrderFromWs({
                orderId: '1', dealAmount: '1', orderStatus: 'PART_FILLED',
            });

            const order = accountState.openOrders[0];
            expect(order.leverage).toBe('15');
            expect(order.marginMode).toBe('ISOLATION');
            expect(order.filled.toString()).toBe('1');
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

        // Bug found during dev.cachy.app testing: REST /api/account has no
        // isolationFrozen/crossFrozen/expMoney (WS-only fields, see
        // updateBalanceFromWs). A later REST poll was silently erasing
        // whatever the wallet WS push had set for these, so the
        // AccountTooltip rows for them never appeared in practice even
        // though the WS parsing itself was correct.
        it('preserves WS-only wallet fields across a later REST poll', () => {
            accountState.updateBalanceFromWs({
                coin: 'USDT',
                available: '1000',
                margin: '50',
                frozen: '10',
                isolationFrozen: '5',
                crossFrozen: '2',
                expMoney: '3.5',
            });

            accountState.hydrateBalance({ available: '1000', margin: '50', frozen: '10' });

            const asset = accountState.assets.find((a) => a.currency === 'USDT');
            expect(asset?.isolationFrozen?.toString()).toBe('5');
            expect(asset?.crossFrozen?.toString()).toBe('2');
            expect(asset?.expMoney?.toString()).toBe('3.5');
        });
    });

    // Regression: marginRate is REST-only (Bitunix never sends it over WS),
    // while realizedPNL *is* pushed live on every WS position update — the
    // two must not be treated the same way.
    describe('marginRate / realizedPnl (FEAT-0057)', () => {
        it('hydratePositions parses both from the REST snapshot', () => {
            accountState.hydratePositions([
                {
                    positionId: '1', symbol: 'BTCUSDT', side: 'LONG', marginMode: 'CROSS',
                    marginRate: '0.05', realizedPnl: '12.34',
                },
            ]);
            expect(accountState.positions[0].marginRate.toString()).toBe('0.05');
            expect(accountState.positions[0].realizedPnl.toString()).toBe('12.34');
        });

        it('updatePositionFromWs updates realizedPnl but preserves marginRate across a push', () => {
            accountState.hydratePositions([
                {
                    positionId: '1', symbol: 'BTCUSDT', side: 'LONG', marginMode: 'CROSS',
                    marginRate: '0.05', realizedPnl: '0',
                },
            ]);

            accountState.updatePositionFromWs({
                positionId: '1', symbol: 'BTCUSDT', side: 'long',
                qty: '1.5', realizedPNL: '3.21',
            });

            expect(accountState.positions[0].realizedPnl.toString()).toBe('3.21');
            // marginRate has no WS field to update from — must survive unchanged.
            expect(accountState.positions[0].marginRate.toString()).toBe('0.05');
        });

        it('a WS-only position (no prior REST hydration) defaults marginRate to 0', () => {
            accountState.updatePositionFromWs({
                positionId: '2', symbol: 'ETHUSDT', side: 'long',
                qty: '1', realizedPNL: '0',
            });
            expect(accountState.positions[0].marginRate.toString()).toBe('0');
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
