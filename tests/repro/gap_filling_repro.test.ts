
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { marketWatcher } from '../../src/services/marketWatcher';
import { apiService } from '../../src/services/apiService';
import { marketState } from '../../src/stores/market.svelte';

// Mock dependencies
vi.mock('../../src/services/apiService', () => ({
    apiService: {
        fetchBitunixKlines: vi.fn(),
        fetchTicker24h: vi.fn()
    }
}));

vi.mock('../../src/stores/market.svelte', () => ({
    marketState: {
        updateSymbolKlines: vi.fn(),
        data: {
            'BTCUSDT': { klines: { '1m': [] } }
        },
        connectionStatus: 'disconnected'
    }
}));

vi.mock('../../src/stores/settings.svelte', () => ({
    settingsState: {
        apiProvider: 'bitunix',
        capabilities: { marketData: true },
        chartHistoryLimit: 1000
    }
}));

vi.mock('../../src/services/storageService', () => ({
    storageService: {
        getKlines: vi.fn().mockResolvedValue([]),
        saveKlines: vi.fn()
    }
}));

describe('MarketWatcher Gap Filling Reproduction', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Clear internal state of watcher
        const watcher = marketWatcher as any;
        if (watcher.historyLocks) watcher.historyLocks.clear();
        if (watcher.exhaustedHistory) watcher.exhaustedHistory.clear();
    });

    it('should fill gaps in market data', async () => {
        // Setup gapped data: 1m interval (60000ms)
        const T0 = 1000000;
        const T1 = T0 + 60000; // 1060000
        const T2 = T0 + 120000; // 1120000 (Gap at T1) -> Wait, if we send T0 and T2, gap is T1.

        // Start: T0
        // Next: T2 (Gap of 120000ms = 2 intervals. So T1 is missing).

        const gappedKlines = [
            { time: T0, open: "100", high: "110", low: "90", close: "105", volume: "10" },
            // Missing T1
            { time: T2, open: "105", high: "115", low: "95", close: "110", volume: "15" }
        ];

        // Mock API to return gapped data
        vi.mocked(apiService.fetchBitunixKlines).mockResolvedValue(gappedKlines as any);

        // Execute ensureHistory
        await marketWatcher.ensureHistory('BTCUSDT', '1m');

        // Verify apiService was called
        expect(apiService.fetchBitunixKlines).toHaveBeenCalled();

        // Check what was passed to marketState
        const calls = vi.mocked(marketState.updateSymbolKlines).mock.calls;
        expect(calls.length).toBeGreaterThan(0);

        const passedKlines = calls[0][2]; // 3rd argument is klines array

        // Assertion: Should now be 3 items (T0, T1-filled, T2)
        expect(passedKlines).toHaveLength(3);
        expect(passedKlines[0].time).toBe(T0);
        expect(passedKlines[1].time).toBe(T1); // Filled Gap
        expect(passedKlines[1].volume).toBe("0"); // Filled candle has 0 volume
        expect(passedKlines[1].close).toBe("105"); // Filled candle has prev close
        expect(passedKlines[2].time).toBe(T2);
    });
});
