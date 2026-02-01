
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { bitunixWs } from './bitunixWs';
import { marketState } from '../stores/market.svelte';
import { settingsState } from '../stores/settings.svelte';

// Mock dependencies
vi.mock('../stores/market.svelte', () => ({
  marketState: {
    updateSymbol: vi.fn(),
    updateDepth: vi.fn(),
    updateSymbolKlines: vi.fn(),
    connectionStatus: 'disconnected',
    updateTelemetry: vi.fn(),
    data: {}
  }
}));

vi.mock('../stores/account.svelte', () => ({
  accountState: {
    updatePositionFromWs: vi.fn(),
    updateOrderFromWs: vi.fn(),
    updateBalanceFromWs: vi.fn()
  }
}));

vi.mock('../stores/settings.svelte', () => ({
  settingsState: {
    apiProvider: 'bitunix',
    capabilities: { marketData: true },
    apiKeys: { bitunix: { key: 'test', secret: 'test' } },
    enableNetworkLogs: false // Reduce noise
  }
}));

vi.mock('./logger', () => ({
  logger: {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

vi.mock('./connectionManager', () => ({
  connectionManager: {
    onProviderConnected: vi.fn(),
    onProviderDisconnected: vi.fn()
  }
}));

describe('BitunixWs Fast Path Hardening', () => {
  let mockWs: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockWs = {
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      readyState: 1,
      onopen: null,
      onmessage: null,
      onclose: null,
      onerror: null
    };

    class MockWebSocket {
        constructor() {
            return mockWs;
        }
        static OPEN = 1;
    }

    global.WebSocket = MockWebSocket as any;
    if (typeof window !== 'undefined') {
        (window as any).WebSocket = MockWebSocket;
    }

    bitunixWs.connect(true);
  });

  afterEach(() => {
    bitunixWs.destroy();
  });

  it('should robustly handle numeric values in TICKER channel (Fast Path)', () => {
    if (typeof mockWs.onmessage !== 'function') throw new Error('Init fail');
    mockWs.onopen();

    const payload = {
      event: 'channel',
      ch: 'ticker',
      symbol: 'BTCUSDT',
      data: {
        lastPrice: 98000.50, // Numeric
        vol: 500,
        high: 99000,
        low: 97000
      }
    };

    mockWs.onmessage({ data: JSON.stringify(payload) });

    expect(marketState.updateSymbol).toHaveBeenCalledWith('BTCUSDT', expect.objectContaining({
       lastPrice: expect.any(String)
    }));
  });

  it('should robustly handle numeric values in DEPTH channel (Fast Path)', () => {
    if (typeof mockWs.onmessage !== 'function') throw new Error('Init fail');
    mockWs.onopen();

    const payload = {
      event: 'channel',
      ch: 'depth_book5',
      symbol: 'ETHUSDT',
      data: {
        b: [[3000.50, 1.2]],
        a: [[3001.00, 0.5]]
      }
    };

    mockWs.onmessage({ data: JSON.stringify(payload) });

    // Verify that updateDepth was called with STRING values in the arrays
    expect(marketState.updateDepth).toHaveBeenCalledWith('ETHUSDT', {
        bids: expect.arrayContaining([
            expect.arrayContaining(["3000.5", "1.2"]) // Strings!
        ]),
        asks: expect.any(Array)
    });
  });

  it('should degrade gracefully if data shape is completely wrong', () => {
    if (typeof mockWs.onmessage !== 'function') throw new Error('Init fail');
    mockWs.onopen();

    const payload = {
      event: 'channel',
      ch: 'ticker',
      symbol: 'XRPUSDT',
      data: "This is not an object"
    };

    expect(() => {
        mockWs.onmessage({ data: JSON.stringify(payload) });
    }).not.toThrow();

    // The fast path should skip this.
    // The fallback path might pick it up, but we just want to ensure NO CRASH.
    // If updateSymbol IS called (via fallback), that is acceptable for this "Hardening" test,
    // as long as it didn't throw an exception during parsing.
  });
});
