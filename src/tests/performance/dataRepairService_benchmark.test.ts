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
import { apiService } from '../../services/apiService';
import { dataRepairService } from '../../services/dataRepairService';
import { journalState } from '../../stores/journal.svelte';

vi.mock('../../services/apiService', () => ({
  apiService: {
    fetchBitunixKlines: vi.fn(),
    fetchBitgetKlines: vi.fn(),
  }
}));

vi.mock('../../stores/journal.svelte', () => ({
  journalState: {
    entries: [],
    updateEntry: vi.fn(),
  }
}));

vi.mock('../../stores/settings.svelte', () => ({
  settingsState: {
    repairTimeframe: '15m',
  }
}));

vi.mock('../../lib/calculator', () => ({
  calculator: {
    calculateATR: vi.fn(() => ({ isNaN: () => false })),
  }
}));

vi.mock('../../utils/symbolUtils', () => ({
  normalizeSymbol: (s: string) => s
}));

vi.mock('../../services/logger', () => ({
  logger: {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }
}));

describe('DataRepairService fetchSmartKlines Concurrency Benchmark', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch candidates concurrently', async () => {
    journalState.entries = [
      {
        id: '1',
        symbol: 'BTCUSDT',
        status: 'Won',
        date: '2023-01-01T00:00:00Z',
        provider: 'custom',
      }
    ];

    let getStart = 0;

    vi.mocked(apiService.fetchBitunixKlines).mockImplementation(async () => {
      // takes 200ms and fails
      await new Promise(r => setTimeout(r, 200));
      throw new Error("apiErrors.symbolNotFound");
    });

    vi.mocked(apiService.fetchBitgetKlines).mockImplementation(async () => {
      // takes 50ms and succeeds
      await new Promise(r => setTimeout(r, 50));
      return Array(15).fill({ close: '1', open: '1', high: '1', low: '1', time: 1, volume: '1' });
    });

    getStart = performance.now();
    await dataRepairService.repairMissingAtr(vi.fn(), true);
    const end = performance.now();

    expect(end - getStart).toBeLessThan(650);
  });
});
