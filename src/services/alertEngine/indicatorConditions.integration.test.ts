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
const window = (agg: "min" | "max", lookback: number, of: Operand): Operand => ({
  kind: "window",
  of,
  agg,
  lookback,
});

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

  if (operand.kind === "window") {
    // Rolled here in plain JS rather than asked of the core, which makes this
    // a genuinely independent second path — unlike `bandwidth`, where the
    // oracle shares the implementation under test and a scale error would move
    // both sides together. A span that reaches before the series, or over a
    // missing value, has no aggregate at all: the minimum of part of a window
    // is not the minimum of the window.
    const base = seriesFor(operand.of);
    const { agg, lookback } = operand;
    return base.map((_, i) => {
      if (i + 1 < lookback) return null;
      const span = base.slice(i - lookback + 1, i + 1);
      if (span.some((v) => v === null)) return null;
      const numbers = span as number[];
      return agg === "min" ? Math.min(...numbers) : Math.max(...numbers);
    });
  }

  if (operand.kind !== "indicator")
    throw new Error(`seriesFor: no series for ${operand.kind}`);

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
const lte = (a: number, b: number) => a <= b;

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
    const bandwidth = indicator("bollinger", BB, "bandwidth");

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

    /*
     * Squeeze, the second condition FEAT-0028 names and could not express.
     *
     * `0.5` is not an arbitrary constant: bandwidth over this series runs from
     * 0.36 to 2.87 with a median of 0.93, so the threshold sits in the bottom
     * decile — a genuine contraction rather than a number that happens to be
     * true most of the time. The oracle recomputes it from the band lines, so
     * a scale change in either path shows up here as a disagreement.
     */
    itAgrees(
      "fires while the bands are contracted",
      {
        kind: "compare",
        left: bandwidth,
        op: "lt",
        right: constant("0.5"),
        timeframe: SERIES_TIMEFRAME,
      },
      () => compareOracle(bandwidth, lt, constant("0.5")),
      10,
    );

    /*
     * The squeeze threshold has to discriminate, and `itAgrees` cannot check
     * that: its oracle shares this path's implementation, so both sides move
     * together under a scale error and the comparison stays silent. Reverting
     * the `* 100` demonstrates it — bandwidth becomes 0.004..0.029, every
     * candle is below `0.5`, the oracle agrees on all of them and the test
     * passes while meaning nothing.
     *
     * A condition true on every candle is not an alert. Pinning that the
     * threshold splits the series closes the class rather than trusting the
     * constant to stay sensible.
     */
    it("does not treat every candle as a squeeze", () => {
      const rule = ruleWith({
        kind: "compare",
        left: bandwidth,
        op: "lt",
        right: constant("0.5"),
        timeframe: SERIES_TIMEFRAME,
      });
      const { fired, compared } = walkSeries(
        rule,
        compareOracle(bandwidth, lt, constant("0.5")),
      );

      expect(fired).toBeGreaterThan(0);
      expect(fired).toBeLessThan(compared / 2);
    });

    /**
     * The tradeable half of a squeeze is its release, which is a crossing and
     * not a state — the reason `cross` exists alongside `compare`.
     */
    itAgrees(
      "fires when the bands expand back out of the squeeze",
      {
        kind: "cross",
        left: bandwidth,
        direction: "above",
        right: constant("1"),
        timeframe: SERIES_TIMEFRAME,
      },
      () => crossAboveOracle(bandwidth, constant("1")),
      8,
    );

    /**
     * Bollinger's own definition of a Squeeze, which the absolute threshold
     * above only approximates: the *lowest* bandwidth of a long lookback, not a
     * fixed number. `0.5` is market-specific and silently wrong carried to
     * another symbol; a rolling minimum means the same thing everywhere.
     *
     * The oracle rolls the window in JS while the evaluator rolls it in Rust,
     * so agreement here is two implementations agreeing rather than one
     * checking itself.
     */
    itAgrees(
      "fires when bandwidth is at its own 60-candle low",
      {
        kind: "compare",
        left: bandwidth,
        op: "lte",
        right: window("min", 60, bandwidth),
        timeframe: SERIES_TIMEFRAME,
      },
      () => compareOracle(bandwidth, lte, window("min", 60, bandwidth)),
      5,
    );

    /**
     * The property the absolute threshold cannot have: a rolling minimum is
     * true only where the value actually is the lowest of its window, so the
     * condition is selective by construction rather than by a tuned constant.
     *
     * Without a bound here the test would also pass if the window returned the
     * current value itself — `x <= x` on every candle — which is exactly what a
     * window that ignored its span would do.
     */
    it("is selective by construction rather than by a tuned constant", () => {
      const conditions: Condition = {
        kind: "compare",
        left: bandwidth,
        op: "lte",
        right: window("min", 60, bandwidth),
        timeframe: SERIES_TIMEFRAME,
      };
      const { fired, compared } = walkSeries(
        ruleWith(conditions),
        compareOracle(bandwidth, lte, window("min", 60, bandwidth)),
      );

      expect(fired).toBeGreaterThan(0);
      expect(fired).toBeLessThan(compared / 4);
    });

    /**
     * A rule whose only indicator sits *inside* a window — "the close is below
     * the lowest lower band of the last 60 closes".
     *
     * This is the shape that fails silently. `collectIndicators` has to look
     * through the wrapper; if it does not, no series is computed, the evaluator
     * finds no value, and every candle comes back indeterminate. Nothing on
     * that path raises anything — the alert just never fires.
     *
     * The indicator has to be *only* inside the window for this to bite. With a
     * bare indicator on the other side the series is requested anyway and the
     * window reads it for free, which is how the first version of this test
     * passed while the wrapper was not opened at all.
     */
    it("requests the series of an indicator that appears only inside a window", () => {
      const lowest = window("min", 60, indicator("bollinger", BB, "lower"));
      const rule = ruleWith({
        kind: "compare",
        left: price("close"),
        op: "lte",
        right: lowest,
        timeframe: SERIES_TIMEFRAME,
      });

      const requests = collectIndicators(rule);
      expect(requests).toHaveLength(1);
      expect(requests[0].indicator.output).toBe("lower");

      // And it actually evaluates, rather than staying indeterminate for ever.
      const { disagreements, compared } = walkSeries(
        rule,
        compareOracle(price("close"), lte, lowest),
      );
      expect(disagreements).toEqual([]);
      expect(compared).toBeGreaterThan(100);
    });
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
