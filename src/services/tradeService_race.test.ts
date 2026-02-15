
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tradeService } from './tradeService';
import { omsService } from './omsService';
import { Decimal } from 'decimal.js';
import { settingsState } from '../stores/settings.svelte';

// Mock dependencies
vi.mock('./omsService', () => ({
  omsService: {
    getPositions: vi.fn(),
    updatePosition: vi.fn(),
    addOptimisticOrder: vi.fn(),
    removeOrder: vi.fn(),
    getOrder: vi.fn(),
  }
}));

vi.mock('../stores/settings.svelte', () => ({
  settingsState: {
    apiProvider: 'bitunix',
    apiKeys: {
      bitunix: { key: 'test', secret: 'test' }
    },
    appAccessToken: 'test-token'
  }
}));

const globalFetch = vi.fn();

describe('TradeService Race Condition Hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.stubGlobal('fetch', globalFetch);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('should detect stale position and refresh from API before flash close', async () => {
    const staleTime = Date.now() - 1000;
    const stalePosition = {
      symbol: 'BTCUSDT',
      side: 'long',
      amount: new Decimal(1.5),
      entryPrice: new Decimal(50000),
      unrealizedPnl: new Decimal(100),
      leverage: new Decimal(10),
      marginMode: 'cross',
      lastUpdated: staleTime
    };

    // 1. Initial Check: Return stale position
    // 2+. Post-Sync Check: Return empty array
    vi.mocked(omsService.getPositions)
      .mockReturnValueOnce([stalePosition as any])
      .mockReturnValue([]);

    // Mock API response for Sync
    globalFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({
        code: 0,
        data: [] // Empty list
      }))
    });

    // Execute Flash Close
    // Should throw because position is gone after sync
    await expect(tradeService.flashClosePosition('BTCUSDT', 'long'))
      .rejects.toThrow('tradeErrors.positionNotFound');

    // Verify Sync was called
    expect(globalFetch).toHaveBeenCalledWith(
      '/api/sync/positions-pending',
      expect.objectContaining({ method: 'POST' })
    );
  });
});
