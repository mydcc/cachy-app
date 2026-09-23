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

// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

import { RuleEvaluationLoop } from "./ruleEvaluationLoop";
import { RuleRefusedError } from "../../lib/rules/ruleSchema";
import { logger } from "../logger";
import type { RuleDocument, Verdict } from "../../lib/rules/types";
import { RULES_STORAGE_KEY } from "./migrateAlertsToRules";
import { readStoredRules } from "./ruleLoopWiring";

vi.mock("$app/environment", () => ({ browser: true, dev: false }));

vi.mock("../logger", () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// The gate has its own tests and needs wasm; here it stands in as a spy so
// these tests are about close detection and rule selection, nothing else.
const gateEvaluate = vi.fn<() => Verdict | undefined>();
const gateEvaluateIntrabar = vi.fn<() => Verdict | undefined>();
vi.mock("../../lib/rules/ruleEvaluationGate", () => ({
  ruleEvaluationGate: {
    evaluate: (...args: unknown[]) => gateEvaluate(...(args as [])),
    evaluateIntrabar: (...args: unknown[]) => gateEvaluateIntrabar(...(args as [])),
  },
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
    gateEvaluateIntrabar.mockReset();
    gateEvaluateIntrabar.mockReturnValue(FIRES);
  });

  describe("disarming — FEAT-0406", () => {
    it("starts armed once configured, and reports itself disarmed afterwards", () => {
      const { loop } = loopWith([rule()]);

      expect(loop.isArmed()).toBe(true);

      loop.disarm();

      expect(loop.isArmed()).toBe(false);
    });

    it("evaluates nothing on a close once disarmed", () => {
      const { loop, onFiring } = loopWith([rule()]);
      loop.observeCandles("BTCUSDT", "1m", [{ time: 1_000 }]);

      loop.disarm();
      const firings = loop.observeCandles("BTCUSDT", "1m", [{ time: 61_000 }]);

      // The close is real — the armed loop fires on exactly this one, see
      // "anchors on the previous candle once a later one appears".
      expect(firings).toEqual([]);
      expect(gateEvaluate).not.toHaveBeenCalled();
      expect(onFiring).not.toHaveBeenCalled();
    });

    it("stops telling the caller about closes", () => {
      // The store re-syncs legacy coverage from this hook. A disarmed loop
      // that kept calling it would drive coverage decisions on behalf of an
      // evaluator that no longer evaluates anything.
      const onClose = vi.fn();
      const loop = new RuleEvaluationLoop({
        readCandles: () => [],
        readRules: () => [rule()],
        onClose,
      });
      loop.observeCandles("BTCUSDT", "1m", [{ time: 1_000 }]);

      loop.disarm();
      loop.observeCandles("BTCUSDT", "1m", [{ time: 61_000 }]);

      expect(onClose).not.toHaveBeenCalled();
    });

    it("keeps its series state, so a re-arm does not skip a close", () => {
      // `disarm()` is not `reset()`. Dropping the high-water marks would make
      // the next candle of each series look like its first, and the first
      // candle of a series closes nothing — a re-armed loop would sit out the
      // crossing it was re-armed for.
      const { loop, onFiring } = loopWith([rule()]);
      loop.observeCandles("BTCUSDT", "1m", [{ time: 1_000 }]);
      loop.disarm();

      loop.configure({ readCandles: () => [], readRules: () => [rule()], onFiring });
      const firings = loop.observeCandles("BTCUSDT", "1m", [{ time: 61_000 }]);

      expect(firings).toHaveLength(1);
      expect(firings[0].anchorMs).toBe(1_000);
    });

    it("is idempotent, and safe on a loop that was never configured", () => {
      const loop = new RuleEvaluationLoop();

      expect(loop.isArmed()).toBe(false);
      expect(() => {
        loop.disarm();
        loop.disarm();
      }).not.toThrow();
      expect(loop.isArmed()).toBe(false);
    });
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

  describe("reading the stored rule set — BUG-0484", () => {
    function storedConstant(value: string): RuleDocument {
      return {
        schema_version: 2,
        id: "stored",
        name: "stored",
        symbol: "BTCUSDT",
        trigger_timeframe: "1m",
        conditions: {
          kind: "compare",
          left: { kind: "price", field: "close" },
          op: "gte",
          right: { kind: "constant", value },
          timeframe: "1m",
        },
        action: { consequence_level: "notify" },
        enabled: true,
        provenance: { source: "human", created_at_ms: 0 },
      } as RuleDocument;
    }

    function thresholdOf(document: RuleDocument): string {
      const conditions = document.conditions as { right: { value: string } };
      return conditions.right.value;
    }

    /**
     * The close path evaluates the rule set as currently stored: an edit
     * between two closes is visible to the second close without a reload,
     * whichever path wrote it. The store write below bypasses every writer
     * on purpose — the cache is keyed on the bytes, not on who wrote them.
     */
    it("the close path sees an edit made between two closes", () => {
      const fired: RuleDocument[] = [];
      const loop = new RuleEvaluationLoop({
        readCandles: () => [],
        readRules: readStoredRules,
        onFiring: (firing) => {
          fired.push(firing.rule);
        },
      });
      localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify([storedConstant("100")]));
      loop.observeCandles("BTCUSDT", "1m", [{ time: 1_000 }]);
      loop.observeCandles("BTCUSDT", "1m", [{ time: 61_000 }]);

      localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify([storedConstant("200")]));
      loop.observeCandles("BTCUSDT", "1m", [{ time: 121_000 }]);

      expect(fired.map(thresholdOf)).toEqual(["100", "200"]);
    });

    /**
     * Intrabar rules keep being evaluated on every tick: the cached read
     * must not swallow the per-tick path it feeds.
     */
    it("intrabar rules are still evaluated on ticks that close nothing", () => {
      const loop = new RuleEvaluationLoop({
        readCandles: () => [],
        readFormingCandles: () => [],
        readRules: readStoredRules,
        onFiring: () => {},
      });
      localStorage.setItem(
        RULES_STORAGE_KEY,
        JSON.stringify([{ ...storedConstant("100"), evaluation_mode: "intrabar" }]),
      );
      loop.observeCandles("BTCUSDT", "1m", [{ time: 1_000 }]);
      gateEvaluateIntrabar.mockClear();

      loop.observeCandles("BTCUSDT", "1m", [{ time: 1_000 }]);
      loop.observeCandles("BTCUSDT", "1m", [{ time: 1_000 }]);

      expect(gateEvaluateIntrabar).toHaveBeenCalledTimes(2);
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
    /** Closed candles a real indicator can be computed over. */
    const rampCandles = Array.from({ length: 60 }, (_, i) => {
      const price = String(100 + i);
      return { open_time_ms: i * 60_000, open: price, high: price, low: price, close: price };
    });

    const reading = (id: string): RuleDocument["conditions"] =>
      ({
        kind: "compare",
        left: { kind: "indicator", indicator: { id, params: { period: 20 } } },
        op: "gt",
        right: { kind: "constant", value: "0" },
        timeframe: "1m",
      }) as unknown as RuleDocument["conditions"];

    // BUG-0449. The catalogue offers HMA and the alert path claims to compute
    // it, but `computeIndicatorSeries` called `JSIndicators.hma` detached from
    // its object, so `this.wma` threw on every close. The throw escaped the
    // per-rule loop, and every rule ordered after the HMA alert on the same
    // series went unevaluated with it.
    it("evaluates an HMA alert and the rules after it on the same series", () => {
      const loop = new RuleEvaluationLoop({
        readCandles: () => rampCandles,
        readRules: () => [rule({ id: "hma", conditions: reading("hma") }), rule({ id: "after" })],
        onFiring: vi.fn(),
      });

      loop.observeCandles("BTCUSDT", "1m", [{ time: 1_000 }]);
      const firings = loop.observeCandles("BTCUSDT", "1m", [{ time: 61_000 }]);

      expect(firings.map((f) => f.rule.id)).toEqual(["hma", "after"]);
    });

    // The class, not the instance: whatever makes one rule's evaluation throw,
    // the other rules on that close are still owed a verdict.
    it("still evaluates the other rules on a series when one rule's evaluation throws", () => {
      const loop = new RuleEvaluationLoop({
        readCandles: (_symbol: string, timeframe: string) => {
          if (timeframe === "4h") throw new Error("4h series unavailable");
          return [];
        },
        readRules: () => [
          rule({
            id: "reads-4h",
            conditions: {
              kind: "group",
              op: "all",
              of: [{ kind: "compare", timeframe: "4h" }],
            } as unknown as RuleDocument["conditions"],
          }),
          rule({ id: "after" }),
        ],
        onFiring: vi.fn(),
      });

      loop.observeCandles("BTCUSDT", "1m", [{ time: 1_000 }]);
      const firings = loop.observeCandles("BTCUSDT", "1m", [{ time: 61_000 }]);

      expect(firings.map((f) => f.rule.id)).toEqual(["after"]);
      // Logged against the rule that failed, not the series. It is deliberately
      // not reported as unevaluable: that report tells a trader the alert "can
      // never fire", which a transient reader failure does not justify.
      expect(logger.error).toHaveBeenCalledWith(
        "alerts",
        expect.stringContaining("reads-4h"),
        expect.any(Error),
      );
    });

    /**
     * BUG-0468. The core validates every document it evaluates, so a stored
     * rule it no longer accepts — armed under an older, looser core — is
     * refused on every close. That is not transient: the same document and the
     * same core refuse it forever. Logging it every close and telling the
     * trader nothing made a dead alert look like a live one.
     */
    it("reports a rule the core refuses as unevaluable, once, and evaluates the rules after it", () => {
      const refusal = new RuleRefusedError([
        {
          code: "invalid_window_lookback",
          field: "conditions.right.lookback",
          detail: "a window of fewer than two closes is the operand itself",
          i18n_key: "rules.refusal.invalidWindowLookback",
        },
      ]);
      gateEvaluate.mockImplementation(((document: RuleDocument) => {
        if (document.id === "refused") throw refusal;
        return FIRES;
      }) as never);
      const onUnevaluable = vi.fn();
      const loop = new RuleEvaluationLoop({
        readCandles: () => [],
        readRules: () => [rule({ id: "refused", name: "old alert" }), rule({ id: "after" })],
        onFiring: vi.fn(),
        onUnevaluable,
      });

      loop.observeCandles("BTCUSDT", "1m", [{ time: 1_000 }]);
      const first = loop.observeCandles("BTCUSDT", "1m", [{ time: 61_000 }]);
      const second = loop.observeCandles("BTCUSDT", "1m", [{ time: 121_000 }]);

      expect(first.map((f) => f.rule.id)).toEqual(["after"]);
      expect(second.map((f) => f.rule.id)).toEqual(["after"]);
      expect(onUnevaluable).toHaveBeenCalledTimes(1);
      expect(onUnevaluable).toHaveBeenCalledWith(
        expect.objectContaining({
          ruleId: "refused",
          name: "old alert",
          symbol: "BTCUSDT",
          reason: expect.stringContaining("invalid_window_lookback"),
        }),
      );
      // Reported instead of logged as a failed evaluation on every close.
      expect(logger.error).not.toHaveBeenCalledWith("alerts", expect.stringContaining("refused"), expect.anything());
      expect(loop.unevaluableRules().map((r) => r.ruleId)).toEqual(["refused"]);
    });

    it("contains a firing sink that throws for one rule, not the rules after it", () => {
      const onFiring = vi.fn(() => {
        throw new Error("sink unavailable");
      });
      const loop = new RuleEvaluationLoop({
        readCandles: () => [],
        readRules: () => [rule({ id: "boom" }), rule({ id: "after" })],
        onFiring,
      });

      loop.observeCandles("BTCUSDT", "1m", [{ time: 1_000 }]);
      const firings = loop.observeCandles("BTCUSDT", "1m", [{ time: 61_000 }]);

      // Both rules were evaluated and reported; only the sink failed. The log
      // names the sink, so it is not read as an evaluation failure.
      expect(firings.map((f) => f.rule.id)).toEqual(["boom", "after"]);
      expect(onFiring).toHaveBeenCalledTimes(2);
      expect(logger.error).toHaveBeenCalledWith(
        "alerts",
        expect.stringContaining("Firing sink failed"),
        expect.any(Error),
      );
    });

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

    /*
     * BUG-0482 — `window` is the one operand that nests another and carries no
     * `source` of its own. Reading only the top level answered "no mark
     * operand here", so the core got no `mark_candles` and returned
     * `indeterminate` on every close, for good. "Breaks above its 20-candle
     * mark high" is a liquidation-adjacent alarm that never fired and looked
     * armed the whole time.
     */
    const markWindowBreak = (timeframe = "1m") => ({
      kind: "compare",
      left: { kind: "price", field: "close", source: "mark" },
      op: "gte",
      right: {
        kind: "window",
        of: { kind: "price", field: "high", source: "mark" },
        agg: "max",
        lookback: 20,
      },
      timeframe,
    });

    it("supplies the mark series for a mark operand nested in a window", () => {
      const reader = vi.fn(() => []);
      const { ctx } = contextAfterOneClose(
        [
          rule({
            conditions: {
              ...markWindowBreak(),
              // Only the window names the mark price, so the top-level scan
              // that used to decide this finds nothing.
              left: { kind: "price", field: "close" },
            } as never,
          }),
        ],
        reader as never,
      );

      expect(reader).toHaveBeenCalledWith("BTCUSDT", "1m");
      expect(ctx).toHaveProperty("mark_candles");
    });

    it("leaves the mark series alone for a window over the last price", () => {
      const reader = vi.fn(() => []);
      const { ctx } = contextAfterOneClose(
        [
          rule({
            conditions: {
              ...markWindowBreak(),
              left: { kind: "price", field: "close" },
              right: {
                kind: "window",
                of: { kind: "price", field: "high" },
                agg: "max",
                lookback: 20,
              },
            } as never,
          }),
        ],
        reader as never,
      );

      expect(reader).not.toHaveBeenCalled();
      expect(ctx).not.toHaveProperty("mark_candles");
    });

    it("supplies the mark series for a `percent_change` over the mark price", () => {
      const reader = vi.fn(() => []);
      contextAfterOneClose(
        [
          rule({
            conditions: {
              kind: "compare",
              left: {
                kind: "percent_change",
                field: "close",
                source: "mark",
                lookback: 3,
              },
              op: "gte",
              right: { kind: "constant", value: "5" },
              timeframe: "1m",
            } as never,
          }),
        ],
        reader as never,
      );

      expect(reader).toHaveBeenCalledWith("BTCUSDT", "1m");
    });

    it("finds a nested mark operand inside a veto as well as inside the conditions", () => {
      const reader = vi.fn(() => []);
      contextAfterOneClose(
        [
          rule({
            veto: {
              ...markWindowBreak("4h"),
              left: { kind: "price", field: "close" },
            } as never,
          }),
        ],
        reader as never,
      );

      expect(reader).toHaveBeenCalledWith("BTCUSDT", "4h");
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

  describe("intrabar evaluation — FEAT-0477", () => {
    const FORMING = [
      { open_time_ms: 60_000, open: "1", high: "1", low: "1", close: "1", volume: "0" },
    ];

    function intrabarLoop(rules: RuleDocument[], readFormingCandles = () => FORMING) {
      const onFiring = vi.fn();
      const loop = new RuleEvaluationLoop({
        readCandles: () => [],
        readFormingCandles,
        readRules: () => rules,
        onFiring,
      });
      return { loop, onFiring };
    }

    /**
     * The whole of what the mode buys: the close path answers once a candle,
     * this one answers while the candle is still being written.
     */
    it("evaluates on a tick that closed nothing", () => {
      const { loop, onFiring } = intrabarLoop([rule({ evaluation_mode: "intrabar" })]);

      // The first candle of a series closes nothing — there is no earlier
      // candle to have closed. The second call is that same candle updated in
      // place, which the close path ignores entirely.
      loop.observeCandles("BTCUSDT", "1m", [{ time: 60_000 }]);
      const firings = loop.observeCandles("BTCUSDT", "1m", [{ time: 60_000 }]);

      expect(gateEvaluateIntrabar).toHaveBeenCalledTimes(2);
      expect(gateEvaluate).not.toHaveBeenCalled();
      expect(firings).toHaveLength(1);
      expect(onFiring).toHaveBeenCalledTimes(2);
    });

    it("anchors on the candle that is forming, not the one that just closed", () => {
      const { loop } = intrabarLoop([rule({ evaluation_mode: "intrabar" })]);

      loop.observeCandles("BTCUSDT", "1m", [{ time: 60_000 }]);
      gateEvaluateIntrabar.mockClear();
      loop.observeCandles("BTCUSDT", "1m", [{ time: 120_000 }]);

      // 60_000 closed on this call; 120_000 is the one now being written.
      expect(gateEvaluateIntrabar).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        120_000,
      );
    });

    /**
     * The two modes partition the rule set. An intrabar rule that also went
     * through the close would be asked twice about one candle it had already
     * been watching tick by tick, and the trader would hear one event twice.
     */
    it("keeps an intrabar rule off the close path", () => {
      const { loop } = intrabarLoop([rule({ evaluation_mode: "intrabar" })]);

      loop.observeCandles("BTCUSDT", "1m", [{ time: 60_000 }]);
      loop.observeCandles("BTCUSDT", "1m", [{ time: 120_000 }]);

      expect(gateEvaluate).not.toHaveBeenCalled();
    });

    it("leaves a rule with no mode, and one pinned to close, on the close path", () => {
      const { loop } = intrabarLoop([rule(), rule({ id: "r2", evaluation_mode: "close" })]);

      loop.observeCandles("BTCUSDT", "1m", [{ time: 60_000 }]);
      loop.observeCandles("BTCUSDT", "1m", [{ time: 120_000 }]);

      // An absent mode is `close` — the serialised form of every document
      // written before this existed.
      expect(gateEvaluateIntrabar).not.toHaveBeenCalled();
      expect(gateEvaluate).toHaveBeenCalledTimes(2);
    });

    it("reads the trigger series through the forming reader, never the closed one", () => {
      const readFormingCandles = vi.fn(() => FORMING);
      const readCandles = vi.fn(() => []);
      const loop = new RuleEvaluationLoop({
        readCandles,
        readFormingCandles,
        readRules: () => [rule({ evaluation_mode: "intrabar" })],
        onFiring: vi.fn(),
      });

      loop.observeCandles("BTCUSDT", "1m", [{ time: 60_000 }]);

      expect(readFormingCandles).toHaveBeenCalledWith("BTCUSDT", "1m");
      expect(readCandles).not.toHaveBeenCalledWith("BTCUSDT", "1m");
    });

    /**
     * Without a forming reader these would be evaluated against an empty
     * series, read as not-warmed-up, and withheld forever — an alert sitting
     * in the panel looking armed and firing never, which is the worst thing an
     * alert system can do. It has to say so instead.
     */
    it("reports an intrabar rule as unevaluable when nothing can read the forming candle", () => {
      const onUnevaluable = vi.fn();
      const loop = new RuleEvaluationLoop({
        readCandles: () => [],
        readRules: () => [rule({ evaluation_mode: "intrabar" })],
        onUnevaluable,
      });

      loop.observeCandles("BTCUSDT", "1m", [{ time: 60_000 }]);
      loop.observeCandles("BTCUSDT", "1m", [{ time: 60_000 }]);

      expect(gateEvaluateIntrabar).not.toHaveBeenCalled();
      expect(loop.unevaluableRules()).toHaveLength(1);
      // Told once, not once per tick.
      expect(onUnevaluable).toHaveBeenCalledTimes(1);
    });

    it("evaluates nothing before the series has produced a candle at all", () => {
      const { loop } = intrabarLoop([rule({ evaluation_mode: "intrabar" })]);

      loop.observeCandles("BTCUSDT", "1m", []);

      expect(gateEvaluateIntrabar).not.toHaveBeenCalled();
    });

    it("stops evaluating intrabar once disarmed", () => {
      const { loop } = intrabarLoop([rule({ evaluation_mode: "intrabar" })]);
      loop.observeCandles("BTCUSDT", "1m", [{ time: 60_000 }]);
      gateEvaluateIntrabar.mockClear();

      loop.disarm();
      loop.observeCandles("BTCUSDT", "1m", [{ time: 60_000 }]);

      expect(gateEvaluateIntrabar).not.toHaveBeenCalled();
    });
  });
});
