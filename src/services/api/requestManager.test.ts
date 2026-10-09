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
 * Contract for the global request orchestration (FEAT-0342 slice 1).
 *
 * The manager is a singleton, so every key is namespaced per test and the
 * cache is cleared between tests — a shared key would turn a cache hit
 * from another test into a false pass. Keys deliberately carry no
 * venue prefix, keeping the per-venue rate limiters out of these tests
 * (they have their own suite in `rateLimiter.test.ts`).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiStatusError } from "./apiErrors";
import { clearApiCache, requestManager } from "./requestManager";
import { setNetworkLogProvider } from "./telemetry";

beforeEach(() => {
    setNetworkLogProvider(() => false);
});

afterEach(() => {
    clearApiCache();
    vi.useRealTimers();
});

describe("requestManager", () => {
    it("serves a fresh cache hit without running the task again", async () => {
        let calls = 0;
        const task = async () => {
            calls++;
            return "klines";
        };
        const first = await requestManager.schedule("CACHE-1", task, "normal", 0);
        const second = await requestManager.schedule("CACHE-1", task, "normal", 0);
        expect(first).toBe("klines");
        expect(second).toBe("klines");
        expect(calls).toBe(1);
    });

    it("dedupes concurrent identical requests into one task", async () => {
        let calls = 0;
        let release!: (value: string) => void;
        const gate = new Promise<string>((resolve) => {
            release = resolve;
        });
        const task = async () => {
            calls++;
            return gate;
        };
        const first = requestManager.schedule("DEDUP-1", task, "normal", 0);
        const second = requestManager.schedule("DEDUP-1", task, "normal", 0);
        release("shared");
        await expect(first).resolves.toBe("shared");
        await expect(second).resolves.toBe("shared");
        expect(calls).toBe(1);
    });

    it("does not retry a 404 and surfaces the status error", async () => {
        let calls = 0;
        const task = async (): Promise<string> => {
            calls++;
            throw new ApiStatusError("Not Found", 404);
        };
        await expect(
            requestManager.schedule("NORETRY-404", task, "normal", 1),
        ).rejects.toBeInstanceOf(ApiStatusError);
        expect(calls).toBe(1);
    });

    it("does not retry a venue system error (invalid symbol)", async () => {
        let calls = 0;
        const task = async (): Promise<string> => {
            calls++;
            throw new Error("System error, invalid symbol");
        };
        await expect(
            requestManager.schedule("NORETRY-SYS", task, "normal", 1),
        ).rejects.toThrow("System error");
        expect(calls).toBe(1);
    });

    it("retries a transient failure once and returns the recovery", async () => {
        vi.useFakeTimers();
        let calls = 0;
        const task = async () => {
            calls++;
            if (calls === 1) throw new Error("ECONNRESET");
            return "recovered";
        };
        const pending = requestManager.schedule("RETRY-1", task, "normal", 1);
        // The retry waits 1500 ms before the second attempt.
        await vi.advanceTimersByTimeAsync(1600);
        await expect(pending).resolves.toBe("recovered");
        expect(calls).toBe(2);
    });

    it("drains high priority before normal when saturated", async () => {
        const gates: Array<(value: string) => void> = [];
        const gated = () =>
            new Promise<string>((resolve) => {
                gates.push(resolve);
            });
        // Saturate all 8 concurrency slots with gated tasks.
        const blockers = Array.from({ length: 8 }, (_, i) =>
            requestManager.schedule(`SAT-${i}`, gated, "normal", 0),
        );
        // Let all eight runs start and park on their gates.
        await Promise.resolve();
        await new Promise((r) => setTimeout(r, 0));
        expect(gates.length).toBe(8);

        const order: string[] = [];
        const high = requestManager.schedule(
            "PRIO-H",
            async () => {
                order.push("high");
                return "high";
            },
            "high",
            0,
        );
        const normal = requestManager.schedule(
            "PRIO-N",
            async () => {
                order.push("normal");
                return "normal";
            },
            "normal",
            0,
        );
        await Promise.resolve();

        // Free one slot: the high-priority task must drain first. No
        // intermediate assertion here — once high completes, `next()`
        // starts normal in the same synchronous unwind, so only the final
        // order is deterministic.
        gates.shift()!("slot-0");
        await high;

        for (const release of gates) release("slot-n");
        await normal;
        expect(order).toEqual(["high", "normal"]);
        await Promise.all(blockers);
    });
});
