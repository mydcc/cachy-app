
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { marketWatcher } from './marketWatcher';
import { apiService } from './apiService';

// Mock dependencies
vi.mock('./apiService', () => ({
  apiService: {
    fetchTicker24h: vi.fn(),
    fetchBitunixKlines: vi.fn(),
    fetchBitgetKlines: vi.fn(),
  }
}));

vi.mock('../stores/settings.svelte', () => ({
  settingsState: {
    apiProvider: 'bitunix',
    capabilities: { marketData: true },
    chartHistoryLimit: 1000
  }
}));

vi.mock('../stores/market.svelte', () => ({
  marketState: {
    data: {},
    connectionStatus: 'disconnected',
    updateSymbol: vi.fn(),
    updateSymbolKlines: vi.fn(),
  }
}));

vi.mock('./bitunixWs', () => ({
  bitunixWs: {
    pendingSubscriptions: new Set(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  }
}));

describe('MarketWatcher Hardening', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    marketWatcher.forceCleanup();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should not leak stagger timeouts', async () => {
    // Access private property for testing (casting to any)
    const mw = marketWatcher as any;

    // Simulate a request
    mw.requests.set('BTCUSDT', new Map([['price', 1]]));

    // Trigger polling cycle
    await mw.performPollingCycle();

    // Should have scheduled a stagger timeout
    expect(mw.staggerTimeouts.size).toBeGreaterThan(0);

    // Stop polling
    mw.stopPolling();

    // Timeouts should be cleared
    expect(mw.staggerTimeouts.size).toBe(0);
  });

  it('should handle API timeouts correctly without double wrapping', async () => {
    const mw = marketWatcher as any;
    const symbol = 'BTCUSDT';
    const channel = 'price';

    // Mock API to hang (simulate timeout at API service level)
    // The hardening removes the local race/timeout in MarketWatcher
    // and relies on apiService's timeout or handling.

    // We want to verify that pollSymbolChannel calls apiService with correct parameters
    // and handles the result.

    (apiService.fetchTicker24h as any).mockImplementation(() => new Promise(() => {}));

    mw.pollSymbolChannel(symbol, channel, 'bitunix');

    // Check if the promise is stored
    const lockKey = `${symbol}:${channel}`;
    expect(mw.pendingRequests.has(lockKey)).toBe(true);

    // If we call forceCleanup, it should clear pending requests
    mw.forceCleanup();
    expect(mw.pendingRequests.has(lockKey)).toBe(false);
  });
});
