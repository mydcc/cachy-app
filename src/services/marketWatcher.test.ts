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
import { settingsState } from '../stores/settings.svelte';
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
        chartHistoryLimit: 1000
    }
}));

vi.mock('./storageService', () => ({
    storageService: {
        getKlines: vi.fn().mockResolvedValue([]),
        saveKlines: vi.fn().mockResolvedValue(undefined)
    }
}));

vi.mock('./activeTechnicalsManager.svelte', () => ({
    activeTechnicalsManager: {
        forceRefresh: vi.fn()
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
        if (watcher.historyLocks) watcher.historyLocks.clear();
        if (watcher.exhaustedHistory) watcher.exhaustedHistory.clear();
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
});

describe('Data Integrity & Gap Filling', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset internal state
        if (watcher.pendingRequests) watcher.pendingRequests.clear();
        if (watcher.requests) watcher.requests.clear();
        if (watcher.historyLocks) watcher.historyLocks.clear();
        if (watcher.exhaustedHistory) watcher.exhaustedHistory.clear();
    });

    it('should fill gaps in kline data during ensureHistory', async () => {
        // Setup mock klines with a gap
        // 1m candles: 10:00, 10:02 (Missing 10:01)
        const t0 = 1600000000000;
        const t1 = t0 + 60000;
        const t2 = t0 + 120000;

        const klines = [
            { time: t0, open: new Decimal(100), high: new Decimal(105), low: new Decimal(95), close: new Decimal(102), volume: new Decimal(10) },
            // Missing t1
            { time: t2, open: new Decimal(102), high: new Decimal(108), low: new Decimal(101), close: new Decimal(107), volume: new Decimal(15) }
        ];

        // Override limit to prevent backfill loop
        (settingsState as any).chartHistoryLimit = 2;

        // Mock apiService.fetchBitunixKlines to return these klines
        const fetchSpy = vi.mocked(apiService.fetchBitunixKlines);
        fetchSpy.mockResolvedValue(klines as any);

        // Call ensureHistory
        const symbol = 'BTCUSDT';
        const tf = '1m';
        await watcher.ensureHistory(symbol, tf);

        // Verify marketState.updateSymbolKlines was called with filled data
        expect(marketState.updateSymbolKlines).toHaveBeenCalledTimes(1);
        const calledArg = (marketState.updateSymbolKlines as any).mock.calls[0][2];

        // Expect 3 items: t0, t1 (filled), t2
        expect(calledArg).toHaveLength(3);
        expect(calledArg[0].time).toBe(t0);
        expect(calledArg[1].time).toBe(t1); // Filled
        expect(calledArg[2].time).toBe(t2);

        // Verify filled candle properties (Flat candle based on prev close)
        expect(calledArg[1].open.toString()).toBe('102');
        expect(calledArg[1].close.toString()).toBe('102');
        expect(calledArg[1].volume.toString()).toBe('0');
    });
});
