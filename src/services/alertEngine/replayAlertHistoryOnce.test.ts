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

import { describe, expect, it, vi } from "vitest";
import type { EvaluationCandle } from "../../lib/rules/types";

const series = (closes: string[]): EvaluationCandle[] =>
    closes.map((close, i) => ({
        open_time_ms: 1757000000000 + i * 60_000,
        open: close,
        high: close,
        low: close,
        close,
        volume: "1",
    }));

/**
 * BUG-0441 follow-up: `replayAlertHistoryOnce` is the guard that makes a second
 * `initAlertEngine()` call a no-op for the replay step. It lives in this module
 * so a dev-HMR replacement of `alerts.svelte.ts` cannot reset it while the
 * guarded WASM engine singleton survives.
 *
 * This file is deliberately the only one to touch the one-shot state, and it
 * resets modules first, so the module-scope flag cannot leak between tests.
 */
describe("replayAlertHistoryOnce", () => {
    it("replays on the first call and refuses to replay again", async () => {
        vi.resetModules();
        const mod = await import("./replayClosedCandles");
        const evaluate = vi.fn();
        const deps = {
            alerts: [{ id: "a1", symbol: "BTCUSDT", active: true }],
            readCandles: () => series(["64000", "65500"]),
            evaluate,
        };

        expect(mod.hasAlertHistoryReplayed()).toBe(false);

        const first = mod.replayAlertHistoryOnce(deps);
        expect(first?.candles).toBe(2);
        expect(mod.hasAlertHistoryReplayed()).toBe(true);

        const second = mod.replayAlertHistoryOnce(deps);
        expect(second).toBeNull();
        // Only the first call reached the engine.
        expect(evaluate).toHaveBeenCalledTimes(2);
    });
});
