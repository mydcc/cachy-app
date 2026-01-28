
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tradeService } from './tradeService';
import { omsService } from './omsService';
import { settingsState } from '../stores/settings.svelte';
import { Decimal } from 'decimal.js';

// Mock dependencies
vi.mock('./omsService', () => ({
  omsService: {
    getPositions: vi.fn(),
    addOptimisticOrder: vi.fn(),
    updatePosition: vi.fn()
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

// Mock global fetch
global.fetch = vi.fn();

describe('tradeService Validation Hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Setup default position
    (omsService.getPositions as any).mockReturnValue([
      {
        symbol: 'BTCUSDT',
        side: 'long',
        amount: new Decimal(100),
        entryPrice: new Decimal(50000),
        unrealizedPnl: new Decimal(100)
      }
    ]);
  });

  it('should throw error when closing position with negative amount', async () => {
    const invalidAmount = new Decimal(-50);
    // Updated expectation to match implementation
    await expect(tradeService.closePosition({
      symbol: 'BTCUSDT',
      positionSide: 'long',
      amount: invalidAmount
    })).rejects.toThrow("apiErrors.invalidAmount");
  });

  it('should throw error when closing position with amount > position size', async () => {
    const hugeAmount = new Decimal(999999);
    // Updated expectation to match implementation
    await expect(tradeService.closePosition({
      symbol: 'BTCUSDT',
      positionSide: 'long',
      amount: hugeAmount
    })).rejects.toThrow("apiErrors.invalidAmount");
  });

  it('should throw error when closing position with zero amount', async () => {
    const zeroAmount = new Decimal(0);
    // Updated expectation to match implementation
    await expect(tradeService.closePosition({
      symbol: 'BTCUSDT',
      positionSide: 'long',
      amount: zeroAmount
    })).rejects.toThrow("apiErrors.invalidAmount");
  });
});
