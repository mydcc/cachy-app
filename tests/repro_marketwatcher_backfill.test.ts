import { describe, it, expect, vi, beforeEach } from 'vitest';
import { marketWatcher } from '../src/services/marketWatcher';
import { apiService } from '../src/services/apiService';
import { marketState } from '../src/stores/market.svelte';
import { Decimal } from 'decimal.js';

// Mock dependencies
vi.mock('../src/services/apiService');
vi.mock('../src/stores/market.svelte', () => ({
  marketState: {
    updateSymbolKlines: vi.fn(),
    data: {},
    updateSymbol: vi.fn()
  }
}));
vi.mock('../src/services/storageService', () => ({
  storageService: {
    getKlines: vi.fn().mockResolvedValue([]),
    saveKlines: vi.fn()
  }
}));
vi.mock('../src/stores/settings.svelte', () => ({
  settingsState: {
    apiProvider: 'bitunix',
    chartHistoryLimit: 5000,
    capabilities: { marketData: true }
  }
}));

// We rely on real KlineRawSchema from technicalsTypes, so we don't mock it.
// Assuming technicalsTypes.ts is available and imports Zod/Decimal correctly.

describe('MarketWatcher Backfill Reproduction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Simulate polling active so backfill runs
    (marketWatcher as any).isPolling = true;
    (marketWatcher as any).requests.set('BTCUSDT', new Map([['kline_1h', 1]]));
  });

  it('should process Decimal klines correctly during backfill', async () => {
    const symbol = 'BTCUSDT';
    const tf = '1h';

    // Mock apiService to return Decimal klines (simulating real behavior)
    const klines = Array(10).fill(0).map((_, i) => ({
      time: 1000000 + i * 3600000,
      open: new Decimal(100),
      high: new Decimal(110),
      low: new Decimal(90),
      close: new Decimal(105),
      volume: new Decimal(1000)
    }));

    // Mock fetchBitunixKlines to always return these 10 klines
    vi.spyOn(apiService, 'fetchBitunixKlines').mockResolvedValue(klines);

    await marketWatcher.ensureHistory(symbol, tf);

    const calls = (marketState.updateSymbolKlines as any).mock.calls;

    // 1st call: Initial fetch (10 items)
    // Backfill loop: Limit 5000 - 10 = 4990 needed.
    // It will trigger batches.
    // If bug exists, backfill batches are filtered to empty and updateSymbolKlines is NOT called for them.
    // If fixed, updateSymbolKlines should be called for backfill batches.

    console.log(`Update calls: ${calls.length}`);

    // We expect failure (calls.length === 1) before fix.
    // We expect success (calls.length > 1) after fix.

    // Asserting > 1 to fail if bug is present
    expect(calls.length).toBeGreaterThan(1);
  });
});
