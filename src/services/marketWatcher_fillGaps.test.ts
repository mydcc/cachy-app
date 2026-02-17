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


import { describe, it, expect, vi } from 'vitest';
import { marketWatcher } from './marketWatcher';
import { marketState } from '../stores/market.svelte';
import { Decimal } from 'decimal.js';

// Mock dependencies
vi.mock('./bitunixWs', () => ({ bitunixWs: { subscribe: vi.fn(), unsubscribe: vi.fn(), pendingSubscriptions: new Map() } }));
vi.mock('./apiService', () => ({ apiService: { fetchBitunixKlines: vi.fn() } }));
vi.mock('../stores/settings.svelte', () => ({ settingsState: { apiProvider: 'bitunix', capabilities: { marketData: true } } }));
vi.mock('../stores/market.svelte', () => ({
    marketState: {
        data: {},
        updateSymbolKlines: vi.fn(),
        updateSymbol: vi.fn(),
        connectionStatus: 'connected'
    }
}));
vi.mock('./logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), log: vi.fn(), debug: vi.fn() } }));
vi.mock('./storageService', () => ({ storageService: { getKlines: vi.fn(), saveKlines: vi.fn() } }));
vi.mock('./activeTechnicalsManager.svelte', () => ({ activeTechnicalsManager: { forceRefresh: vi.fn() } }));

describe('MarketWatcher Data Integrity', () => {
    it('fillGaps should fill missing candles with flat candles (Decimals)', () => {
        const intervalMs = 60000; // 1m
        const start = 1000000000000;

        const klines = [
            { time: start, open: new Decimal("100"), high: new Decimal("105"), low: new Decimal("95"), close: new Decimal("102"), volume: new Decimal("10") },
            // Gap of 2 minutes (missing T+1m, T+2m)
            { time: start + 3 * intervalMs, open: new Decimal("103"), high: new Decimal("108"), low: new Decimal("100"), close: new Decimal("106"), volume: new Decimal("15") }
        ];

        // Access private method
        const filled = (marketWatcher as any).fillGaps(klines, intervalMs);

        // Expected:
        // 0: T
        // 1: T+1m (Filled, flat from prev close 102)
        // 2: T+2m (Filled, flat from prev close 102)
        // 3: T+3m (Original)

        expect(filled.length).toBe(4);

        // Check Gap 1
        expect(filled[1].time).toBe(start + intervalMs);
        expect(filled[1].open.toString()).toBe("102");
        expect(filled[1].close.toString()).toBe("102");
        expect(filled[1].volume.toString()).toBe("0");

        // Check Gap 2
        expect(filled[2].time).toBe(start + 2 * intervalMs);
        expect(filled[2].open.toString()).toBe("102");
        expect(filled[2].close.toString()).toBe("102");
        expect(filled[2].volume.toString()).toBe("0");

        // Check Original
        expect(filled[3]).toEqual(klines[1]);
    });

    it('fillGaps should handle unsorted input safely', () => {
        // Current implementation assumes sorted input.
        // If unsorted (descending), it should just return the array without infinite loop.
        const intervalMs = 60000;
        const start = 1000000000000;

        const klines = [
            { time: start + 60000, close: new Decimal("100"), open: new Decimal(100) },
            { time: start, close: new Decimal("100"), open: new Decimal(100) }
        ] as any[];

        const filled = (marketWatcher as any).fillGaps(klines, intervalMs);

        // Should not hang and return same length (no gaps filled because diff is negative)
        expect(filled.length).toBe(2);
    });
});
