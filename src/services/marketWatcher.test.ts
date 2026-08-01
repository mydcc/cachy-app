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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { marketWatcher } from './marketWatcher';
import { apiService, type Ticker24h } from './apiService';
import { marketState } from '../stores/market.svelte';

// Mock dependencies
vi.mock('./apiService', () => ({
    apiService: {
        fetchTicker24h: vi.fn(),
        fetchBitunixKlines: vi.fn(),
        fetchBitgetKlines: vi.fn()
    }
}));

vi.mock('../stores/market.svelte', () => ({
    marketState: {
        updateSymbol: vi.fn(),
        updateSymbolKlines: vi.fn(),
        data: {},
        connectionStatus: 'disconnected'
    }
}));

vi.mock('../stores/settings.svelte', () => ({
    settingsState: {
        apiProvider: 'bitunix',
        capabilities: { marketData: true }
    }
}));

// We need to access private methods/properties for some tests, or test via public API
type MarketWatcherInternals = {
    pendingRequests: { clear: () => void };
    requests: { clear: () => void };
    pollSymbolChannel: (symbol: string, channel: string, provider: "bitunix" | "bitget") => Promise<void>;
};
const watcher = marketWatcher as unknown as MarketWatcherInternals;

describe('MarketWatcher Locking & Deduplication', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset internal state if possible or assume clean state due to module reloading in some envs
        // In this env, singleton might persist, so we manually clear
        if (watcher.pendingRequests) watcher.pendingRequests.clear();
        if (watcher.requests) watcher.requests.clear();
    });

    it('should deduplicate concurrent requests for the same symbol/channel', async () => {
        // Setup a slow API response
        let resolveApi: (value: Ticker24h) => void;
        const delayedPromise = new Promise<Ticker24h>(resolve => { resolveApi = resolve; });

        vi.mocked(apiService.fetchTicker24h).mockReturnValue(delayedPromise);

        // Trigger two polls effectively simultaneously
        const p1 = watcher.pollSymbolChannel('BTCUSDT', 'price', 'bitunix');
        const p2 = watcher.pollSymbolChannel('BTCUSDT', 'price', 'bitunix');

        // Verify API was called ONLY ONCE
        expect(apiService.fetchTicker24h).toHaveBeenCalledTimes(1);

        // Resolve the API
        resolveApi!({ lastPrice: '50000' } as unknown as Ticker24h);

        await Promise.all([p1, p2]);

        // Verify update was called
        expect(marketState.updateSymbol).toHaveBeenCalledWith('BTCUSDT', expect.objectContaining({ lastPrice: '50000' }));
    });

    it('should allow new request after previous one finishes', async () => {
        vi.mocked(apiService.fetchTicker24h).mockResolvedValue({ lastPrice: '50000' } as unknown as Ticker24h);

        // First call
        await watcher.pollSymbolChannel('BTCUSDT', 'price', 'bitunix');
        expect(apiService.fetchTicker24h).toHaveBeenCalledTimes(1);

        // Second call (sequential)
        await watcher.pollSymbolChannel('BTCUSDT', 'price', 'bitunix');
        expect(apiService.fetchTicker24h).toHaveBeenCalledTimes(2);
    });

    it('should release lock even if API fails', async () => {
        vi.mocked(apiService.fetchTicker24h).mockRejectedValue(new Error('API Error'));

        // Call that fails
        try {
            await watcher.pollSymbolChannel('BTCUSDT', 'price', 'bitunix');
        } catch {
            // Expected
        }

        // Next call should proceed (lock released)
        vi.mocked(apiService.fetchTicker24h).mockResolvedValue({ lastPrice: '50000' } as unknown as Ticker24h);
        await watcher.pollSymbolChannel('BTCUSDT', 'price', 'bitunix');

        expect(apiService.fetchTicker24h).toHaveBeenCalledTimes(2); // 1 fail + 1 success
    });
});
