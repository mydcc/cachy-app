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

    it("should throttle Bitunix requests to 5 req/s with no burst", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            headers: new Headers({ "content-type": "application/json" }),
            text: () => Promise.resolve(JSON.stringify({ code: 0, data: [] })),
            json: () => Promise.resolve({ code: 0, data: [] })
        });
        global.fetch = fetchMock;

        // Rate Limit: 5 req/s (200ms interval), Capacity: 1
        // RequestManager Concurrency: 8

        const promises = [];
        // Schedule 10 requests
        for (let i = 0; i < 10; i++) {
            promises.push(requestManager.schedule(`BITUNIX:TEST:${i}`, async () => {
                await fetchMock();
            }));
        }

        // T=0: Only 1 token available (Capacity=1). So only 1 request should fire immediately.
        await vi.advanceTimersByTimeAsync(10);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        // T=200ms: 1 more token generated (5 req/s = 1 per 200ms).
        await vi.advanceTimersByTimeAsync(200);
        expect(fetchMock).toHaveBeenCalledTimes(2);

        // T=400ms: 3rd request fires.
        await vi.advanceTimersByTimeAsync(200);
        expect(fetchMock).toHaveBeenCalledTimes(3);

        // T=1000ms: Should have fired roughly 1 initial + 5 more = 6 requests total (at T=0, 200, 400, 600, 800, 1000)
        // Let's advance to T=1000 total (already advanced 10+200+200 = 410)
        await vi.advanceTimersByTimeAsync(600);
        // Total time ~1010ms.
        // Expected: 1 (0ms) + 1 (200ms) + 1 (400ms) + 1 (600ms) + 1 (800ms) + 1 (1000ms) = 6
        expect(fetchMock).toHaveBeenCalledTimes(6);
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
