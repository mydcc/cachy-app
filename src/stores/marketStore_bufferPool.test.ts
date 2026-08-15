import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MarketManager } from "./market.svelte";
import { settingsState } from "./settings.svelte";
import { Decimal } from "decimal.js";

vi.mock("$app/environment", () => ({
  browser: true,
  dev: true
}));

describe("marketStore buffer pool characterisation", () => {
    let market: MarketManager;

    beforeEach(() => {
        vi.useFakeTimers();
        market = new MarketManager();
        // Force small cache to easily test eviction
        settingsState.marketCacheSize = 2;
    });

    afterEach(() => {
        market.destroy();
        vi.useRealTimers();
    });

    const createKline = (time: number, close: number) => ({
        time,
        open: new Decimal(100),
        high: new Decimal(110),
        low: new Decimal(90),
        close: new Decimal(close),
        volume: new Decimal(1000)
    });

    it("verifies acquire/release pairing across an update -> evict cycle", async () => {
        const internals = market as unknown as {
            bufferPool: { pool: Map<number, Float64Array[]> };
            backingBuffers: Map<string, unknown>;
        };

        market.updateSymbolKlines('BTCUSDT', '1m', [createKline(1000, 101)]);
        market.updateSymbolKlines('BTCUSDT', '1m', [createKline(2000, 102)]);

        market.updateTicker("ETHUSDT", { lastPrice: "200" });
        await vi.advanceTimersByTimeAsync(300);
        market.updateTicker("SOLUSDT", { lastPrice: "30" });
        await vi.advanceTimersByTimeAsync(300);

        expect(market.data['BTCUSDT']).toBeUndefined();
        expect(internals.backingBuffers.has('BTCUSDT:1m')).toBe(false);

        let totalReleased = 0;
        for (const list of internals.bufferPool.pool.values()) {
            totalReleased += list.length;
        }
        expect(totalReleased).toBe(6);
    });

    it("demonstrates consistency across acquire -> update -> evict -> re-acquire", async () => {
        const internals = market as unknown as {
            bufferPool: { pool: Map<number, Float64Array[]> };
            backingBuffers: Map<string, unknown>;
            pendingKlineUpdates: Map<string, unknown>;
            touchSymbol: (symbol: string) => void;
            enforceCacheLimit: () => void;
            flushUpdates: () => void;
        };

        market.updateSymbolKlines('BTCUSDT', '1m', [createKline(1000, 101)]);

        await vi.advanceTimersByTimeAsync(300);

        market.updateTicker("ETHUSDT", { lastPrice: "200" });
        await vi.advanceTimersByTimeAsync(300);

        market.updateTicker("SOLUSDT", { lastPrice: "30" });
        await vi.advanceTimersByTimeAsync(300);

        expect(market.data['BTCUSDT']).toBeUndefined();
        expect(internals.backingBuffers.has('BTCUSDT:1m')).toBe(false);

        market.updateSymbolKlines('BTCUSDT', '1m', [createKline(2000, 102)]); // use REST to avoid flush pending logic

        const newBacking = internals.backingBuffers.get('BTCUSDT:1m');
        expect(newBacking).toBeDefined();

        const history = market.data['BTCUSDT'].klines['1m'];
        expect(history.length).toBe(1);
        expect(history[0].time).toBe(2000);
        expect(history[0].close.toNumber()).toBe(102);
    });

    it("demonstrates that a buffer released via eviction is not still referenced by in-flight kline updates", async () => {
        const internals = market as unknown as {
            bufferPool: { pool: Map<number, Float64Array[]> };
            backingBuffers: Map<string, unknown>;
            pendingKlineUpdates: Map<string, unknown>;
            enforceCacheLimit: () => void;
            flushUpdates: () => void;
            flushIntervalId: ReturnType<typeof setInterval> | null;
            touchSymbol: (s: string) => void;
            cacheMetadata: Map<string, unknown>;
            evictLRU: () => string | null;
        };

        // Add first symbol
        market.updateSymbolKlines('BTCUSDT', '1m', [createKline(1000, 101)]);
        await vi.advanceTimersByTimeAsync(300);

        // Add a pending kline update
        market.updateSymbolKlines('BTCUSDT', '1m', [createKline(2000, 102)], 'ws');
        expect(internals.pendingKlineUpdates.has('BTCUSDT:1m')).toBe(true);

        // Instead of messing with timers to trigger LRU, we can just delete it via arbitrary eviction code path,
        // or just forcefully trigger eviction on BTCUSDT.
        internals.cacheMetadata.delete('BTCUSDT');
        // Then we call the internal release function
        (market as unknown as { releaseSymbolBackingBuffers: (symbol: string) => void }).releaseSymbolBackingBuffers('BTCUSDT');
        delete market.data['BTCUSDT'];

        expect(market.data['BTCUSDT']).toBeUndefined();
        expect(internals.backingBuffers.has('BTCUSDT:1m')).toBe(false);

        // But importantly, the pending update is still queued!
        expect(internals.pendingKlineUpdates.has('BTCUSDT:1m')).toBe(true);

        // If we flush, it will process the pending update cleanly
        internals.flushUpdates();

        // Ensure BTCUSDT was re-created correctly
        expect(market.data['BTCUSDT']).toBeDefined();
        expect(internals.backingBuffers.has('BTCUSDT:1m')).toBe(true);

        const history = market.data['BTCUSDT'].klines['1m'];
        expect(history.length).toBe(1);
        expect(history[0].time).toBe(2000);
    });
});
