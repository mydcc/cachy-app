/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

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
vi.mock('$app/environment', () => ({
  browser: true
}));

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
import { apiService, type Ticker24h } from '../../services/apiService';

describe('App Startup Performance Benchmark', () => {
  let fetchSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    marketState.reset();

    // Default Settings
    settingsState.apiProvider = 'bitunix';
    settingsState.favoriteSymbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'LINKUSDT'];

    // Mock apiService directly to avoid global fetch issues
    vi.spyOn(apiService, 'fetchTicker24h').mockResolvedValue({
      provider: 'bitunix',
      symbol: 'BTCUSDT',
      lastPrice: new Decimal('95000.00'),
      priceChangePercent: new Decimal('1.06'),
      highPrice: new Decimal('96000.00'),
      lowPrice: new Decimal('93000.00'),
      volume: new Decimal('1000.00'),
      quoteVolume: new Decimal('95000000.00')
    });

    vi.spyOn(apiService, 'fetchBitunixKlines').mockResolvedValue(
      Array.from({ length: 15 }, (_, i) => ({
        time: Date.now() - (i * 60000),
        open: new Decimal('95000'),
        high: new Decimal('95100'),
        low: new Decimal('94900'),
        close: new Decimal('95000'),
        volume: new Decimal('10')
      }))
    );
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

    // 4. Assertions for Performance Budget
    // Price should be fast (< 1000ms in this mocked env)
    expect(priceTime - start).toBeLessThan(1000);

    // API calls were mocked on apiService, so we check those instead of fetchSpy
    const tickerReqs = vi.mocked(apiService.fetchTicker24h).mock.calls.length;
    const klineReqs = vi.mocked(apiService.fetchBitunixKlines).mock.calls.length;
    const totalRequests = tickerReqs + klineReqs;
    
    console.log(`[Perf] Total API Calls: ${totalRequests}`);
    console.log(`[Perf] Ticker Calls: ${tickerReqs}`);
    console.log(`[Perf] Kline Calls: ${klineReqs}`);

    expect(totalRequests).toBeLessThan(50);

  }, 10000); // 10s timeout
});
