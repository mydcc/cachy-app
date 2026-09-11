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
 * Bounded synchronous retry with linear backoff and jitter, for the CI lookup
 * helpers (`gh`, `git`).
 *
 * A required gate must not green-light unknown state, but a single transient
 * network/git failure should not turn it red either. Retry a few times; if the
 * lookup still fails, the caller fails closed with an infrastructure message —
 * a red, retryable check, never a silent pass.
 */

/** Number of attempts (first try plus retries) before a lookup is abandoned. */
export const LOOKUP_ATTEMPTS = 3;

/** Base backoff; attempt `i` waits `BASE_MS * (i + 1)` plus jitter. */
export const RETRY_BASE_MS = 500;

function sleepSync(ms: number): void {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Call `fn` until it returns a non-null value or the attempts run out.
 *
 * `null` is the failure sentinel, so `fn` may legitimately return `""` or an
 * empty array. Returns `null` when every attempt failed.
 */
export function withRetry<T>(fn: () => T | null, attempts: number = LOOKUP_ATTEMPTS): T | null {
    for (let i = 0; i < attempts; i++) {
        const result = fn();
        if (result !== null) return result;
        if (i < attempts - 1) {
            sleepSync(RETRY_BASE_MS * (i + 1) + Math.floor(Math.random() * 250));
        }
    }
    return null;
}
