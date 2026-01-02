import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { accountStore, type Position, type Order, type AccountInfo } from './accountStore';

describe('accountStore', () => {
    beforeEach(() => {
        accountStore.reset();
    });

    it('should initialize with empty state', () => {
        const state = get(accountStore);
        expect(state.positions).toEqual([]);
        expect(state.openOrders).toEqual([]);
        expect(state.historyOrders).toEqual([]);
        expect(state.accountInfo).toEqual({ available: 0, margin: 0, totalUnrealizedPnL: 0, marginCoin: 'USDT' });
    });

    it('should set positions', () => {
        const positions: Position[] = [{
            symbol: 'BTCUSDT',
            side: 'LONG',
            leverage: 10,
            size: 1,
            entryPrice: 50000,
            unrealizedPnL: 100,
            marginMode: 'CROSS',
            margin: 5000
        }];
        accountStore.setPositions(positions);
        expect(get(accountStore).positions).toEqual(positions);
    });

    it('should update existing position', () => {
        const initialPos: Position = {
            symbol: 'BTCUSDT',
            side: 'LONG',
            leverage: 10,
            size: 1,
            entryPrice: 50000,
            unrealizedPnL: 100,
            marginMode: 'CROSS',
            margin: 5000
        };
        accountStore.setPositions([initialPos]);

        const updatedPos: Position = { ...initialPos, unrealizedPnL: 200 };
        accountStore.updatePosition(updatedPos);

        const state = get(accountStore);
        expect(state.positions.length).toBe(1);
        expect(state.positions[0].unrealizedPnL).toBe(200);
    });

    it('should add new position via updatePosition if not exists', () => {
        const newPos: Position = {
            symbol: 'ETHUSDT',
            side: 'SHORT',
            leverage: 20,
            size: 10,
            entryPrice: 3000,
            unrealizedPnL: -50,
            marginMode: 'ISOLATED',
            margin: 1500
        };
        accountStore.updatePosition(newPos);
        
        const state = get(accountStore);
        expect(state.positions.length).toBe(1);
        expect(state.positions[0]).toEqual(newPos);
    });

    it('should remove position', () => {
        const pos1: Position = {
            symbol: 'BTCUSDT',
            side: 'LONG',
            leverage: 10,
            size: 1,
            entryPrice: 50000,
            unrealizedPnL: 100,
            marginMode: 'CROSS',
            margin: 5000
        };
        const pos2: Position = {
            symbol: 'ETHUSDT',
            side: 'SHORT',
            leverage: 20,
            size: 10,
            entryPrice: 3000,
            unrealizedPnL: -50,
            marginMode: 'ISOLATED',
            margin: 1500
        };
        accountStore.setPositions([pos1, pos2]);

        accountStore.removePosition('BTCUSDT', 'LONG');
        
        const state = get(accountStore);
        expect(state.positions.length).toBe(1);
        expect(state.positions[0]).toEqual(pos2);
    });
});
