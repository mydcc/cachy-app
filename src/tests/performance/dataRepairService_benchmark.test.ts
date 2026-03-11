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
    let unixEnd = 0;

    vi.mocked(apiService.fetchBitunixKlines).mockImplementation(async () => {
      // takes 200ms and fails
      await new Promise(r => setTimeout(r, 200));
      unixEnd = performance.now();
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
