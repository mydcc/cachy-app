/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { requestManager } from "./apiService";

describe("apiService RateLimiter", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        requestManager.clearCache();
        global.fetch = vi.fn();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it("should throttle Bitunix requests to ~10 req/s", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            headers: new Headers({ "content-type": "application/json" }),
            text: () => Promise.resolve(JSON.stringify({ code: 0, data: [] })),
            json: () => Promise.resolve({ code: 0, data: [] })
        });
        global.fetch = fetchMock;

        // Start 20 requests
        // Note: RequestManager MAX_CONCURRENCY is 8.
        // Rate Limit is 10 tokens initially.
        // 1. First 8 start immediately, consume 8 tokens. 2 tokens left.
        // 2. First 8 finish (instant mock).
        // 3. Next 8 dequeued.
        // 4. First 2 of this batch consume 2 tokens. 0 tokens left.
        // 5. Remaining 6 of this batch wait for tokens.
        // 6. Last 4 are still in queue.

        // So we expect 8 + 2 = 10 requests to fire immediately.

        const promises = [];
        for (let i = 0; i < 20; i++) {
            promises.push(requestManager.schedule(`BITUNIX:TEST:${i}`, async () => {
                await fetchMock();
            }));
        }

        // Advance time slightly to allow microtasks and immediate executions
        await vi.advanceTimersByTimeAsync(10);

        expect(fetchMock).toHaveBeenCalledTimes(10);

        // Advance time by 500ms -> 5 more tokens (10 req/s = 1 per 100ms)
        // This should allow 5 more requests to proceed.
        await vi.advanceTimersByTimeAsync(500);

        // Total should be 15
        expect(fetchMock).toHaveBeenCalledTimes(15);

        // Advance time by another 500ms -> 5 more tokens
        // Remaining 5 requests should proceed.
        await vi.advanceTimersByTimeAsync(500);

        expect(fetchMock).toHaveBeenCalledTimes(20);
    });

    it("should not throttle non-limited providers significantly", async () => {
         const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            headers: new Headers({ "content-type": "application/json" }),
            text: () => Promise.resolve(JSON.stringify({ code: 0, data: [] })),
            json: () => Promise.resolve({ code: 0, data: [] })
        });
        global.fetch = fetchMock;

        // Unknown provider
        const promises = [];
        for (let i = 0; i < 20; i++) {
            promises.push(requestManager.schedule(`OTHER:TEST:${i}`, async () => {
                await fetchMock();
            }));
        }

        // Should be limited only by MAX_CONCURRENCY (8)
        // But since fetch is instantaneous in mock, the queue drains immediately in microtasks loop?
        // Wait, executeWithRetry uses setTimeout? No, only for timeout cancellation.
        // But the "wait a bit before retry" is only on error.

        await vi.advanceTimersByTimeAsync(50);

        // All 20 should have executed because there is no rate limiter delay,
        // and concurrency queue processes them as fast as the event loop allows.

        expect(fetchMock).toHaveBeenCalledTimes(20);
    });
});
