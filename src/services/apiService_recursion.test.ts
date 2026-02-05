
import { describe, it, expect } from 'vitest';
import { RateLimiter } from './apiService';

describe('RateLimiter Hardening', () => {
    it('should handle high concurrency without stack overflow or hanging', async () => {
        // 100 tokens per second, capacity 1
        // We request 1 token. It consumes 1.
        // We request 1000 tokens concurrently.
        // Refill rate is 0.1 tokens per ms.
        const limiter = new RateLimiter(100, 1);

        const start = Date.now();
        const requestCount = 200; // Enough to trigger queueing but fast enough for test

        const promises = [];
        for (let i = 0; i < requestCount; i++) {
            promises.push(limiter.waitForToken());
        }

        await Promise.all(promises);
        const end = Date.now();
        const duration = end - start;

        // 200 requests at 100/sec should take approx 2000ms (minus initial capacity)
        // Initial capacity is 1. So 199 requests. 199 * 10ms = 1990ms.
        console.log(`Duration: ${duration}ms`);

        // Allow some buffer for execution overhead
        expect(duration).toBeGreaterThan(1800);
        expect(duration).toBeLessThan(3000); // Should not hang
    });
});
