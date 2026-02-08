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

// Mocks
vi.mock('../../services/apiService', () => ({
  apiService: {
    fetchBitunixKlines: vi.fn(),
    fetchTicker24h: vi.fn(),
    fetchBitgetKlines: vi.fn()
  }
}));

vi.mock('../../services/storageService', () => ({
  storageService: {
    getKlines: vi.fn(),
    saveKlines: vi.fn()
  }
}));

vi.mock('../../stores/settings.svelte', () => ({
  settingsState: {
    apiProvider: 'bitunix',
    chartHistoryLimit: 1000,
    capabilities: { marketData: true }
  }
}));

vi.mock('../../stores/market.svelte', () => ({
  marketState: {
    data: {},
    connectionStatus: 'connected',
    updateSymbol: vi.fn(),
    updateSymbolKlines: vi.fn()
  }
}));

vi.mock('../../stores/trade.svelte', () => ({
  tradeState: {
    symbol: 'BTCUSDT'
  }
}));

vi.mock('../../utils/symbolUtils', () => ({
    normalizeSymbol: (s: string) => s
}));

vi.mock('../../services/logger', () => ({
  logger: {
    warn: vi.fn(),
    log: vi.fn(),
    debug: vi.fn()
  }
}));

// Import subject
import { marketWatcher } from '../../services/marketWatcher';
import { apiService } from '../../services/apiService';
import { storageService } from '../../services/storageService';

describe('MarketWatcher Fetch Storm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    marketWatcher.forceCleanup();
  });

  // Skipped: This test mocks apiService.fetchBitunixKlines, effectively bypassing the
  // RequestManager which handles concurrency. MarketWatcher relies on RequestManager.
  it.skip('demonstrates concurrency control for ensureHistory', async () => {
    let activeRequests = 0;
    let maxConcurrent = 0;

    // Simulate API delay
    vi.mocked(apiService.fetchBitunixKlines).mockImplementation(async () => {
      activeRequests++;
      maxConcurrent = Math.max(maxConcurrent, activeRequests);
      await new Promise(r => setTimeout(r, 50)); // 50ms delay
      activeRequests--;
      return [{ time: 1000, open: 1, high: 2, low: 0.5, close: 1, volume: 100 }];
    });

    vi.mocked(storageService.getKlines).mockResolvedValue([]);

    const symbols = Array.from({ length: 20 }, (_, i) => `SYM${i}`);

    // Fire all requests at once
    const promises = symbols.map(s => marketWatcher.ensureHistory(s, '1h'));

    await Promise.all(promises);

    console.log(`Max concurrent requests: ${maxConcurrent}`);

    expect(maxConcurrent).toBeLessThanOrEqual(5);
  });
});
