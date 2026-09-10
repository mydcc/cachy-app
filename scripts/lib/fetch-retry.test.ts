// @vitest-environment node
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

import { describe, it, expect } from "vitest";
import { fetchWithRetry, isRetryable, type FetchLike } from "./fetch-retry";

const ok = { ok: true, status: 200, text: async () => "ok" };
const rateLimited = { ok: false, status: 403, text: async () => "rate limited" };
const validation = { ok: false, status: 422, text: async () => "invalid" };
const noSleep = async () => {};

describe("isRetryable", () => {
    it("retries rate limits and server errors, not client errors", () => {
        expect(isRetryable(403)).toBe(true);
        expect(isRetryable(429)).toBe(true);
        expect(isRetryable(504)).toBe(true);
        expect(isRetryable(200)).toBe(false);
        expect(isRetryable(422)).toBe(false);
    });
});

describe("fetchWithRetry", () => {
    it("returns the first non-retryable answer untouched", async () => {
        let calls = 0;
        const fetchFn: FetchLike = async () => {
            calls += 1;
            return validation;
        };
        const res = await fetchWithRetry(fetchFn, "https://x", {}, { sleepFn: noSleep });
        expect(res.status).toBe(422);
        expect(calls).toBe(1);
    });

    it("rides out a 403 wave and returns the recovered answer", async () => {
        const delays: number[] = [];
        let calls = 0;
        const fetchFn: FetchLike = async () => {
            calls += 1;
            return calls < 3 ? rateLimited : ok;
        };
        const res = await fetchWithRetry(fetchFn, "https://x", {}, {
            sleepFn: async (ms) => {
                delays.push(ms);
            },
        });
        expect(res.ok).toBe(true);
        expect(calls).toBe(3);
        expect(delays).toEqual([2000, 4000]);
    });

    it("returns the last failure instead of throwing when attempts run out", async () => {
        const fetchFn: FetchLike = async () => rateLimited;
        const res = await fetchWithRetry(fetchFn, "https://x", {}, {
            maxAttempts: 2,
            sleepFn: noSleep,
        });
        expect(res.ok).toBe(false);
        expect(res.status).toBe(403);
    });

    it("turns a persistent network throw into a synthetic failure", async () => {
        const fetchFn: FetchLike = async () => {
            throw new Error("socket hang up");
        };
        const res = await fetchWithRetry(fetchFn, "https://x", {}, {
            maxAttempts: 2,
            sleepFn: noSleep,
        });
        expect(res.ok).toBe(false);
        expect(res.status).toBe(0);
        expect(await res.text()).toContain("socket hang up");
    });
});
