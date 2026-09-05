/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { RuleEvaluationLoop } from "./ruleEvaluationLoop";
import type { RuleDocument, Verdict } from "../../lib/rules/types";

vi.mock("../logger", () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// The gate has its own tests and needs wasm; here it stands in as a spy so
// these tests are about close detection and rule selection, nothing else.
const gateEvaluate = vi.fn<() => Verdict | undefined>();
vi.mock("../../lib/rules/ruleEvaluationGate", () => ({
  ruleEvaluationGate: { evaluate: (...args: unknown[]) => gateEvaluate(...(args as [])) },
}));

const FIRES: Verdict = { verdict: "fires" };
const QUIET: Verdict = { verdict: "does_not_fire" };

function rule(overrides: Partial<RuleDocument> = {}): RuleDocument {
  return {
    id: "r1",
    symbol: "BTCUSDT",
    trigger_timeframe: "1m",
    conditions: { kind: "group", op: "all", of: [] },
    ...overrides,
  } as unknown as RuleDocument;
}

function loopWith(rules: RuleDocument[], onFiring = vi.fn()) {
  const loop = new RuleEvaluationLoop({
    readCandles: () => [],
    readRules: () => rules,
    onFiring,
  });
  return { loop, onFiring };
}

describe("RuleEvaluationLoop", () => {
  beforeEach(() => {
    gateEvaluate.mockReset();
    gateEvaluate.mockReturnValue(FIRES);
  });

  describe("close detection", () => {
    it("does not evaluate on the first candle of a series", () => {
      const { loop } = loopWith([rule()]);

      const firings = loop.observeCandles("BTCUSDT", "1m", [{ time: 1_000 }]);

      expect(firings).toEqual([]);
      expect(gateEvaluate).not.toHaveBeenCalled();
    });

    it("anchors on the previous candle once a later one appears", () => {
      const { loop } = loopWith([rule()]);
      loop.observeCandles("BTCUSDT", "1m", [{ time: 1_000 }]);

      const firings = loop.observeCandles("BTCUSDT", "1m", [{ time: 61_000 }]);

      expect(firings).toHaveLength(1);
      expect(firings[0].anchorMs).toBe(1_000);
    });

    it("does not evaluate when the open candle is only updated in place", () => {
      const { loop } = loopWith([rule()]);
      loop.observeCandles("BTCUSDT", "1m", [{ time: 1_000 }]);
      loop.observeCandles("BTCUSDT", "1m", [{ time: 61_000 }]);
      gateEvaluate.mockClear();

      // Several ticks inside the same candle.
      loop.observeCandles("BTCUSDT", "1m", [{ time: 61_000 }]);
      loop.observeCandles("BTCUSDT", "1m", [{ time: 61_000 }]);

      expect(gateEvaluate).not.toHaveBeenCalled();
    });

    it("ignores a late-arriving older candle", () => {
      const { loop } = loopWith([rule()]);
      loop.observeCandles("BTCUSDT", "1m", [{ time: 61_000 }]);
      loop.observeCandles("BTCUSDT", "1m", [{ time: 121_000 }]);
      gateEvaluate.mockClear();

      const firings = loop.observeCandles("BTCUSDT", "1m", [{ time: 1_000 }]);

      expect(firings).toEqual([]);
      expect(gateEvaluate).not.toHaveBeenCalled();
    });

    it("tracks each symbol and timeframe separately", () => {
      const rules = [rule({ id: "btc" }), rule({ id: "eth", symbol: "ETHUSDT" })];
      const { loop } = loopWith(rules);

      loop.observeCandles("BTCUSDT", "1m", [{ time: 1_000 }]);
      loop.observeCandles("ETHUSDT", "1m", [{ time: 1_000 }]);
      const btc = loop.observeCandles("BTCUSDT", "1m", [{ time: 61_000 }]);

      expect(btc.map((f) => f.rule.id)).toEqual(["btc"]);
    });

    it("takes the highest open time in a batch", () => {
      const { loop } = loopWith([rule()]);
      loop.observeCandles("BTCUSDT", "1m", [{ time: 1_000 }, { time: 61_000 }]);

      const firings = loop.observeCandles("BTCUSDT", "1m", [{ time: 121_000 }]);

      expect(firings[0].anchorMs).toBe(61_000);
    });

    it("ignores candles with an unusable open time", () => {
      const { loop } = loopWith([rule()]);

      const firings = loop.observeCandles("BTCUSDT", "1m", [
        { time: Number.NaN },
        { time: undefined as unknown as number },
      ]);

      expect(firings).toEqual([]);
    });
  });

  describe("rule selection", () => {
    function closeOne(loop: RuleEvaluationLoop, symbol = "BTCUSDT", timeframe = "1m") {
      loop.observeCandles(symbol, timeframe, [{ time: 1_000 }]);
      return loop.observeCandles(symbol, timeframe, [{ time: 61_000 }]);
    }

    it("skips a rule on another symbol", () => {
      const { loop } = loopWith([rule({ symbol: "ETHUSDT" })]);

      expect(closeOne(loop)).toEqual([]);
    });

    it("skips a rule anchored on another timeframe", () => {
      const { loop } = loopWith([rule({ trigger_timeframe: "5m" })]);

      expect(closeOne(loop)).toEqual([]);
    });

    it("skips a disabled rule", () => {
      const { loop } = loopWith([rule({ enabled: false })]);

      expect(closeOne(loop)).toEqual([]);
    });

    it("reports nothing when the gate withholds a verdict", () => {
      gateEvaluate.mockReturnValue(undefined);
      const { loop, onFiring } = loopWith([rule()]);

      expect(closeOne(loop)).toEqual([]);
      expect(onFiring).not.toHaveBeenCalled();
    });

    it("reports nothing when the rule does not fire", () => {
      gateEvaluate.mockReturnValue(QUIET);
      const { loop, onFiring } = loopWith([rule()]);

      expect(closeOne(loop)).toEqual([]);
      expect(onFiring).not.toHaveBeenCalled();
    });

    it("hands a firing to the sink exactly once", () => {
      const { loop, onFiring } = loopWith([rule()]);

      closeOne(loop);

      expect(onFiring).toHaveBeenCalledTimes(1);
      expect(onFiring.mock.calls[0][0]).toMatchObject({ anchorMs: 1_000, verdict: FIRES });
    });
  });

  describe("candle context", () => {
    it("reads the trigger timeframe and every timeframe a condition names", () => {
      const readCandles = vi.fn(() => []);
      const loop = new RuleEvaluationLoop({
        readCandles,
        readRules: () => [
          rule({
            conditions: {
              kind: "group",
              op: "all",
              of: [
                { kind: "compare", timeframe: "1m" },
                { kind: "compare", timeframe: "4h" },
              ],
            } as unknown as RuleDocument["conditions"],
          }),
        ],
        onFiring: vi.fn(),
      });

      loop.observeCandles("BTCUSDT", "1m", [{ time: 1_000 }]);
      loop.observeCandles("BTCUSDT", "1m", [{ time: 61_000 }]);

      const timeframes = readCandles.mock.calls.map((call) => (call as unknown as string[])[1]);
      expect(timeframes).toContain("1m");
      expect(timeframes).toContain("4h");
      // The trigger timeframe is read once, not once per mention.
      expect(timeframes.filter((tf) => tf === "1m")).toHaveLength(1);
    });
  });

  describe("robustness", () => {
    it("never throws when a reader fails", () => {
      const loop = new RuleEvaluationLoop({
        readCandles: () => [],
        readRules: () => {
          throw new Error("store unavailable");
        },
      });

      loop.observeCandles("BTCUSDT", "1m", [{ time: 1_000 }]);
      expect(() => loop.observeCandles("BTCUSDT", "1m", [{ time: 61_000 }])).not.toThrow();
    });

    it("survives an empty or malformed candle batch", () => {
      const { loop } = loopWith([rule()]);

      expect(loop.observeCandles("BTCUSDT", "1m", [])).toEqual([]);
      expect(
        loop.observeCandles("BTCUSDT", "1m", null as unknown as { time: number }[]),
      ).toEqual([]);
    });

    it("forgets a series on request", () => {
      const { loop } = loopWith([rule()]);
      loop.observeCandles("BTCUSDT", "1m", [{ time: 1_000 }]);
      loop.forgetSeries("BTCUSDT", "1m");

      // Without remembered state, the next candle is a first candle again.
      expect(loop.observeCandles("BTCUSDT", "1m", [{ time: 61_000 }])).toEqual([]);
    });
  });
});
