
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bitunixWs } from './bitunixWs';
import { marketState } from '../stores/market.svelte';

// Mock dependencies
vi.mock('../stores/market.svelte', () => ({
  marketState: {
    updateSymbol: vi.fn(),
    updateDepth: vi.fn(),
    updateSymbolKlines: vi.fn(),
    updateTelemetry: vi.fn(),
    connectionStatus: 'connected',
    data: {}
  }
}));

vi.mock('../stores/settings.svelte', () => ({
  settingsState: {
    enableNetworkLogs: false,
    apiKeys: {},
    capabilities: { marketData: true },
    apiProvider: 'bitunix',
  }
}));

vi.mock('../stores/account.svelte', () => ({
  accountState: {
    updatePositionFromWs: vi.fn(),
    updateOrderFromWs: vi.fn(),
    updateBalanceFromWs: vi.fn(),
  }
}));

vi.mock('./connectionManager', () => ({
  connectionManager: {
    onProviderConnected: vi.fn(),
    onProviderDisconnected: vi.fn(),
  }
}));

describe('Bitunix Realtime Kline Flow', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should process kline message correctly', () => {
        const service = bitunixWs as any;

        // Simulate incoming message with symbol and standard Bitunix kline format
        const msg = {
            ch: "market_kline_60min",
            symbol: "BTCUSDT",
            data: {
                t: 1700000000000,
                o: "50000",
                h: "51000",
                l: "49000",
                c: "50500",
                v: "100"
            }
        };

        service.handleMessage(msg, 'public');

        expect(marketState.updateSymbolKlines).toHaveBeenCalled();

        // Verify arguments
        const calls = (marketState.updateSymbolKlines as any).mock.calls;
        expect(calls.length).toBeGreaterThan(0);
        const args = calls[0];

        // Symbol should be normalized (assuming BTCUSDT stays BTCUSDT or similar)
        expect(args[0]).toBe("BTCUSDT");
        // Timeframe should be mapped back from 60min to 1h
        expect(args[1]).toBe("1h");
        // Data should be array with one element
        expect(args[2]).toHaveLength(1);
        expect(args[2][0].close).toBe("50500");
        expect(args[2][0].time).toBe(1700000000000);
        // Source should be ws
        expect(args[3]).toBe("ws");
    });

    it('should handle alternative channel suffix (1h)', () => {
        const service = bitunixWs as any;

        const msg = {
            ch: "market_kline_1h", // Standard abbreviation instead of 60min
            symbol: "BTCUSDT",
            data: {
                t: 1700000000000,
                o: "50000",
                h: "51000",
                l: "49000",
                c: "50500",
                v: "100"
            }
        };

        service.handleMessage(msg, 'public');

        expect(marketState.updateSymbolKlines).toHaveBeenCalled();

        // Find the call for this message (might be mixed with previous test if not cleared properly, but beforeEach clears mocks)
        const calls = (marketState.updateSymbolKlines as any).mock.calls;
        const lastCall = calls[calls.length - 1];

        // Should be mapped to "1h"
        expect(lastCall[1]).toBe("1h");
    });
});
