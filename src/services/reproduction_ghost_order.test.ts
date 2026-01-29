
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tradeService } from './tradeService';
import { omsService } from './omsService';
import Decimal from 'decimal.js';

// Mock dependencies
vi.mock('../stores/settings.svelte', () => ({
    settingsState: {
        apiProvider: 'bitunix',
        apiKeys: {
            bitunix: { key: 'test', secret: 'test', passphrase: 'test' }
        }
    }
}));

// Mock logger to avoid clutter
vi.mock('./logger', () => ({
    logger: {
        log: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
    }
}));

describe('Ghost Order Reproduction', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it('should cleanup ghost orders', async () => {
        // 1. Setup Initial State
        const symbol = 'ETHUSDT';
        // We manually inject an old optimistic order to simulate a "stuck" one
        const stuckOrderId = "opt-stuck-" + Date.now();
        omsService.addOptimisticOrder({
            id: stuckOrderId,
            symbol,
            side: 'sell',
            type: 'market',
            status: 'pending',
            price: new Decimal(0),
            amount: new Decimal(1),
            filledAmount: new Decimal(0),
            timestamp: Date.now() - 31000 // 31 seconds ago (older than 30s threshold)
        });

        // Verify it's there
        expect(omsService.getOrder(stuckOrderId)).toBeDefined();

        // 2. Trigger Cleanup Manually (Testing logic, not interval)
        omsService.removeOrphanedOptimistic(30000);

        // 3. Verify Removal
        const orderAfter = omsService.getOrder(stuckOrderId);
        expect(orderAfter).toBeUndefined();

        console.log("Ghost Order Successfully Removed");
    });
});
