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
