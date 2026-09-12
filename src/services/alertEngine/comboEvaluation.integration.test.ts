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
 * FEAT-0030 AC3, AC4 and AC5 — what a *group* does, against the real wasm
 * evaluator.
 *
 * Until this item there was no way to build a rule with more than one
 * condition, so nothing exercised `eval_group` from the TypeScript side. The
 * evaluator has had the code since #2640; what was missing is a test that the
 * two sides agree about what "all of them, in the same evaluation" means.
 *
 * Conditions here are price comparisons rather than indicators on purpose:
 * their truth is exactly controllable from the candle close, so a failure
 * points at the group semantics and not at a warmup or a moving average.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ruleSchema } from "../../lib/rules/ruleSchema";
import type {
    CompareOp,
    Condition,
    EvaluationCandle,
    LogicOp,
    RuleDocument,
} from "../../lib/rules/types";

vi.mock("../logger", () => ({
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../../services/logger", () => ({
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const WASM_JS = pathToFileURL(resolve(process.cwd(), "static/wasm/technicals_wasm.js")).href;
const WASM_BINARY = resolve(process.cwd(), "static/wasm/technicals_wasm_bg.wasm");
const CANDLE_OPEN_MS = 1_757_030_400_000;
const MINUTE_MS = 60_000;
const TF = "1m";

function candle(openTimeMs: number, close: string): EvaluationCandle {
    return {
        open_time_ms: openTimeMs,
        open: close,
        high: close,
        low: close,
        close,
        volume: "1",
    };
}

/** `close <op> value` on the trigger timeframe. */
function priceIs(op: CompareOp, value: string, timeframe = TF): Condition {
    return {
        kind: "compare",
        left: { kind: "price", field: "close" },
        op,
        right: { kind: "constant", value },
        timeframe,
    };
}

function groupRule(op: LogicOp, of: Condition[]): RuleDocument {
    return {
        schema_version: 1,
        id: "combo-1",
        name: "combo",
        symbol: "BTCUSDT",
        trigger_timeframe: TF,
        conditions: { kind: "group", op, of },
        action: { consequence_level: "notify" },
        provenance: { source: "human", created_at_ms: CANDLE_OPEN_MS },
    };
}

function evaluateOver(rule: RuleDocument, closes: string[]) {
    return ruleSchema.evaluate(rule, {
        candles: {
            [TF]: closes.map((close, i) => candle(CANDLE_OPEN_MS + i * MINUTE_MS, close)),
        },
    });
}

beforeAll(async () => {
    const mod = (await import(/* @vite-ignore */ WASM_JS)) as {
        default: (binary: BufferSource) => Promise<unknown>;
    };
    await mod.default(readFileSync(WASM_BINARY));
    ruleSchema.setLoader(async () => mod as never);
    await ruleSchema.load();
});

describe("AC3 — a combined alert fires when all of its conditions hold", () => {
    it("fires on the close where both conditions are true together", () => {
        const rule = groupRule("all", [priceIs("gt", "100"), priceIs("lt", "500")]);
        expect(evaluateOver(rule, ["50", "200"])).toEqual({ verdict: "fires" });
    });

    it("does not fire while only one of the two holds", () => {
        const rule = groupRule("all", [priceIs("gt", "100"), priceIs("lt", "500")]);
        expect(evaluateOver(rule, ["50", "900"])).toEqual({ verdict: "does_not_fire" });
    });

    it("holds for the full five conditions the builder allows", () => {
        const rule = groupRule("all", [
            priceIs("gt", "100"),
            priceIs("gt", "150"),
            priceIs("lt", "500"),
            priceIs("lt", "450"),
            priceIs("neq", "300"),
        ]);
        expect(evaluateOver(rule, ["50", "200"])).toEqual({ verdict: "fires" });
        // One member false is enough to keep the whole group silent.
        expect(evaluateOver(rule, ["50", "300"])).toEqual({ verdict: "does_not_fire" });
    });
});

describe("AC4 — conditions true at different times do not fire", () => {
    /**
     * `close > 100` and `close < 50` can never both hold in one evaluation.
     * Each is true on one of the two candles, so a group that fired on
     * "true at some point" would fire here. `all` must not.
     */
    const never = [priceIs("gt", "100"), priceIs("lt", "50")];

    it("stays silent when each condition was true on a different candle", () => {
        expect(evaluateOver(groupRule("all", never), ["200", "10"])).toEqual({
            verdict: "does_not_fire",
        });
    });

    it("stays silent whichever order the two moments arrive in", () => {
        expect(evaluateOver(groupRule("all", never), ["10", "200"])).toEqual({
            verdict: "does_not_fire",
        });
    });

    it("fires under `any`, which proves each condition really did hold once", () => {
        // The mirror of the test above: without this, "does not fire" could
        // just mean the candles never satisfied anything.
        expect(evaluateOver(groupRule("any", never), ["200", "10"])).toEqual({
            verdict: "fires",
        });
    });
});

describe("AC5 — the cost of a group stays bounded", () => {
    /**
     * Cost is read as what the rule *demands* -- how many series and how much
     * history the loop must hold per armed rule -- rather than as wall clock,
     * which would make this test a flake on a busy machine.
     */
    it("asks for one series when every condition reads the same timeframe", () => {
        const rule = groupRule("all", [
            priceIs("gt", "100"),
            priceIs("lt", "500"),
            priceIs("neq", "300"),
            priceIs("gte", "1"),
            priceIs("lte", "9999"),
        ]);
        expect(ruleSchema.timeframes(rule)).toEqual([TF]);
        expect(ruleSchema.timeframes(rule)).toHaveLength(1);
    });

    it("does not grow its warmup with the number of conditions", () => {
        const one = groupRule("all", [priceIs("gt", "100")]);
        const five = groupRule("all", [
            priceIs("gt", "100"),
            priceIs("lt", "500"),
            priceIs("neq", "300"),
            priceIs("gte", "1"),
            priceIs("lte", "9999"),
        ]);
        // The group needs the deepest member's history, never their sum --
        // otherwise five cheap conditions would cost five times one.
        expect(ruleSchema.warmupCandles(five)).toBe(ruleSchema.warmupCandles(one));
        // Pinned so the equality above cannot pass one day by both sides
        // collapsing to zero, which would mean the rule demands no history
        // at all rather than that the group is cheap.
        expect(ruleSchema.warmupCandles(one)).toBeGreaterThan(0);
    });

    it("asks for each distinct timeframe once, however many conditions use it", () => {
        const rule = groupRule("all", [
            priceIs("gt", "100"),
            priceIs("lt", "500"),
            priceIs("gt", "100", "1h"),
            priceIs("lt", "500", "1h"),
        ]);
        expect([...ruleSchema.timeframes(rule)].sort()).toEqual(["1h", "1m"]);
    });
});
