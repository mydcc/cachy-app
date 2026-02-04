/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 */

import { logger } from "../services/logger";

export interface RetryConfig {
    maxAttempts: number;
    initialDelayMs: number;
    maxDelayMs: number;
    backoffFactor?: number; // default 2
    jitter?: boolean; // default true
    name?: string; // For logging
    shouldRetry?: (error: unknown) => boolean; // Optional predicate
}

/**
 * Utility for robust exponential backoff retries.
 * Used for critical network operations like Order Sync or Position Closure.
 */
export class RetryPolicy {
    static async execute<T>(
        fn: () => Promise<T>,
        config: RetryConfig
    ): Promise<T> {
        let attempt = 1;
        const factor = config.backoffFactor ?? 2;
        let delay = config.initialDelayMs;
        const name = config.name || "Operation";

        while (true) {
            try {
                return await fn();
            } catch (error) {
                if (attempt >= config.maxAttempts) {
                    if (import.meta.env.DEV) {
                        logger.error("market", `[RetryPolicy] ${name} failed after ${attempt} attempts.`, error);
                    }
                    throw error;
                }

                if (config.shouldRetry && !config.shouldRetry(error)) {
                     throw error;
                }

                // Calculate next delay with optional jitter
                let nextDelay = delay;
                if (config.jitter !== false) {
                    // Jitter between 0.8x and 1.2x of delay
                    const jitterFactor = 0.8 + Math.random() * 0.4;
                    nextDelay = delay * jitterFactor;
                }

                // Cap delay
                nextDelay = Math.min(nextDelay, config.maxDelayMs);

                logger.warn("market", `[RetryPolicy] ${name} failed (Attempt ${attempt}/${config.maxAttempts}). Retrying in ${Math.round(nextDelay)}ms...`, error);

                await new Promise(resolve => setTimeout(resolve, nextDelay));

                attempt++;
                delay *= factor;
            }
        }
    }
}
