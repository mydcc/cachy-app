import { describe, it, expect, beforeEach } from 'vitest';
import { accountStore } from './accountStore';
import { get } from 'svelte/store';
import { Decimal } from 'decimal.js';

describe('accountStore', () => {
    beforeEach(() => {
        accountStore.reset();
    });

    it('should initialize with empty state', () => {
        const store = get(accountStore);
        expect(store.positions).toEqual([]);
        expect(store.openOrders).toEqual([]);
    });

    it('should update position from WS (OPEN)', () => {
        const payload = {
            event: 'OPEN',
            positionId: '123',
            symbol: 'BTCUSDT',
            side: 'LONG',
            qty: '0.1',
            leverage: '10',
            unrealizedPNL: '5',
            margin: '100',
            marginMode: 'cross'
        };
        accountStore.updatePositionFromWs(payload);
        const store = get(accountStore);
        expect(store.positions.length).toBe(1);
        expect(store.positions[0].symbol).toBe('BTCUSDT');
        expect(store.positions[0].side).toBe('long');
    });

    it('should update position from WS (UPDATE)', () => {
        // First create
        accountStore.updatePositionFromWs({
            event: 'OPEN',
            positionId: '123',
            symbol: 'BTCUSDT',
            side: 'LONG',
            qty: '0.1',
            leverage: '10',
            unrealizedPNL: '5',
            margin: '100',
            averagePrice: '50000'
        });

        // Then update
        accountStore.updatePositionFromWs({
            event: 'UPDATE',
            positionId: '123',
            symbol: 'BTCUSDT',
            side: 'LONG',
            qty: '0.2', // Increased size
            leverage: '10',
            unrealizedPNL: '15',
            margin: '200'
            // averagePrice missing in update, should keep old?
        });

        const store = get(accountStore);
        expect(store.positions.length).toBe(1);
        expect(store.positions[0].size.toNumber()).toBe(0.2);
        expect(store.positions[0].entryPrice.toNumber()).toBe(50000); // Preserved
        expect(store.positions[0].unrealizedPnl.toNumber()).toBe(15);
    });

    it('should update position from WS (CLOSE)', () => {
        accountStore.updatePositionFromWs({
            event: 'OPEN',
            positionId: '123',
            symbol: 'BTCUSDT',
            side: 'LONG',
            qty: '0.1',
            leverage: '10',
            unrealizedPNL: '5',
            margin: '100'
        });

        accountStore.updatePositionFromWs({
            event: 'CLOSE',
            positionId: '123'
        });

        const store = get(accountStore);
        expect(store.positions.length).toBe(0);
    });

    it('should update order from WS', () => {
        accountStore.updateOrderFromWs({
            orderId: '999',
            symbol: 'ETHUSDT',
            side: 'BUY',
            type: 'LIMIT',
            price: '3000',
            qty: '1',
            orderStatus: 'NEW',
            ctime: '1600000000'
        });

        let store = get(accountStore);
        expect(store.openOrders.length).toBe(1);
        expect(store.openOrders[0].status).toBe('NEW');

        // Close it
        accountStore.updateOrderFromWs({
            orderId: '999',
            orderStatus: 'FILLED'
        });

        store = get(accountStore);
        expect(store.openOrders.length).toBe(0);
    });
});
