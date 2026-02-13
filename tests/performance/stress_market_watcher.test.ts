
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Decimal } from 'decimal.js';

// 1. Hoisted Mocks & Globals
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn()
};
vi.stubGlobal('localStorage', localStorageMock);
vi.stubGlobal('window', {
    removeEventListener: vi.fn(),
    addEventListener: vi.fn(),
    crypto: { getRandomValues: vi.fn() }
});
vi.stubGlobal('navigator', { onLine: true, userAgent: 'node' });
vi.stubGlobal('WebSocket', class WebSocket {
    send() {}
    close() {}
    addEventListener() {}
    removeEventListener() {}
});

// Mocks
vi.mock('$app/environment', () => ({
  browser: true,
  dev: true
}));

vi.mock('../../src/services/apiService', () => ({
  apiService: {
    fetchTicker24h: vi.fn().mockResolvedValue({
      lastPrice: new Decimal(100),
      highPrice: new Decimal(110),
      lowPrice: new Decimal(90),
      volume: new Decimal(1000),
      quoteVolume: new Decimal(100000),
      priceChangePercent: new Decimal(5)
    }),
    fetchBitunixKlines: vi.fn().mockResolvedValue([])
  }
}));

vi.mock('../../src/stores/settings.svelte', () => ({
  settingsState: {
    apiProvider: 'bitunix',
    capabilities: { marketData: true },
    marketCacheSize: 100,
    apiKeys: { bitunix: { key: 'test', secret: 'test' } }
  }
}));

vi.mock('../../src/stores/trade.svelte', () => ({
  tradeState: {
    symbol: 'BTCUSDT',
  }
}));

vi.mock('../../src/stores/indicator.svelte', () => ({
  indicatorState: {}
}));

vi.mock('../../src/stores/favorites.svelte', () => ({
  favoritesState: {}
}));

vi.mock('../../src/services/activeTechnicalsManager.svelte', () => ({
  activeTechnicalsManager: {
    forceRefresh: vi.fn()
  }
}));

vi.mock('../../src/services/storageService', () => ({
    storageService: {
        getKlines: vi.fn().mockResolvedValue([]),
        saveKlines: vi.fn().mockResolvedValue(undefined),
        initDB: vi.fn()
    }
}));

import { marketWatcher } from '../../src/services/marketWatcher';
import { marketState } from '../../src/stores/market.svelte';
import { bitunixWs } from '../../src/services/bitunixWs';

describe('Stress Test: MarketWatcher & Data Flow', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    // Advance time to avoid "0 < 200" throttle issue at t=0
    await vi.advanceTimersByTimeAsync(1000);

    marketWatcher.forceCleanup();
    marketState.destroy();
    marketState.init(); // Restart timers using fake timers

    marketState.connectionStatus = 'connected';
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should handle 50 active symbol subscriptions without memory explosion', async () => {
    const SYMBOL_COUNT = 50;
    const symbols = Array.from({ length: SYMBOL_COUNT }, (_, i) => `SYM${i}USDT`);

    // 1. Registration
    for (const symbol of symbols) {
      marketWatcher.register(symbol, 'price');
      marketWatcher.register(symbol, 'ticker');
    }

    expect(marketWatcher.getActiveSymbols().length).toBe(SYMBOL_COUNT);

    // 2. Data Pump
    const UPDATES_PER_SYMBOL = 100;
    const BATCH_SIZE = 10;

    const startPump = performance.now();

    for (let i = 0; i < UPDATES_PER_SYMBOL; i++) {
        for (const symbol of symbols) {
            // Price Update
            (bitunixWs as any).handleMessage({
                ch: 'price',
                symbol: symbol,
                data: {
                    ip: (1000 + Math.random()).toFixed(2),
                    fr: "0.0001",
                    nft: Date.now() + 3600000
                }
            }, 'public');

            // Ticker Update
            (bitunixWs as any).handleMessage({
                ch: 'ticker',
                symbol: symbol,
                data: {
                    lastPrice: (1000 + Math.random()).toFixed(2),
                    vol: "1000",
                    high: "1100",
                    low: "900",
                    change: "5"
                }
            }, 'public');
        }

        if (i % BATCH_SIZE === 0) {
            await vi.advanceTimersByTimeAsync(250);
        }
    }

    // Final Flush
    await vi.advanceTimersByTimeAsync(1000);

    const duration = performance.now() - startPump;
    console.log(`[Stress] 50 symbols x ${UPDATES_PER_SYMBOL} updates took ${duration.toFixed(2)}ms`);

    // 3. Verification
    let populatedCount = 0;
    for (const symbol of symbols) {
        const data = marketState.data[symbol];
        if (data && (data.lastPrice || data.indexPrice)) {
            populatedCount++;
        }
    }

    expect(populatedCount).toBe(SYMBOL_COUNT);
  });
});
