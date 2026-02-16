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
});
