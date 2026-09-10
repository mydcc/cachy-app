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
 * Retry wrapper for GitHub API writes.
 *
 * During API degradation the sync met 403 secondary-rate-limit and 504
 * responses mid-run: creates failed one by one while earlier ones had
 * already landed, leaving half-converged state behind. Retrying a write a
 * few times with backoff rides out exactly that window; anything still
 * failing afterwards comes back as a normal failure response, so the
 * existing `res.ok` handling records it and the run still fails loud.
 * Fetch and sleep are injected so unit tests run without timers
 * or network.
 */

export interface RetryResponse {
    ok: boolean;
    status: number;
    text(): Promise<string>;
}

export type FetchLike = (
    url: string,
    init?: RequestInit,
) => Promise<RetryResponse>;

export interface RetryOptions {
    maxAttempts?: number;
    baseDelayMs?: number;
    sleepFn?: (ms: number) => Promise<void>;
}

const RETRYABLE_STATUS = new Set([403, 409, 429, 500, 502, 503, 504]);

export function isRetryable(status: number): boolean {
    return RETRYABLE_STATUS.has(status);
}

const defaultSleep = (ms: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Call `fetchFn` until it answers non-retryably or the attempts run out.
 * Network throws count as retryable. Never throws itself: when the attempts
 * are exhausted it returns the last response (callers keep their existing
 * `res.ok` handling, so one bad item still cannot starve the rest), or a
 * synthetic `{ ok: false, status: 0 }` response carrying the network error
 * text when no HTTP answer ever arrived.
 */
export async function fetchWithRetry(
    fetchFn: FetchLike,
    url: string,
    init: RequestInit = {},
    options: RetryOptions = {},
): Promise<RetryResponse> {
    const maxAttempts = options.maxAttempts ?? 4;
    const baseDelayMs = options.baseDelayMs ?? 2000;
    const sleepFn = options.sleepFn ?? defaultSleep;

    let lastRes: RetryResponse | null = null;
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            lastRes = await fetchFn(url, init);
            lastError = null;
        } catch (e) {
            lastError = e;
            lastRes = null;
        }
        if (lastRes !== null && !isRetryable(lastRes.status)) return lastRes;
        if (attempt < maxAttempts) {
            await sleepFn(baseDelayMs * 2 ** (attempt - 1));
        }
    }
    if (lastRes !== null) return lastRes;
    const message = lastError instanceof Error ? lastError.message : String(lastError);
    return {
        ok: false,
        status: 0,
        text: async () => `network failure after ${maxAttempts} attempts: ${message}`,
    };
}
