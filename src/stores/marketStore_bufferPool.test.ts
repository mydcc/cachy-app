// @vitest-environment happy-dom
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

    let originalCacheSize: number | undefined;

    beforeEach(() => {
        vi.useFakeTimers();
        market = new MarketManager();
        originalCacheSize = settingsState.marketCacheSize;
        settingsState.marketCacheSize = 2;
    });

    afterEach(() => {
        if (originalCacheSize !== undefined) settingsState.marketCacheSize = originalCacheSize;
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

    it("demonstrates that a buffer released via TTL cleanup is not still referenced by an in-flight kline update", () => {
        // enforceCacheLimit() only ever runs inside flushUpdates(), which
        // drains pendingKlineUpdates in the same pass before enforcing the
        // limit -- so a symbol can never be LRU-evicted while it still has
        // an unflushed kline sitting in pendingKlineUpdates. cleanup()'s
        // TTL-based staleness sweep is the one real path that releases a
        // symbol's buffers independently of, and without draining,
        // pendingKlineUpdates -- that's the actual race this test pins.
        const internals = market as unknown as {
            backingBuffers: Map<string, unknown>;
            pendingKlineUpdates: Map<string, unknown>;
            flushUpdates: () => void;
            flushIntervalId: ReturnType<typeof setInterval> | null;
            cleanupIntervalId: ReturnType<typeof setInterval> | null;
        };

        // Take manual control of timing: the same two intervals drive this
        // in production, but leaving them armed while advancing 5+ minutes
        // of fake time would fire flushUpdates/cleanup on their own
        // schedule and hide the exact sequencing this test exists to pin.
        if (internals.flushIntervalId) clearInterval(internals.flushIntervalId);
        if (internals.cleanupIntervalId) clearInterval(internals.cleanupIntervalId);

        // BTCUSDT materializes immediately via REST and is touched.
        market.updateSymbolKlines('BTCUSDT', '1m', [createKline(1000, 101)]);

        // Let BTCUSDT go stale past the 5-minute TTL (market.svelte.ts's TTL_MS).
        vi.advanceTimersByTime(5 * 60 * 1000 + 1000);

        // A late WS kline for BTCUSDT arrives and is buffered, not applied.
        market.updateSymbolKlines('BTCUSDT', '1m', [createKline(2000, 102)], 'ws');
        expect(internals.pendingKlineUpdates.has('BTCUSDT:1m')).toBe(true);

        // Real TTL cleanup releases BTCUSDT's buffers -- independent of,
        // and without draining, the pending WS update.
        market.cleanup();

        expect(market.data['BTCUSDT']).toBeUndefined();
        expect(internals.backingBuffers.has('BTCUSDT:1m')).toBe(false);
        expect(internals.pendingKlineUpdates.has('BTCUSDT:1m')).toBe(true);

        // Flushing the still-pending update must resurrect BTCUSDT cleanly
        // -- not reference the buffer that was already released to the pool.
        internals.flushUpdates();

        expect(market.data['BTCUSDT']).toBeDefined();
        expect(internals.backingBuffers.has('BTCUSDT:1m')).toBe(true);

        const history = market.data['BTCUSDT'].klines['1m'];
        expect(history.length).toBe(1);
        expect(history[0].time).toBe(2000);
        expect(history[0].close.toNumber()).toBe(102);
    });
});
