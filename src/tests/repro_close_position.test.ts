import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Decimal } from 'decimal.js';

// Hoist mocks
const {
  mockOmsService,
  mockAccountState,
  mockSettingsState,
  mockMarketState,
  mockApiService,
  mockLogger,
  mockRmsService
} = vi.hoisted(() => {
  return {
    mockOmsService: {
      getPositions: vi.fn(),
      updateOrder: vi.fn(),
    },
    mockAccountState: {
      positions: [] as any[],
    },
    mockSettingsState: {
      capabilities: { tradeExecution: true },
      apiKeys: { bitunix: { key: 'key', secret: 'secret' } },
    },
    mockMarketState: {
      data: {}
    },
    mockApiService: {
      fetchBitunixPrice: vi.fn(),
    },
    mockLogger: { log: vi.fn(), error: vi.fn(), warn: vi.fn() },
    mockRmsService: { validateTrade: vi.fn().mockReturnValue({ allowed: true }) }
  };
});

// Mock modules
vi.mock('../services/omsService', () => ({
  omsService: mockOmsService
}));

vi.mock('../stores/account.svelte', () => ({
  accountState: mockAccountState
}));

vi.mock('../stores/settings.svelte', () => ({
  settingsState: mockSettingsState
}));

vi.mock('../stores/market.svelte', () => ({
    marketState: mockMarketState
}));

vi.mock('../services/apiService', () => ({
  apiService: mockApiService
}));

vi.mock('../services/logger', () => ({
  logger: mockLogger
}));

vi.mock('../services/rmsService', () => ({
  rmsService: mockRmsService
}));

// Mock fetch
global.fetch = vi.fn();

import { tradeService } from '../services/tradeService';

describe('TradeService - Close Position Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: OMS is empty
    mockOmsService.getPositions.mockReturnValue([]);
    // Default: AccountState is empty
    mockAccountState.positions = [];

    // Mock successful fetch for placeOrder
    (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ code: 0, data: { orderId: '123' } })
    });

    // Mock price fetch (needed for risk check in placeOrder)
    mockApiService.fetchBitunixPrice.mockResolvedValue(new Decimal(50000));
  });

  it('SHOULD close position using AccountState Fallback when OMS is empty', async () => {
    // 1. Simulate the Condition
    // OMS is empty
    mockOmsService.getPositions.mockReturnValue([]);

    // AccountState DOES have the position
    mockAccountState.positions = [{
      symbol: 'BTCUSDT',
      side: 'long',
      size: new Decimal('1.5'),
      entryPrice: new Decimal('50000')
    }];

    const params = {
      symbol: 'BTCUSDT',
      positionSide: 'long' as const,
    };

    // 2. Execute
    // This should now SUCCEED because we implemented the fallback
    await expect(tradeService.closePosition(params)).resolves.not.toThrow();

    // 3. Verify it actually tried to place the order
    // Check if fetch was called with the correct quantity from AccountState (1.5)
    expect(global.fetch).toHaveBeenCalled();
    const callArgs = (global.fetch as any).mock.calls[0];
    const body = JSON.parse(callArgs[1].body);

    expect(body.qty).toBe('1.5');
    expect(body.symbol).toBe('BTCUSDT');
    expect(body.reduceOnly).toBe(true);
  });

  it('SHOULD throw POSITION_UNKNOWN if both OMS and AccountState are empty', async () => {
     mockOmsService.getPositions.mockReturnValue([]);
     mockAccountState.positions = [];

     const params = {
        symbol: 'BTCUSDT',
        positionSide: 'long' as const,
      };

      await expect(tradeService.closePosition(params)).rejects.toThrow('TRADE_ERRORS.POSITION_UNKNOWN');
  });
});
