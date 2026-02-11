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
import { marketWatcher } from './marketWatcher';
import { apiService } from './apiService';
import { marketState } from '../stores/market.svelte';
import { Decimal } from 'decimal.js';

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
        capabilities: { marketData: true },
        marketDataInterval: 1 // Short interval for testing
    }
}));

// We need to access private methods/properties for some tests, or test via public API
// casting to any for test access
const watcher = marketWatcher as any;

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
        let resolveApi: (value: any) => void;
        const delayedPromise = new Promise(resolve => { resolveApi = resolve; });

        vi.mocked(apiService.fetchTicker24h).mockReturnValue(delayedPromise as any);

        // Trigger two polls effectively simultaneously
        const p1 = watcher.pollSymbolChannel('BTCUSDT', 'price', 'bitunix');
        const p2 = watcher.pollSymbolChannel('BTCUSDT', 'price', 'bitunix');

        // Verify API was called ONLY ONCE
        expect(apiService.fetchTicker24h).toHaveBeenCalledTimes(1);

        // Resolve the API
        resolveApi!({ lastPrice: '50000' });

        await Promise.all([p1, p2]);

        // Verify update was called
        expect(marketState.updateSymbol).toHaveBeenCalledWith('BTCUSDT', expect.objectContaining({ lastPrice: '50000' }));
    });

    it('should allow new request after previous one finishes', async () => {
        vi.mocked(apiService.fetchTicker24h).mockResolvedValue({ lastPrice: '50000' } as any);

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
        } catch (e) {
            // Expected
        }

        // Next call should proceed (lock released)
        vi.mocked(apiService.fetchTicker24h).mockResolvedValue({ lastPrice: '50000' } as any);
        await watcher.pollSymbolChannel('BTCUSDT', 'price', 'bitunix');

        expect(apiService.fetchTicker24h).toHaveBeenCalledTimes(2); // 1 fail + 1 success
    });

    describe('MarketWatcher Performance (fillGaps)', () => {
        it('should fill gaps efficiently', () => {
            const watcher = marketWatcher as any;
            const klines = [
                { time: 1000, close: new Decimal(100) },
                { time: 3000, close: new Decimal(110) } // Gap of 2000ms
            ];

            // Assume 1000ms interval
            const filled = watcher.fillGaps(klines, 1000);

            // Should have 1 gap filled at 2000
            expect(filled.length).toBe(3);
            expect(filled[1].time).toBe(2000);
            expect(filled[1].open).toBe(klines[0].close); // Flat candle
            expect(filled[1].volume.isZero()).toBe(true);
        });

        it('should reuse ZERO_VOL instance', () => {
            const watcher = marketWatcher as any;
            const klines = [
                { time: 1000, close: new Decimal(100) },
                { time: 4000, close: new Decimal(110) }
            ];
            const filled = watcher.fillGaps(klines, 1000);

            // filled[1] and filled[2] are gap candles
            expect(filled[1].volume).toBe(filled[2].volume); // Strict equality check
        });
    });
});
