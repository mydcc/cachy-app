import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';
import { tick } from 'svelte';
import { Decimal } from 'decimal.js';

// Mock Browser Environment
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value.toString(); }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    length: 0,
    key: vi.fn(),
  };
})();
Object.defineProperty(global, 'localStorage', { value: localStorageMock });

// Mock WebSocket
class MockWebSocket {
  onopen: any;
  onmessage: any;
  onclose: any;
  onerror: any;
  send = vi.fn();
  close = vi.fn();
  constructor(public url: string) {}
}
Object.defineProperty(global, 'WebSocket', { value: MockWebSocket });

// Mock requestAnimationFrame for Svelte
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);

// Mock Modules BEFORE imports
vi.mock('../../services/bitunixWs', () => ({
  bitunixWs: {
    connect: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    destroy: vi.fn(),
    pendingSubscriptions: new Set(),
  }
}));

vi.mock('../../services/bitgetWs', () => ({
  bitgetWs: {
    connect: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    destroy: vi.fn(),
  }
}));

// Mock Logger to reduce noise
vi.mock('../../services/logger', () => ({
  logger: {
    log: vi.fn(),
    error: (scope: string, msg: string, ...args: any[]) => console.error(`[MockLog:Error] ${scope}: ${msg}`, ...args),
    warn: (scope: string, msg: string, ...args: any[]) => console.warn(`[MockLog:Warn] ${scope}: ${msg}`, ...args),
    debug: vi.fn(),
  }
}));

// Mock TechnicalsService to avoid WASM dependency in benchmark
vi.mock('../../services/technicalsService', () => ({
  technicalsService: {
    calculateTechnicals: vi.fn().mockResolvedValue({
      confluence: { score: 10, summary: 'Buy' },
      movingAverages: [
          { name: 'EMA 200', value: 94000 }
      ],
      oscillators: [
          { name: 'RSI', value: 55 }
      ]
    }),
    updateCacheSettings: vi.fn()
  }
}));

// Import App and Stores (dynamic imports to ensure mocks are applied)
import { app } from '../../services/app';
import { tradeState } from '../../stores/trade.svelte';
import { marketState } from '../../stores/market.svelte';
import { analysisState } from '../../stores/analysis.svelte';
import { settingsState } from '../../stores/settings.svelte';

describe('App Startup Performance Benchmark', () => {
  let fetchSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    marketState.reset();

    // Default Settings
    settingsState.apiProvider = 'bitunix';
    settingsState.favoriteSymbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'LINKUSDT'];

    // Mock Fetch
    fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
      const urlStr = url.toString();

      // 1. Ticker Response (Price)
      if (urlStr.includes('/api/tickers')) {
        return new Response(JSON.stringify({
          code: 0,
          data: [{
            symbol: 'BTCUSDT',
            lastPrice: '95000.00',
            open: '94000.00',
            high: '96000.00',
            low: '93000.00',
            baseVol: '1000.00',
            quoteVol: '95000000.00'
          }]
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }

      // 2. Klines Response (History)
      if (urlStr.includes('/api/klines')) {
        // Generate dummy klines
        const limit = parseInt(new URL(urlStr, 'http://localhost').searchParams.get('limit') || '15');
        const klines = [];
        const now = Date.now();
        for(let i=0; i<limit; i++) {
            klines.push({
                time: now - (i * 60000),
                open: '95000',
                high: '95100',
                low: '94900',
                close: '95000',
                volume: '10'
            });
        }
        return new Response(JSON.stringify(klines), {
            status: 200,
            headers: { 'content-type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({}), { status: 404 });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('measures startup time and request count', async () => {
    console.log('--- STARTUP BENCHMARK ---');
    const start = performance.now();

    // 1. Trigger App Init
    app.init();

    // 2. Wait for Initial Price Fetch
    // We poll until tradeState.entryPrice is set
    const waitForPrice = async () => {
        let attempts = 0;
        while(attempts < 50) {
            if (tradeState.entryPrice && tradeState.entryPrice !== '0') return true;
            await new Promise(r => setTimeout(r, 50));
            attempts++;
        }
        return false;
    };

    const priceLoaded = await waitForPrice();
    const priceTime = performance.now();
    expect(priceLoaded).toBe(true);
    console.log(`[Perf] Time to First Price: ${(priceTime - start).toFixed(2)}ms`);

    // 3. Wait for Market Analyst to start processing (Simulated)
    // The analyst runs in a loop. We check if analysisState has results.
    // Note: The mock fetches are fast, so this should happen quickly.
    const waitForAnalysis = async () => {
        let attempts = 0;
        while(attempts < 100) { // Wait up to 5s
            if (Object.keys(analysisState.results).length > 0) return true;
            await new Promise(r => setTimeout(r, 50));
            attempts++;
        }
        return false;
    };

    const analysisLoaded = await waitForAnalysis();
    const analysisTime = performance.now();

    if (analysisLoaded) {
        console.log(`[Perf] Time to First Analysis: ${(analysisTime - start).toFixed(2)}ms`);
    } else {
        console.warn('[Perf] Analysis timed out (Check mocked klines or settings)');
    }

    // 4. Analyze Request Count
    const totalRequests = fetchSpy.mock.calls.length;
    console.log(`[Perf] Total HTTP Requests: ${totalRequests}`);

    // Breakdown
    const tickerReqs = fetchSpy.mock.calls.filter((c: any) => c[0].toString().includes('tickers')).length;
    const klineReqs = fetchSpy.mock.calls.filter((c: any) => c[0].toString().includes('klines')).length;

    console.log(`[Perf] Ticker Requests: ${tickerReqs}`);
    console.log(`[Perf] Kline Requests: ${klineReqs}`);

    // Assertions for Performance Budget
    // Price should be fast (< 1000ms in this mocked env)
    expect(priceTime - start).toBeLessThan(1000);

    // Requests shouldn't explode.
    // Expect:
    // 1 ticker fetch for main symbol
    // 1 kline fetch for ATR
    // MarketAnalyst: might fetch klines for favorites (4 favorites * 4 timeframes = 16 requests if parallelized)
    // Total should be around 20-30 max.
    expect(totalRequests).toBeLessThan(50);

  }, 10000); // 10s timeout
});
