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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { marketWatcher } from '../services/marketWatcher';
import { apiService } from '../services/apiService';
import { Decimal } from 'decimal.js';
import { marketState } from '../stores/market.svelte';

// Mock dependencies
vi.mock('../stores/settings.svelte', () => ({
    settingsState: {
        apiProvider: 'bitunix',
        chartHistoryLimit: 5000,
        capabilities: { marketData: true }
    }
}));

vi.mock('../stores/market.svelte', () => ({
    marketState: {
        data: {},
        updateSymbolKlines: vi.fn((sym, tf, klines, src) => {
             if (!marketState.data[sym]) marketState.data[sym] = { klines: {} };
             const existing = marketState.data[sym].klines[tf] || [];
             // Simulate simple append for mock
             marketState.data[sym].klines[tf] = existing.concat(klines);
        }),
    }
}));

vi.mock('../services/storageService', () => ({
    storageService: {
        getKlines: vi.fn().mockResolvedValue([]),
        saveKlines: vi.fn()
    }
}));

describe('MarketWatcher Backfill Performance', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (marketWatcher as any).historyLocks.clear();
        (marketWatcher as any).isPolling = true;
        marketState.data = {};
    });

    it('measures sequential vs parallel backfill', async () => {
        const LATENCY = 50;

        vi.spyOn(apiService, 'fetchBitunixKlines').mockImplementation(async (sym, tf, limit, start, end) => {
            await new Promise(r => setTimeout(r, LATENCY));

            const res = [];
            const endTime = end || 1700000000000;
            const intervalMs = 60000;

            for (let i = 0; i < limit; i++) {
                res.push({
                    time: endTime - (i * intervalMs),
                    open: new Decimal(100), high: new Decimal(110), low: new Decimal(90), close: new Decimal(105), volume: new Decimal(1000)
                });
            }
            // Return sorted Old->New (index 0 is oldest)
            return res.sort((a, b) => a.time - b.time);
        });

        const startTime = Date.now();
        await marketWatcher.ensureHistory('BTCUSDT', '1m');
        const duration = Date.now() - startTime;

        console.log(`Execution Time: ${duration}ms`);

        // Assertions for correctness
        // 1. Initial fetch (1000)
        // 2. Parallel backfill (4000)
        // Expect updateSymbolKlines to be called.

        expect(marketState.updateSymbolKlines).toHaveBeenCalled();
        const calls = (marketState.updateSymbolKlines as any).mock.calls;

        // Calculate total items pushed
        let totalItems = 0;
        calls.forEach(c => totalItems += c[2].length);

        // Should be at least 5000 (initial 1000 + 4 batches of 1000)
        expect(totalItems).toBeGreaterThanOrEqual(5000);

        // Expect parallel speedup
        // Sequential would be ~650ms. Parallel should be < 300ms.
        expect(duration).toBeLessThan(400);
    });
});
