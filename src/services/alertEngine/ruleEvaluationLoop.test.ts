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

    it("forgets every series of an evicted symbol", () => {
      const { loop } = loopWith([
        rule(),
        rule({ id: "r5m", trigger_timeframe: "5m" }),
        rule({ id: "eth", symbol: "ETHUSDT" }),
      ]);
      loop.observeCandles("BTCUSDT", "1m", [{ time: 1_000 }]);
      loop.observeCandles("BTCUSDT", "5m", [{ time: 1_000 }]);
      loop.observeCandles("ETHUSDT", "1m", [{ time: 1_000 }]);

      loop.forgetSymbol("BTCUSDT");

      // Both BTC series start over, so their next candle closes nothing.
      expect(loop.observeCandles("BTCUSDT", "1m", [{ time: 61_000 }])).toEqual([]);
      expect(loop.observeCandles("BTCUSDT", "5m", [{ time: 301_000 }])).toEqual([]);
      // ETH was not touched and still has its high-water mark, so it closes.
      expect(loop.observeCandles("ETHUSDT", "1m", [{ time: 61_000 }]).map((f) => f.rule.id)).toEqual([
        "eth",
      ]);
    });

    it("forgets a series on request", () => {
      const { loop } = loopWith([rule()]);
      loop.observeCandles("BTCUSDT", "1m", [{ time: 1_000 }]);
      loop.forgetSeries("BTCUSDT", "1m");

      // Without remembered state, the next candle is a first candle again.
      expect(loop.observeCandles("BTCUSDT", "1m", [{ time: 61_000 }])).toEqual([]);
    });
  });

  describe("onClose", () => {
    it("fires once per genuine close, with the anchor", () => {
      const onClose = vi.fn();
      const loop = new RuleEvaluationLoop({
        readCandles: () => [],
        readRules: () => [],
        onClose,
      });

      loop.observeCandles("BTCUSDT", "1m", [{ time: 1_000 }]);
      expect(onClose).not.toHaveBeenCalled();

      loop.observeCandles("BTCUSDT", "1m", [{ time: 61_000 }]);
      expect(onClose).toHaveBeenCalledExactlyOnceWith("BTCUSDT", "1m", 1_000);
    });

    it("does not fire again for ticks inside the same candle", () => {
      const onClose = vi.fn();
      const loop = new RuleEvaluationLoop({
        readCandles: () => [],
        readRules: () => [],
        onClose,
      });
      loop.observeCandles("BTCUSDT", "1m", [{ time: 1_000 }]);
      loop.observeCandles("BTCUSDT", "1m", [{ time: 61_000 }]);
      onClose.mockClear();

      loop.observeCandles("BTCUSDT", "1m", [{ time: 61_000 }]);

      expect(onClose).not.toHaveBeenCalled();
    });

    it("runs before the rule below can fire, so a caller can react first", () => {
      // FEAT-0387 review round 3: a caller uses this to re-sync which alerts
      // the legacy engine still holds, based on which series are observed.
      // For that to close the race rather than narrow it, the hook has to
      // run before this close's own evaluation can notify anyone.
      const order: string[] = [];
      const loop = new RuleEvaluationLoop({
        readCandles: () => [],
        readRules: () => [rule()],
        onClose: () => order.push("close"),
        onFiring: () => order.push("fire"),
      });
      loop.observeCandles("BTCUSDT", "1m", [{ time: 1_000 }]);

      loop.observeCandles("BTCUSDT", "1m", [{ time: 61_000 }]);

      expect(order[0]).toBe("close");
    });

    it("defaults to a no-op — most callers have nothing that depends on it", () => {
      const { loop } = loopWith([]);
      loop.observeCandles("BTCUSDT", "1m", [{ time: 1_000 }]);

      expect(() => loop.observeCandles("BTCUSDT", "1m", [{ time: 61_000 }])).not.toThrow();
    });
  });

  // ---- FEAT-0390: the mark-price series ----------------------------------

  describe("mark-price candles", () => {
    const markCross = (timeframe = "1m") => ({
      kind: "cross",
      left: { kind: "price", field: "close", source: "mark" },
      direction: "above",
      right: { kind: "constant", value: "60000" },
      timeframe,
    });

    function loopReadingMark(rules: RuleDocument[], readMarkCandles = vi.fn(() => [])) {
      const loop = new RuleEvaluationLoop({
        readCandles: () => [],
        readMarkCandles,
        readRules: () => rules,
        onFiring: vi.fn(),
      });
      return { loop, readMarkCandles };
    }

    /** The context the gate receives on the one evaluated close. */
    function contextAfterOneClose(rules: RuleDocument[], readMarkCandles?: ReturnType<typeof vi.fn>) {
      const { loop, readMarkCandles: reader } = loopReadingMark(
        rules,
        readMarkCandles ?? vi.fn(() => []),
      );
      loop.observeCandles("BTCUSDT", "1m", [{ time: 1_000 }]);
      loop.observeCandles("BTCUSDT", "1m", [{ time: 61_000 }]);
      return { ctx: gateEvaluate.mock.calls[0][1] as Record<string, unknown>, reader };
    }

    /**
     * Every rule written before FEAT-0390 reads the last price. Those must send
     * the core exactly the context they sent before — no `mark_candles` key and
     * no request for a series nobody asked for.
     */
    it("sends no mark candles at all for a rule that reads the last price", () => {
      const { ctx, reader } = contextAfterOneClose([rule()]);

      expect(ctx).not.toHaveProperty("mark_candles");
      expect(reader).not.toHaveBeenCalled();
    });

    it("supplies the mark series for a rule that names it", () => {
      const marks = [{ open_time_ms: 1_000, open: "1", high: "1", low: "1", close: "1" }];
      const reader = vi.fn(() => marks);
      const { ctx } = contextAfterOneClose(
        [rule({ conditions: markCross() as never })],
        reader as never,
      );

      expect(reader).toHaveBeenCalledWith("BTCUSDT", "1m");
      expect(ctx.mark_candles).toEqual({ "1m": marks });
    });

    /**
     * A rule can name a coarser timeframe than its trigger. The mark series it
     * needs is that condition's timeframe, not the anchor's.
     */
    it("asks for the timeframe the condition names, not the trigger's", () => {
      const reader = vi.fn(() => []);
      contextAfterOneClose(
        [rule({ conditions: markCross("4h") as never })],
        reader as never,
      );

      expect(reader).toHaveBeenCalledWith("BTCUSDT", "4h");
      expect(reader).toHaveBeenCalledTimes(1);
    });

    /**
     * An unconfigured mark reader answers empty, which the core turns into an
     * indeterminate verdict. What it must never do is leave the key off and let
     * the core read the last-price series instead.
     */
    it("still declares the series when no mark reader is configured", () => {
      const loop = new RuleEvaluationLoop({
        readCandles: () => [],
        readRules: () => [rule({ conditions: markCross() as never })],
        onFiring: vi.fn(),
      });
      loop.observeCandles("BTCUSDT", "1m", [{ time: 1_000 }]);
      loop.observeCandles("BTCUSDT", "1m", [{ time: 61_000 }]);

      const ctx = gateEvaluate.mock.calls[0][1] as Record<string, unknown>;
      expect(ctx.mark_candles).toEqual({ "1m": [] });
    });
  });
});
