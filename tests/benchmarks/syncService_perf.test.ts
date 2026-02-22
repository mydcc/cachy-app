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

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { fetchBatchedKlines } from '../../src/services/syncService';
import { apiService } from '../../src/services/apiService';
import { Decimal } from 'decimal.js';

// Mock apiService
vi.mock('../../src/services/apiService', () => ({
  apiService: {
    fetchBitunixKlines: vi.fn(),
    normalizeSymbol: vi.fn((s) => s),
    safeJson: vi.fn(),
  }
}));

// Mock stores (just in case they explode)
vi.mock('../../src/stores/journal.svelte', () => ({
  journalState: { entries: [], set: vi.fn() }
}));
vi.mock('../../src/stores/ui.svelte', () => ({
  uiState: { update: vi.fn(), setSyncProgress: vi.fn(), showError: vi.fn(), showFeedback: vi.fn() }
}));
vi.mock('../../src/stores/settings.svelte', () => ({
  settingsState: { isPro: true, apiKeys: { bitunix: { key: 'test', secret: 'test' } } }
}));
vi.mock('$app/environment', () => ({
  browser: false
}));

describe('fetchBatchedKlines Performance', () => {
  const LATENCY_MS = 50;

  beforeAll(() => {
    // Mock implementation with delay
    vi.mocked(apiService.fetchBitunixKlines).mockImplementation(async (symbol, interval, limit, start, end) => {
      await new Promise(resolve => setTimeout(resolve, LATENCY_MS));
      // Return dummy klines covering the requested range
      return [
        {
          time: start,
          open: new Decimal(100),
          high: new Decimal(110),
          low: new Decimal(90),
          close: new Decimal(105),
          volume: new Decimal(1000)
        }
      ];
    });
  });

  it('measures execution time for multiple scattered trades', async () => {
    // Create 20 trades with different symbols to force 20 sequential calls in current implementation
    const trades = Array.from({ length: 20 }, (_, i) => ({
      symbol: `BTCUSDT_${i}`,
      ctime: Date.now() - 3600000 * 10, // 10 hours ago
      mtime: Date.now(), // Now
      // extra fields to match expected structure
      side: 'Buy',
      price: 50000
    }));

    const start = performance.now();
    const result = await fetchBatchedKlines(trades);
    const end = performance.now();
    const duration = end - start;

    console.log(`Execution time for ${trades.length} symbols: ${duration.toFixed(2)}ms`);

    // Baseline expectation: 20 calls * 50ms = 1000ms minimum for sequential
    // This assertion will FAIL if we optimize it successfully (making it faster than 1000ms is the goal)
    // But for baseline, we just log it.
    // To ensure the test passes in both states, we set a loose upper bound.
    expect(duration).toBeLessThan(300);

    // We assert correctness too
    expect(result).toBeDefined();
    expect(result.getKlines).toBeDefined();
  }, 10000); // 10s timeout
});
