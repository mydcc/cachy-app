
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bitunixWs } from './bitunixWs';

// Mock logger to suppress console noise
vi.mock('./logger', () => ({
    logger: {
        log: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
    }
}));

// Mock settings state
vi.mock('../stores/settings.svelte', () => ({
    settingsState: {
        apiProvider: 'bitunix',
        capabilities: { marketData: true },
        enableNetworkLogs: false
    }
}));

describe('BitunixWS Memory Leak', () => {
    beforeEach(() => {
        // Reset state manually if needed, though bitunixWs is a singleton
        // We can access private members via any cast for testing
        (bitunixWs as any).syntheticSubs = new Map();
        (bitunixWs as any).pendingSubscriptions = new Map();
    });

    it('should accumulate synthetic subscriptions on subscribe', () => {
        // 1. Subscribe to a synthetic timeframe (e.g. 2h is synthetic if not supported natively, checking logic...)
        // Standard timeframes: 1m, 5m, 15m, 30m, 1h, 4h, 1d, 1w, 1M
        // 2h is NOT in native list in resolveTimeframe -> synthetic

        bitunixWs.subscribe('BTCUSDT', 'kline_2h');

        const synthMap = (bitunixWs as any).syntheticSubs;
        expect(synthMap.size).toBe(1);
        expect(synthMap.get('BTCUSDT:2h')).toBe(1);

        bitunixWs.subscribe('BTCUSDT', 'kline_2h');
        expect(synthMap.get('BTCUSDT:2h')).toBe(2);
    });

    it('should cleanup synthetic subscriptions on unsubscribe (LEAK REPRODUCTION)', () => {
        // 1. Subscribe
        bitunixWs.subscribe('BTCUSDT', 'kline_2h');
        const synthMap = (bitunixWs as any).syntheticSubs;
        expect(synthMap.get('BTCUSDT:2h')).toBe(1);

        // 2. Unsubscribe
        bitunixWs.unsubscribe('BTCUSDT', 'kline_2h');

        // 3. Assert (FAILING CASE)
        // Without fix, this will still be 1 because unsubscribe doesn't touch syntheticSubs
        expect(synthMap.has('BTCUSDT:2h')).toBe(false);
    });
});
