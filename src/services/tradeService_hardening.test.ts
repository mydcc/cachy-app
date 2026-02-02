
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tradeService } from './tradeService';
import { omsService } from './omsService';
import { Decimal } from 'decimal.js';

// Mock dependencies
vi.mock('./omsService', () => ({
  omsService: {
    getPositions: vi.fn(),
    updatePosition: vi.fn(),
    addOptimisticOrder: vi.fn(),
    removeOrder: vi.fn(),
    getOrder: vi.fn(),
    updateOrder: vi.fn(),
  }
}));

vi.mock('../stores/settings.svelte', () => ({
  settingsState: {
    apiProvider: 'bitunix',
    apiKeys: {
      bitunix: { key: 'test', secret: 'test' }
    }
  }
}));

vi.mock('./logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
  }
}));

describe('TradeService Hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('closePosition should refresh stale positions before closing', async () => {
    const symbol = 'BTCUSDT';
    const side = 'long';

    // Stale position (older than 200ms)
    const stalePos = {
      symbol,
      side,
      amount: new Decimal(10),
      lastUpdated: Date.now() - 1000, // 1s old
    };

    (omsService.getPositions as any).mockReturnValue([stalePos]);

    // Mock the sync fetch response
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({
        data: [{
          symbol,
          positionSide: 'LONG',
          positionAmount: '10', // Confirming same amount for test simplicity
          updateTime: Date.now()
        }]
      }))
    });

    // Mock the order execution fetch response
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({ code: 0, msg: 'success' }))
    });

    // Call closePosition (full close)
    await tradeService.closePosition({ symbol, positionSide: side });

    // Expect fetch to have been called for sync first
    expect(global.fetch).toHaveBeenNthCalledWith(1, "/api/sync/positions-pending", expect.anything());
    // Then for order
    expect(global.fetch).toHaveBeenNthCalledWith(2, "/api/orders", expect.anything());
  });

  it('closePosition should NOT refresh fresh positions', async () => {
    const symbol = 'BTCUSDT';
    const side = 'long';

    // Fresh position
    const freshPos = {
      symbol,
      side,
      amount: new Decimal(10),
      lastUpdated: Date.now() - 50, // 50ms old
    };

    (omsService.getPositions as any).mockReturnValue([freshPos]);

    // Mock only order execution
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({ code: 0, msg: 'success' }))
    });

    await tradeService.closePosition({ symbol, positionSide: side });

    // Should skip sync
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith("/api/orders", expect.anything());
  });
});
