
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock apiService BEFORE importing marketWatcher
const { apiService } = await import('../services/apiService');

vi.mock('../services/apiService', () => ({
  apiService: {
    fetchTicker24h: vi.fn(),
    fetchBitunixKlines: vi.fn(),
    fetchBitgetKlines: vi.fn(),
    normalizeSymbol: vi.fn((s) => s),
  }
}));

import { marketWatcher } from '../services/marketWatcher';
import { settingsState } from '../stores/settings.svelte';

describe('MarketWatcher Zombie Request Logic', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Reset private state
    const mw = marketWatcher as any;
    mw.requests.clear();
    mw.pendingRequests.clear();
    mw.requestStartTimes.clear();
    mw.inFlight = 0;
    if (mw.prunedRequestIds) mw.prunedRequestIds.clear();
    mw.lastErrorLog = 0;

    // Set capabilities to allow polling
    settingsState.capabilities.marketData = true;
    settingsState.apiProvider = 'bitunix';
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('correctly handles zombie requests without double decrementing inFlight', async () => {
    const mw = marketWatcher as any;

    // Create a hanging promise that we control
    let resolveHang: (val?: any) => void = () => {};
    const hangPromise = new Promise((resolve) => {
      resolveHang = resolve;
    });

    // Setup mock to return the hanging promise
    vi.mocked(apiService.fetchTicker24h).mockReturnValue(hangPromise as any);

    // 1. Start a request (pollSymbolChannel is private, call it directly)
    const symbol = 'BTCUSDT';
    const channel = 'ticker';
    const lockKey = `${symbol}:${channel}`;

    // Directly invoke private method
    const pollPromise = mw.pollSymbolChannel(symbol, channel, 'bitunix');

    // Verify initial state
    expect(mw.inFlight).toBe(1);
    expect(mw.pendingRequests.has(lockKey)).toBe(true);

    // 2. Advance time past zombie threshold (20s)
    vi.advanceTimersByTime(21000);

    // 3. Trigger zombie pruning
    mw.pruneZombieRequests();

    // Verify state after pruning
    // The request should be removed from tracking maps
    expect(mw.pendingRequests.has(lockKey)).toBe(false);
    expect(mw.requestStartTimes.has(lockKey)).toBe(false);

    // inFlight should have been decremented by pruneZombieRequests
    expect(mw.inFlight).toBe(0);

    // 4. Resolve the hanging promise (simulate delayed network response)
    resolveHang({ lastPrice: '10000' });

    // Wait for microtasks (promise resolution)
    await pollPromise;

    // 5. Check for correct state (Regression Test)
    // The `finally` block runs. It should detect the request was pruned
    // and NOT decrement inFlight again.
    expect(mw.inFlight).toBe(0);
  });
});
