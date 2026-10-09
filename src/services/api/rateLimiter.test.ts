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

/**
 * Contract for the token-bucket limiter (FEAT-0342 slice 1).
 *
 * The venue limiters in `requestManager` (`BITUNIX` 5/s no-burst,
 * `BITGET` 20/s) are the only thing standing between the klines
 * prefetch and a venue ban — a limiter that grants unboundedly turns
 * every prefetch into a 500 "frequent request".
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { RateLimiter } from "./rateLimiter";

/**
 * An `async` immediate grant still needs ~3 microtask ticks (promise
 * adoption) before a `.then` callback runs. One `await Promise.resolve()`
 * cannot tell "granted immediately" from "queued behind a timer" — ten
 * ticks can, because the queued path needs a timer that never fires
 * without advancing time.
 */
async function flushMicrotasks(): Promise<void> {
    for (let i = 0; i < 10; i++) await Promise.resolve();
}

describe("RateLimiter", () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it("grants immediately while tokens remain", async () => {
        const limiter = new RateLimiter(10, 2);
        await limiter.waitForToken();
        await limiter.waitForToken();
        // Both resolved without advancing time: no queue involved.
    });

    it("queues the excess and grants it after refill", async () => {
        vi.useFakeTimers();
        // 2 tokens per second: one token every 500 ms.
        const limiter = new RateLimiter(2, 1);
        await limiter.waitForToken();

        let granted = false;
        const pending = limiter.waitForToken().then(() => {
            granted = true;
        });
        // Let the queued microtask settle: still no token without time.
        await flushMicrotasks();
        expect(granted).toBe(false);

        await vi.advanceTimersByTimeAsync(600);
        await pending;
        expect(granted).toBe(true);
    });

    it("drains waiters in FIFO order", async () => {
        vi.useFakeTimers();
        const limiter = new RateLimiter(2, 1);
        await limiter.waitForToken();

        const order: number[] = [];
        const first = limiter.waitForToken().then(() => order.push(1));
        const second = limiter.waitForToken().then(() => order.push(2));

        await vi.advanceTimersByTimeAsync(1200);
        await Promise.all([first, second]);
        expect(order).toEqual([1, 2]);
    });

    it("never exceeds capacity across idle time", async () => {
        vi.useFakeTimers();
        const limiter = new RateLimiter(100, 2);
        // Long idle: the bucket must cap at 2, not accumulate.
        await vi.advanceTimersByTimeAsync(60_000);
        await limiter.waitForToken();
        await limiter.waitForToken();

        let granted = false;
        const pending = limiter.waitForToken().then(() => {
            granted = true;
        });
        await flushMicrotasks();
        expect(granted).toBe(false);

        await vi.advanceTimersByTimeAsync(100);
        await pending;
        expect(granted).toBe(true);
    });
});
