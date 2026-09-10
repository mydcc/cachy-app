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

/**
 * FEAT-0028 acceptance criterion 1 — each condition fires correctly, per
 * indicator, over a whole series.
 *
 * ## What makes this non-circular
 *
 * Asserting that the evaluator agrees with itself proves nothing. So each
 * condition is answered twice, by two paths that share no code:
 *
 * - the real wasm evaluator, handed the same context the live loop builds;
 * - a naive oracle in this file, four lines of array indexing, obviously
 *   correct by inspection.
 *
 * They are compared at *every* candle of the series, not at a hand-picked one.
 * A cross that fires one candle late, a comparison that reads the open candle,
 * a warmup off by one — all of them are a disagreement at some index, and the
 * failure message names it.
 *
 * The indicator *values* come from the same `computeIndicatorSeries` on both
 * sides, so this does not re-derive the indicator maths; it pins the condition
 * semantics and the indexing around them. Indicator maths against an
 * independent implementation is `indicatorMath.test.ts`.
 *
 * Evaluating at candle `i` means slicing the series to `[0..i]`, which is
 * exactly what the live loop has at that moment — so warmup is exercised for
 * real rather than assumed away.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { CANDLE_SERIES, SERIES_TIMEFRAME } from "../../lib/rules/__fixtures__/candleSeries";
import { collectIndicators } from "../../lib/rules/indicatorRequests";
import { computeIndicatorSeries } from "../../lib/rules/indicatorSeries";
import { ruleSchema } from "../../lib/rules/ruleSchema";
import type {
  Condition,
  EvaluationContext,
  EvaluationIndicatorSeries,
  Operand,
  RuleDocument,
  Verdict,
} from "../../lib/rules/types";

vi.mock("../logger", () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../../services/logger", () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const WASM_JS = pathToFileURL(resolve(process.cwd(), "static/wasm/technicals_wasm.js")).href;
const WASM_BINARY = resolve(process.cwd(), "static/wasm/technicals_wasm_bg.wasm");

interface RuleCore {
  rule_from_alert_json(alertJson: string, timeframe: string, createdAtMs: number): string;
}

/** A document the core already accepts, used as the template for every rule here. */
let template: RuleDocument;

beforeAll(async () => {
  const mod = (await import(/* @vite-ignore */ WASM_JS)) as {
    default: (binary: BufferSource) => Promise<unknown>;
  } & RuleCore;
  await mod.default(readFileSync(WASM_BINARY));

  ruleSchema.setLoader(async () => mod as never);
  await ruleSchema.load();

  // Built by the migration rather than by hand, so `schema_version` and
  // `provenance` are whatever the core currently requires and this file does
  // not have to track them.
  const alert = {
    id: "a1",
    symbol: "BTCUSDT",
    condition: { price_reached: "50000.0" },
    active: true,
  };
  template = JSON.parse(
    mod.rule_from_alert_json(JSON.stringify(alert), SERIES_TIMEFRAME, CANDLE_SERIES[0].open_time_ms),
  );
});

function ruleWith(conditions: Condition): RuleDocument {
  return { ...template, name: "condition under test", conditions };
}

const indicator = (id: string, params: Record<string, number>, output?: string): Operand => ({
  kind: "indicator",
  indicator: { id, params, ...(output ? { output } : {}) },
});
const constant = (value: string): Operand => ({ kind: "constant", value });
const price = (field: "close") => ({ kind: "price", field }) as Operand;
const volume = (): Operand => ({ kind: "volume" });

/** The context the live loop would build at candle `index`. */
function contextAt(rule: RuleDocument, index: number): EvaluationContext {
  const candles = CANDLE_SERIES.slice(0, index + 1);
  const indicators: EvaluationIndicatorSeries[] = [];

  for (const request of collectIndicators(rule)) {
    const series = computeIndicatorSeries(request, candles);
    if (!series.supported) throw new Error(series.reason);
    indicators.push({
      indicator: request.indicator,
      timeframe: request.timeframe,
      values: series.values,
    });
  }
  return indicators.length > 0
    ? { candles: { [SERIES_TIMEFRAME]: candles }, indicators }
    : { candles: { [SERIES_TIMEFRAME]: candles } };
}

/** The numbers an operand resolves to across the whole series. */
function seriesFor(operand: Operand): (number | null)[] {
  if (operand.kind === "constant") return CANDLE_SERIES.map(() => Number(operand.value));
  if (operand.kind === "price") return CANDLE_SERIES.map((c) => Number(c[operand.field]));
  if (operand.kind === "volume") return CANDLE_SERIES.map((c) => Number(c.volume));

  const result = computeIndicatorSeries(
    { indicator: operand.indicator, timeframe: SERIES_TIMEFRAME },
    CANDLE_SERIES,
  );
  if (!result.supported) throw new Error(result.reason);
  return result.values.map((v) => (v === null ? null : Number(v)));
}

type Oracle = (index: number) => boolean | null;

/** `left op right`, read at one candle. `null` where a value is missing. */
function compareOracle(
  left: Operand,
  op: (a: number, b: number) => boolean,
  right: Operand,
): Oracle {
  const l = seriesFor(left);
  const r = seriesFor(right);
  return (i) => (l[i] === null || r[i] === null ? null : op(l[i] as number, r[i] as number));
}

/** `left` crossing above `right` between the previous candle and this one. */
function crossAboveOracle(left: Operand, right: Operand): Oracle {
  const l = seriesFor(left);
  const r = seriesFor(right);
  return (i) => {
    if (i === 0) return null;
    const [pl, pr, cl, cr] = [l[i - 1], r[i - 1], l[i], r[i]];
    if (pl === null || pr === null || cl === null || cr === null) return null;
    return pl <= pr && cl > cr;
  };
}

/**
 * Walk the series, comparing the evaluator against the oracle at every candle.
 *
 * Returns what happened so a caller can also assert the condition was actually
 * exercised — a run in which nothing ever fired would otherwise pass happily
 * and prove nothing at all.
 */
function walkSeries(rule: RuleDocument, oracle: Oracle) {
  const disagreements: string[] = [];
  let fired = 0;
  let compared = 0;

  for (let i = 0; i < CANDLE_SERIES.length; i++) {
    const expected = oracle(i);
    if (expected === null) continue;

    const verdict = ruleSchema.evaluate(rule, contextAt(rule, i)) as Verdict | undefined;
    if (verdict === undefined || verdict.verdict === "indeterminate") continue;

    compared++;
    const actually = verdict.verdict === "fires";
    if (actually) fired++;
    if (actually !== expected) {
      disagreements.push(
        `candle ${i} (${CANDLE_SERIES[i].close}): evaluator ${verdict.verdict}, oracle ${expected}`,
      );
    }
  }
  return { disagreements, fired, compared };
}

/**
 * One condition, checked end to end.
 *
 * `minimumFirings` is the teeth: it asserts the series actually drove the
 * condition rather than leaving it flat, so a green run means agreement *and*
 * exercise.
 */
function itAgrees(name: string, conditions: Condition, oracle: () => Oracle, minimumFirings: number) {
  it(name, () => {
    const rule = ruleWith(conditions);
    const { disagreements, fired, compared } = walkSeries(rule, oracle());

    expect(disagreements).toEqual([]);
    expect(compared).toBeGreaterThan(100);
    expect(fired).toBeGreaterThanOrEqual(minimumFirings);
  });
}

const RSI14 = indicator("rsi", { period: 14 });
const MACD = { fast_period: 12, slow_period: 26, signal_period: 9 };
const BB = { period: 20, std_dev: 2 };
const gt = (a: number, b: number) => a > b;
const gte = (a: number, b: number) => a >= b;
const lt = (a: number, b: number) => a < b;

describe("indicator conditions against the real evaluator", () => {
  describe("RSI", () => {
    itAgrees(
      "fires on every candle where RSI is above the overbought threshold",
      { kind: "compare", left: RSI14, op: "gt", right: constant("70"), timeframe: SERIES_TIMEFRAME },
      () => compareOracle(RSI14, gt, constant("70")),
      20,
    );

    itAgrees(
      "fires on every candle where RSI is below the oversold threshold",
      { kind: "compare", left: RSI14, op: "lt", right: constant("30"), timeframe: SERIES_TIMEFRAME },
      () => compareOracle(RSI14, lt, constant("30")),
      20,
    );

    itAgrees(
      "fires only on the candle RSI crosses back above oversold",
      {
        kind: "cross",
        left: RSI14,
        direction: "above",
        right: constant("30"),
        timeframe: SERIES_TIMEFRAME,
      },
      () => crossAboveOracle(RSI14, constant("30")),
      3,
    );
  });

  describe("MACD", () => {
    const line = indicator("macd", MACD, "macd");
    const signal = indicator("macd", MACD, "signal");
    const histogram = indicator("macd", MACD, "histogram");

    itAgrees(
      "fires on the golden cross of the line over its signal",
      { kind: "cross", left: line, direction: "above", right: signal, timeframe: SERIES_TIMEFRAME },
      () => crossAboveOracle(line, signal),
      8,
    );

    itAgrees(
      "fires when the histogram turns positive",
      {
        kind: "cross",
        left: histogram,
        direction: "above",
        right: constant("0"),
        timeframe: SERIES_TIMEFRAME,
      },
      () => crossAboveOracle(histogram, constant("0")),
      8,
    );
  });

  describe("Bollinger Bands", () => {
    const upper = indicator("bollinger", BB, "upper");
    const percentB = indicator("bollinger", BB, "percent_b");

    itAgrees(
      "fires when the close touches the upper band",
      {
        kind: "compare",
        left: price("close"),
        op: "gte",
        right: upper,
        timeframe: SERIES_TIMEFRAME,
      },
      () => compareOracle(price("close"), gte, upper),
      15,
    );

    itAgrees(
      "agrees with percent_b about the same touch",
      {
        kind: "compare",
        left: percentB,
        op: "gte",
        right: constant("1"),
        timeframe: SERIES_TIMEFRAME,
      },
      () => compareOracle(percentB, gte, constant("1")),
      15,
    );
  });

  describe("moving-average crosses", () => {
    const fast = indicator("ema", { period: 50 });
    const slow = indicator("ema", { period: 200 });

    itAgrees(
      "fires on the golden cross",
      { kind: "cross", left: fast, direction: "above", right: slow, timeframe: SERIES_TIMEFRAME },
      () => crossAboveOracle(fast, slow),
      1,
    );
  });

  /**
   * Volume anomalies, the condition FEAT-0028 names and could not express.
   *
   * `volume` is now its own operand rather than a seventh `PriceField`, which
   * is what lets the core refuse it against a price instead of comparing
   * traded size to quote currency. The two directions are both worth pinning:
   * the condition works, and the nonsense next to it does not.
   */
  describe("volume anomalies", () => {
    it("fires when volume runs above its own average", () => {
      const average = indicator("volume_ma", { period: 20 });
      const rule = ruleWith({
        kind: "compare",
        left: volume(),
        op: "gt",
        right: average,
        timeframe: SERIES_TIMEFRAME,
      });

      const { disagreements, fired, compared } = walkSeries(
        rule,
        compareOracle(volume(), gt, average),
      );

      expect(disagreements).toEqual([]);
      expect(compared).toBeGreaterThan(100);
      // A random walk spends a good share of its candles above its own
      // 20-period volume average; if this were near zero the operand would be
      // reading a constant rather than the series.
      expect(fired).toBeGreaterThan(50);
    });

    it("fires on a bare volume threshold, because a constant carries no unit", () => {
      const threshold = constant("300");
      const rule = ruleWith({
        kind: "compare",
        left: volume(),
        op: "gt",
        right: threshold,
        timeframe: SERIES_TIMEFRAME,
      });

      const { disagreements, compared } = walkSeries(
        rule,
        compareOracle(volume(), gt, threshold),
      );

      expect(disagreements).toEqual([]);
      expect(compared).toBeGreaterThan(100);
    });

    /**
     * The reason the operand exists in its own right. Both numbers are
     * well-formed, so nothing downstream would object — the rule would compare
     * traded size against a price and fire on the crossover of two unrelated
     * scales. The core refuses it instead.
     */
    it("refuses volume against a price rather than comparing them", () => {
      const rule = ruleWith({
        kind: "compare",
        left: volume(),
        op: "gt",
        right: price("close"),
        timeframe: SERIES_TIMEFRAME,
      });

      expect(() => ruleSchema.evaluate(rule, contextAt(rule, 50))).toThrow(
        /operand_dimension_mismatch/,
      );
    });

    it("refuses volume against a price moving average for the same reason", () => {
      const rule = ruleWith({
        kind: "compare",
        left: volume(),
        op: "gt",
        right: indicator("ema", { period: 20 }),
        timeframe: SERIES_TIMEFRAME,
      });

      expect(() => ruleSchema.evaluate(rule, contextAt(rule, 50))).toThrow(
        /operand_dimension_mismatch/,
      );
    });

    it("can still compare one volume average against another", () => {
      const fast = indicator("volume_ma", { period: 5 });
      const slow = indicator("volume_ma", { period: 20 });
      const rule = ruleWith({
        kind: "compare",
        left: fast,
        op: "gt",
        right: slow,
        timeframe: SERIES_TIMEFRAME,
      });

      const { disagreements, fired, compared } = walkSeries(rule, compareOracle(fast, gt, slow));

      expect(disagreements).toEqual([]);
      expect(compared).toBeGreaterThan(100);
      expect(fired).toBeGreaterThan(50);
    });
  });
});
