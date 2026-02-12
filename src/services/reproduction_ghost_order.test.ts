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

        // 3. Verify Handling (Should be STALE, not removed yet)
        const orderAfter = omsService.getOrder(stuckOrderId);
        expect(orderAfter).toBeDefined();
        expect(orderAfter?._isStale).toBe(true);

        // 4. Advance time to GC threshold (> 5 mins)
        // We modify the timestamp manually to simulate time passage for the same order object
        if (orderAfter) {
            orderAfter.timestamp = Date.now() - (5 * 60 * 1000 + 1000);
        }

        omsService.removeOrphanedOptimistic(30000); // Run again

        const orderFinal = omsService.getOrder(stuckOrderId);
        expect(orderFinal).toBeUndefined();

        console.log("Ghost Order Successfully Marked Stale then GC'd");
    });
});
