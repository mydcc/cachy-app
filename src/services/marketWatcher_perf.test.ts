/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
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
import { marketWatcher } from './marketWatcher';
import { bitunixWs } from './bitunixWs';

// Mock bitunixWs
vi.mock('./bitunixWs', () => ({
    bitunixWs: {
        pendingSubscriptions: new Set(),
        subscribe: vi.fn(),
        unsubscribe: vi.fn(),
    }
}));

// Mock settings
vi.mock('../stores/settings.svelte', () => ({
    settingsState: {
        apiProvider: 'bitunix',
        capabilities: { marketData: true },
        marketDataInterval: 1000
    }
}));

// Mock other dependencies
vi.mock('../stores/market.svelte', () => ({
    marketState: {
        data: {},
        connectionStatus: 'connected',
        updateSymbol: vi.fn(),
        updateSymbolKlines: vi.fn(),
    }
}));
vi.mock('./apiService', () => ({
    apiService: {
        fetchTicker24h: vi.fn().mockResolvedValue({}),
        fetchBitunixKlines: vi.fn().mockResolvedValue([]),
    }
}));
vi.mock('./storageService', () => ({
    storageService: {
        getKlines: vi.fn(),
        saveKlines: vi.fn(),
    }
}));
vi.mock('$app/environment', () => ({
    browser: true
}));

describe('MarketWatcher Performance', () => {
    let watcher: any;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        watcher = marketWatcher as any;
        watcher.stopPolling();
        watcher.requests.clear();
        watcher.pendingRequests.clear();
        (bitunixWs.pendingSubscriptions as Set<string>).clear();

        // Reset dirty flag
        if (watcher['_subscriptionsDirty'] !== undefined) watcher['_subscriptionsDirty'] = false;
    });

    afterEach(() => {
        watcher.stopPolling();
        vi.useRealTimers();
    });

    it('OPTIMIZED: should NOT call syncSubscriptions periodically if no changes', async () => {
         watcher.startPolling();
         const syncSpy = vi.spyOn(watcher, 'syncSubscriptions');
         await vi.advanceTimersByTimeAsync(2000); // Startup

         syncSpy.mockClear();

         // Register sets dirty=true
         watcher.register('BTCUSDT', 'price');

         // Should NOT be called synchronously anymore
         expect(syncSpy).not.toHaveBeenCalled();

         // Advance 1.1s (loop tick)
         await vi.advanceTimersByTimeAsync(1100);

         // Should have been called ONCE (to handle dirty)
         expect(syncSpy).toHaveBeenCalledTimes(1);

         syncSpy.mockClear();

         // Advance 10s more. No changes.
         await vi.advanceTimersByTimeAsync(10000);

         // Should be 0 calls (periodic check removed)
         expect(syncSpy).toHaveBeenCalledTimes(0);
    });

    it('OPTIMIZED: batches multiple registrations', async () => {
        watcher.startPolling();
        const syncSpy = vi.spyOn(watcher, 'syncSubscriptions');
        await vi.advanceTimersByTimeAsync(2000);

        syncSpy.mockClear();

        // Burst registration
        watcher.register('BTCUSDT', 'price');
        watcher.register('ETHUSDT', 'price');
        watcher.register('SOLUSDT', 'price');

        // Should NOT be called synchronously
        expect(syncSpy).not.toHaveBeenCalled();

        // Advance 1.1s
        await vi.advanceTimersByTimeAsync(1100);

        // Should be called EXACTLY ONCE (batched)
        expect(syncSpy).toHaveBeenCalledTimes(1);
    });
});
