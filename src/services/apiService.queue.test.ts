
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requestManager } from './apiService';

describe('RequestManager Queue Limit', () => {
    beforeEach(() => {
        // Reset the singleton state if possible, or just clear queues manually
        // Since requestManager is a singleton, we might need a way to reset it or access its internals.
        // For this test, we assume we can access the queues via 'any' casting or public methods if available.
        // The cleanup logic in apiService destroys it, let's use that if exposed.
        requestManager.clearCache();
        // Manually clear queues and active count for test isolation
        (requestManager as any).highPriorityQueue = [];
        (requestManager as any).normalQueue = [];
        (requestManager as any).activeCount = 0;
        (requestManager as any).pending.clear();
    });

    it('should limit queue size and drop oldest requests when full', async () => {
        const MAX_QUEUE_SIZE = 100;
        const MAX_CONCURRENCY = 8;

        // 1. Fill up Active Slots
        // Create a task that hangs indefinitely (until we tell it to stop, or just long enough)
        let resolveHang: (val?: any) => void;
        const hangingTask = () => new Promise(resolve => { resolveHang = resolve; });

        // Fill concurrency slots
        for (let i = 0; i < MAX_CONCURRENCY; i++) {
            requestManager.schedule(`hang-${i}`, async () => {
                await hangingTask();
            }, 'normal');
        }

        expect((requestManager as any).activeCount).toBe(MAX_CONCURRENCY);

        // 2. Flood the Queue
        const overflowCount = 10;
        const totalRequests = MAX_QUEUE_SIZE + overflowCount;
        const promises: Promise<any>[] = [];
        const errors: any[] = [];

        for (let i = 0; i < totalRequests; i++) {
            const p = requestManager.schedule(`queue-${i}`, async () => {
                return `result-${i}`;
            }, 'normal')
            .catch(e => {
                errors.push({ i, error: e });
            });
            promises.push(p);
        }

        // 3. Check Queue Size (Accessing private property for verification)
        const queueLength = (requestManager as any).normalQueue.length;

        // CURRENT BEHAVIOR (Before Fix): Queue grows infinitely
        // We expect this test to FAIL initially if we assert strictly,
        // or we use it to prove the fix works later.
        // For TDD, let's assert the DESIRED behavior.

        // Assert: Queue should be capped at MAX_QUEUE_SIZE
        // NOTE: This will fail until implementation is done.
        // To make the test run "red" meaningfully, we check if it overflowed.

        // With current code, queueLength would be 110.
        // We want it to be 100.
        expect(queueLength).toBeLessThanOrEqual(MAX_QUEUE_SIZE);

        // 4. Assert that oldest items were dropped (rejected)
        // We expect the first 10 items (queue-0 to queue-9) to be rejected immediately
        // because we added 110 items to a 100-slot queue.

        // Wait a microtask tick for synchronous rejections
        await new Promise(r => setTimeout(r, 0));

        expect(errors.length).toBeGreaterThanOrEqual(overflowCount);
        expect(errors[0].error.message).toContain('QueueOverflow');

        // Cleanup
        if (resolveHang!) resolveHang();
    });
});
