import { describe, it, expect, vi } from 'vitest';
import { RateLimiter } from './apiService';

describe('RateLimiter Hardening', () => {
    it('should handle high concurrency safely (Recursion vs Iteration Check)', async () => {
        // High capacity to process quickly in test, but we will flood it
        const ratePerSecond = 100;
        const limiter = new RateLimiter(ratePerSecond);

        vi.useFakeTimers();

        const totalRequests = 200;
        const promises: Promise<void>[] = [];
        let resolvedCount = 0;

        // Queue requests
        for (let i = 0; i < totalRequests; i++) {
            promises.push(limiter.waitForToken().then(() => {
                resolvedCount++;
            }));
        }

        // Initially, we have 'ratePerSecond' tokens (capacity defaults to rate).
        // So first 100 should resolve immediately.
        // The rest wait.

        // We simulate time passing.
        // We need (200 - 100) / 100 = 1 seconds approx.

        // Advance time in steps
        for(let i=0; i<5; i++) {
            await vi.advanceTimersByTimeAsync(1000);
        }

        await Promise.all(promises);

        expect(resolvedCount).toBe(totalRequests);
        vi.useRealTimers();
    });
});
