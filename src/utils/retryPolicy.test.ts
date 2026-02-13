import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RetryPolicy, type RetryConfig } from './retryPolicy';
import { logger } from '../services/logger';

describe('RetryPolicy', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.spyOn(logger, 'warn').mockImplementation(() => {});
        vi.spyOn(logger, 'error').mockImplementation(() => {});
        // Mock Math.random to return a fixed value (0.5) so jitter factor is deterministic
        // 0.8 + 0.5 * 0.4 = 1.0 (no jitter effectively, or strictly controlled)
        vi.spyOn(Math, 'random').mockReturnValue(0.5);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    describe('Basic Functionality', () => {
        it('should execute function successfully on first attempt', async () => {
            const fn = vi.fn().mockResolvedValue('success');
            const config: RetryConfig = {
                maxAttempts: 3,
                initialDelayMs: 100,
                maxDelayMs: 1000,
                jitter: false
            };

            const result = await RetryPolicy.execute(fn, config);

            expect(result).toBe('success');
            expect(fn).toHaveBeenCalledTimes(1);
            expect(logger.warn).not.toHaveBeenCalled();
            expect(logger.error).not.toHaveBeenCalled();
        });

        it('should retry on failure and eventually succeed', async () => {
            const fn = vi.fn()
                .mockRejectedValueOnce(new Error('fail 1'))
                .mockRejectedValueOnce(new Error('fail 2'))
                .mockResolvedValue('success');

            const config: RetryConfig = {
                maxAttempts: 3,
                initialDelayMs: 100,
                maxDelayMs: 1000,
                backoffFactor: 2,
                jitter: false
            };

            const promise = RetryPolicy.execute(fn, config);

            // First failure -> wait 100ms
            await vi.advanceTimersByTimeAsync(100);
            // Second failure -> wait 200ms
            await vi.advanceTimersByTimeAsync(200);

            const result = await promise;

            expect(result).toBe('success');
            expect(fn).toHaveBeenCalledTimes(3);
            expect(logger.warn).toHaveBeenCalledTimes(2);
        });

        it('should fail after max attempts', async () => {
            const error = new Error('persistent failure');
            const fn = vi.fn().mockRejectedValue(error);

            const config: RetryConfig = {
                maxAttempts: 3,
                initialDelayMs: 100,
                maxDelayMs: 1000,
                jitter: false
            };

            const promise = RetryPolicy.execute(fn, config);

            // Setup the expectation BEFORE advancing timers to avoid unhandled rejection warnings
            const expectPromise = expect(promise).rejects.toThrow('persistent failure');

            // Attempt 1 fails -> wait 100
            await vi.advanceTimersByTimeAsync(100);
            // Attempt 2 fails -> wait 200
            await vi.advanceTimersByTimeAsync(200);
            // Attempt 3 fails -> throws

            await expectPromise;
            expect(fn).toHaveBeenCalledTimes(3);

            if (import.meta.env.DEV) {
                expect(logger.error).toHaveBeenCalledWith(
                    "market",
                    expect.stringContaining("failed after 3 attempts"),
                    error
                );
            }
        });
    });

    describe('Backoff Strategy', () => {
        it('should respect custom backoff factor', async () => {
            const fn = vi.fn().mockRejectedValue(new Error('fail'));
            const config: RetryConfig = {
                maxAttempts: 4,
                initialDelayMs: 100,
                maxDelayMs: 10000,
                backoffFactor: 3,
                jitter: false
            };

            const promise = RetryPolicy.execute(fn, config).catch(() => {});

            // Attempt 1 fails. Logs retry in 100ms.
            await vi.advanceTimersByTimeAsync(100);

            // Attempt 2 fails. Logs retry in 300ms.
            await vi.advanceTimersByTimeAsync(300);

            // Attempt 3 fails. Logs retry in 900ms.
            await vi.advanceTimersByTimeAsync(900);

            expect(fn).toHaveBeenCalledTimes(4);

            expect(logger.warn).toHaveBeenNthCalledWith(1, "market", expect.stringContaining("Retrying in 100ms"), expect.any(Error));
            expect(logger.warn).toHaveBeenNthCalledWith(2, "market", expect.stringContaining("Retrying in 300ms"), expect.any(Error));
            expect(logger.warn).toHaveBeenNthCalledWith(3, "market", expect.stringContaining("Retrying in 900ms"), expect.any(Error));
        });

        it('should use default backoff factor of 2 if not provided', async () => {
            const fn = vi.fn().mockRejectedValue(new Error('fail'));
            const config: RetryConfig = {
                maxAttempts: 3,
                initialDelayMs: 100,
                maxDelayMs: 1000,
                jitter: false
                // backoffFactor omitted
            };

            const promise = RetryPolicy.execute(fn, config).catch(() => {});

            // Attempt 1 fails. Logs retry in 100ms.
            await vi.advanceTimersByTimeAsync(100);

            // Attempt 2 fails. Logs retry in 200ms (100 * 2).
            await vi.advanceTimersByTimeAsync(200);

            expect(fn).toHaveBeenCalledTimes(3);
            expect(logger.warn).toHaveBeenNthCalledWith(2, "market", expect.stringContaining("Retrying in 200ms"), expect.any(Error));
        });

        it('should cap delay at maxDelayMs', async () => {
            const fn = vi.fn().mockRejectedValue(new Error('fail'));
            const config: RetryConfig = {
                maxAttempts: 5,
                initialDelayMs: 100,
                maxDelayMs: 250,
                backoffFactor: 2,
                jitter: false
            };

            const promise = RetryPolicy.execute(fn, config).catch(() => {});

            // 1. delay 100 -> wait 100
            await vi.advanceTimersByTimeAsync(100);

            // 2. delay 200 -> wait 200
            await vi.advanceTimersByTimeAsync(200);

            // 3. delay 400 -> capped at 250 -> wait 250
            await vi.advanceTimersByTimeAsync(250);

            // 4. delay 800 -> capped at 250 -> wait 250
            await vi.advanceTimersByTimeAsync(250);

            expect(fn).toHaveBeenCalledTimes(5);
            expect(logger.warn).toHaveBeenLastCalledWith("market", expect.stringContaining("Retrying in 250ms"), expect.any(Error));
        });

        it('should handle initialDelayMs being 0', async () => {
             const fn = vi.fn().mockRejectedValue(new Error('fail'));
             const config: RetryConfig = {
                 maxAttempts: 2,
                 initialDelayMs: 0,
                 maxDelayMs: 1000,
                 jitter: false
             };

             const promise = RetryPolicy.execute(fn, config).catch(() => {});

             // fast-forward 0ms is tricky with fake timers sometimes, but let's try
             await vi.advanceTimersByTimeAsync(0);
             await vi.advanceTimersByTimeAsync(1); // minimal bump just in case

             expect(fn).toHaveBeenCalledTimes(2);
             expect(logger.warn).toHaveBeenCalledWith("market", expect.stringContaining("Retrying in 0ms"), expect.any(Error));
        });
    });

    describe('Jitter', () => {
        it('should apply jitter by default', async () => {
            const fn = vi.fn().mockRejectedValue(new Error('fail'));
            const config: RetryConfig = {
                maxAttempts: 2,
                initialDelayMs: 100,
                maxDelayMs: 1000,
                // jitter omitted, defaults to true
            };

            // Mock random to 0 -> jitter factor = 0.8
            vi.spyOn(Math, 'random').mockReturnValue(0);

            const promise = RetryPolicy.execute(fn, config).catch(() => {});

            // Expected delay: 100 * 0.8 = 80ms
            await vi.advanceTimersByTimeAsync(80);

            expect(fn).toHaveBeenCalledTimes(2);
            expect(logger.warn).toHaveBeenCalledWith("market", expect.stringContaining("Retrying in 80ms"), expect.any(Error));
        });

        it('should apply explicit jitter', async () => {
            const fn = vi.fn().mockRejectedValue(new Error('fail'));
            const config: RetryConfig = {
                maxAttempts: 2,
                initialDelayMs: 100,
                maxDelayMs: 1000,
                jitter: true
            };

            // Mock random to 1 -> jitter factor = 1.2
            vi.spyOn(Math, 'random').mockReturnValue(1);

            const promise = RetryPolicy.execute(fn, config).catch(() => {});

            // Expected delay: 100 * 1.2 = 120ms
            await vi.advanceTimersByTimeAsync(120);

            expect(fn).toHaveBeenCalledTimes(2);
            expect(logger.warn).toHaveBeenCalledWith("market", expect.stringContaining("Retrying in 120ms"), expect.any(Error));
        });
    });

    describe('Logging & Error Handling', () => {
        it('should include custom operation name in logs', async () => {
            const fn = vi.fn().mockRejectedValue(new Error('fail'));
            const config: RetryConfig = {
                maxAttempts: 2,
                initialDelayMs: 100,
                maxDelayMs: 1000,
                jitter: false,
                name: 'CustomOperation'
            };

            const promise = RetryPolicy.execute(fn, config).catch(() => {});

            await vi.advanceTimersByTimeAsync(100);

            expect(logger.warn).toHaveBeenCalledWith(
                "market",
                expect.stringContaining("[RetryPolicy] CustomOperation failed"),
                expect.any(Error)
            );
        });

        it('should handle non-Error objects thrown', async () => {
            const fn = vi.fn().mockRejectedValue('string error');
            const config: RetryConfig = {
                maxAttempts: 2,
                initialDelayMs: 100,
                maxDelayMs: 1000,
                jitter: false
            };

            const promise = RetryPolicy.execute(fn, config).catch(() => {});

            await vi.advanceTimersByTimeAsync(100);

            expect(logger.warn).toHaveBeenCalledWith(
                "market",
                expect.stringContaining("failed"),
                'string error'
            );
        });
    });

    describe('shouldRetry Predicate', () => {
        it('should stop retrying if shouldRetry returns false', async () => {
            const fn = vi.fn().mockRejectedValue(new Error('fatal error'));
            const shouldRetry = vi.fn().mockReturnValue(false);
            const config: RetryConfig = {
                maxAttempts: 5,
                initialDelayMs: 100,
                maxDelayMs: 1000,
                shouldRetry
            };

            await expect(RetryPolicy.execute(fn, config)).rejects.toThrow('fatal error');

            expect(fn).toHaveBeenCalledTimes(1);
            expect(shouldRetry).toHaveBeenCalledWith(expect.any(Error));
            expect(logger.warn).not.toHaveBeenCalled();
        });

        it('should continue retrying if shouldRetry returns true', async () => {
            const fn = vi.fn()
                .mockRejectedValueOnce(new Error('transient error'))
                .mockResolvedValue('success');
            const shouldRetry = vi.fn().mockReturnValue(true);
            const config: RetryConfig = {
                maxAttempts: 2,
                initialDelayMs: 100,
                maxDelayMs: 1000,
                jitter: false,
                shouldRetry
            };

            const promise = RetryPolicy.execute(fn, config);

            await vi.advanceTimersByTimeAsync(100);

            const result = await promise;

            expect(result).toBe('success');
            expect(fn).toHaveBeenCalledTimes(2);
            expect(shouldRetry).toHaveBeenCalledWith(expect.any(Error));
            expect(logger.warn).toHaveBeenCalledTimes(1);
        });
    });
});
