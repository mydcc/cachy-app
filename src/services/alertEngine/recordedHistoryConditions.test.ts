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
 * FEAT-0438 — every indicator condition, proved against recorded market data.
 *
 * ## Why this exists next to `indicatorConditions.integration.test.ts`
 *
 * That file proves the evaluator and an independent oracle agree, over a seeded
 * pseudo-random walk. This one asks a different question of a different series:
 * on 1000 recorded hourly BTCUSDT candles, does each condition flip at the
 * *exact* candle it should?
 *
 * ## What the oracle does and does not re-derive
 *
 * The obvious way to write "assert the exact candle index" is to run the
 * evaluator, copy the indices it produced, and assert them. That is a snapshot:
 * it proves the evaluator still does what it did, and if it fires one candle
 * late then firing one candle late becomes the specification.
 *
 * So the literals in `EXPECTATIONS` are pinned against an **oracle** that
 * re-derives the *condition* — the `compare` and `cross` decisions and the
 * windowed min/max — as plain `Decimal` arithmetic in this file, independently
 * of the Rust evaluator. Three things must coincide for a green run:
 *
 * 1. the oracle's flips equal the literals;
 * 2. the evaluator's flips equal the literals;
 * 3. the evaluator and the oracle agree at every candle, not only at flips.
 *
 * A fixture swap breaks (1). An evaluator regression breaks (2) and (3). An
 * oracle that drifts toward the implementation breaks (1) while (2) still
 * passes, which is the failure the literals exist to catch.
 *
 * What the oracle deliberately does **not** re-derive is the indicator series
 * underneath: it reads the normative `computeIndicatorSeries`, the same
 * function that decides production firing (`indicatorSeries.ts`, "One
 * normative path"). A second RSI/MACD implementation here would itself need
 * verifying and would test a path the application never takes; that layer is
 * covered by `crossPathParity.test.ts` (JS ↔ WASM) and the indicator unit
 * tests. This suite therefore proves the condition semantics — that the
 * evaluator flips exactly where the oracle's own `Decimal` arithmetic says it
 * must — not the indicator math beneath it.
 *
 * ## Warmup
 *
 * Nothing is asserted before the deepest indicator's `needs × 3` candles, taken
 * from the shared `INDICATOR_WARMUP` table rather than a constant per test.
 * Windowed operands are not part of that factor: their lookback is consumed by
 * null-propagation (no aggregate before the window is full), so the assertion
 * simply starts later. Below the warmup, seeding drift and a genuine cross are
 * indistinguishable — the failure BUG-0430 describes — so an assertion there is
 * noise wearing a green tick.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

import { Decimal } from "decimal.js";

import { collectIndicators } from "../../lib/rules/indicatorRequests";
import { computeIndicatorSeries } from "../../lib/rules/indicatorSeries";
import { ruleSchema } from "../../lib/rules/ruleSchema";
import type {
  Condition,
  DecimalString,
  EvaluationContext,
  EvaluationIndicatorSeries,
  Operand,
  RuleDocument,
  Verdict,
} from "../../lib/rules/types";
import {
  RECORDED_CANDLES,
  RECORDED_SERIES_META,
  RECORDED_STEP_MS,
  RECORDED_TIMEFRAME,
} from "../__fixtures__/recordedSeries";
import { assertableFrom } from "./indicatorWarmup";

const WASM_JS = pathToFileURL(resolve(process.cwd(), "static/wasm/technicals_wasm.js")).href;
const WASM_BINARY = resolve(process.cwd(), "static/wasm/technicals_wasm_bg.wasm");

const TF = RECORDED_TIMEFRAME;

interface RuleCore {
  rule_from_alert_json(alertJson: string, timeframe: string, createdAtMs: number): string;
  rule_indicator_registry(): string;
}

let template: RuleDocument;
let core: RuleCore;

beforeAll(async () => {
  const mod = (await import(/* @vite-ignore */ WASM_JS)) as {
    default: (binary: BufferSource) => Promise<unknown>;
  } & RuleCore;
  await mod.default(readFileSync(WASM_BINARY));
  core = mod;

  ruleSchema.setLoader(async () => mod as never);
  await ruleSchema.load();

  const alert = {
    id: "recorded",
    symbol: RECORDED_SERIES_META.symbol,
    condition: { price_reached: "50000.0" },
    active: true,
  };
  template = JSON.parse(
    mod.rule_from_alert_json(JSON.stringify(alert), TF, RECORDED_CANDLES[0].open_time_ms),
  );
});

// ---------------------------------------------------------------------------
// Operand and condition builders
// ---------------------------------------------------------------------------

const indicator = (id: string, params: Record<string, number>, output?: string): Operand => ({
  kind: "indicator",
  indicator: { id, params, ...(output ? { output } : {}) },
});
const constant = (value: string): Operand => ({ kind: "constant", value });
const closePrice: Operand = { kind: "price", field: "close" };
const volumeOperand: Operand = { kind: "volume" };
const windowOf = (agg: "min" | "max", lookback: number, of: Operand): Operand => ({
  kind: "window",
  of,
  agg,
  lookback,
});

const compare = (left: Operand, op: string, right: Operand): Condition =>
  ({ kind: "compare", left, op, right, timeframe: TF }) as Condition;
const cross = (left: Operand, direction: "above" | "below", right: Operand): Condition =>
  ({ kind: "cross", left, direction, right, timeframe: TF }) as Condition;

// ---------------------------------------------------------------------------
// The oracle: plain array indexing over the recorded series
// ---------------------------------------------------------------------------

const seriesCache = new Map<string, (DecimalString | null)[]>();

/**
 * The decimal string series behind an operand, index-aligned to the candles.
 *
 * Everything here stays in `Decimal`/decimal-string form rather than `number`:
 * the evaluator compares `Decimal`s (`indicatorSeries.ts`, "Precision"), and an
 * oracle comparing `f64`s would be a different function exactly at the
 * `gte`/`lte` boundaries these conditions assert on. Same values, same radix,
 * same answer.
 */
function seriesFor(operand: Operand): (DecimalString | null)[] {
  const cacheKey = JSON.stringify(operand);
  const hit = seriesCache.get(cacheKey);
  if (hit) return hit;

  let values: (DecimalString | null)[];
  if (operand.kind === "constant") {
    values = RECORDED_CANDLES.map(() => operand.value);
  } else if (operand.kind === "price") {
    values = RECORDED_CANDLES.map((c) => c[operand.field as "close"]);
  } else if (operand.kind === "volume") {
    values = RECORDED_CANDLES.map((c) => c.volume);
  } else if (operand.kind === "window") {
    // Rolled here in JavaScript while the evaluator rolls it in Rust. A span
    // reaching before the series, or over a missing value, has no aggregate at
    // all: the minimum of part of a window is not the minimum of the window,
    // and on a data gap that difference fires a squeeze alert.
    const base = seriesFor(operand.of);
    const { agg, lookback } = operand;
    values = base.map((_, i) => {
      if (i + 1 < lookback) return null;
      const span = base.slice(i - lookback + 1, i + 1);
      if (span.some((v) => v === null)) return null;
      let extreme = span[0] as DecimalString;
      let extremeValue = new Decimal(extreme);
      for (let k = 1; k < span.length; k++) {
        const candidate = span[k] as DecimalString;
        const candidateValue = new Decimal(candidate);
        const better =
          agg === "min" ? candidateValue.lt(extremeValue) : candidateValue.gt(extremeValue);
        if (better) {
          extreme = candidate;
          extremeValue = candidateValue;
        }
      }
      return extreme;
    });
  } else if (operand.kind === "indicator") {
    // The normative series, shared with the evaluator on purpose — see "What
    // the oracle does and does not re-derive" above. `values` are already the
    // decimal strings the evaluator receives.
    const result = computeIndicatorSeries(
      { indicator: operand.indicator, timeframe: TF },
      RECORDED_CANDLES,
    );
    if (!result.supported) throw new Error(result.reason);
    values = result.values;
  } else {
    throw new Error(`seriesFor: no series for ${(operand as { kind: string }).kind}`);
  }

  seriesCache.set(cacheKey, values);
  return values;
}

type Oracle = (index: number) => boolean | null;

const OPS: Record<string, (a: Decimal, b: Decimal) => boolean> = {
  gt: (a, b) => a.gt(b),
  gte: (a, b) => a.gte(b),
  lt: (a, b) => a.lt(b),
  lte: (a, b) => a.lte(b),
};

function oracleFor(condition: Condition): Oracle {
  const c = condition as unknown as {
    kind: string;
    left: Operand;
    right: Operand;
    op?: string;
    direction?: "above" | "below";
  };

  const l = seriesFor(c.left);
  const r = seriesFor(c.right);

  if (c.kind === "compare") {
    const op = OPS[c.op as string];
    if (!op) throw new Error(`oracleFor: unknown op ${c.op}`);
    return (i) => {
      const left = l[i];
      const right = r[i];
      if (left === null || right === null) return null;
      return op(new Decimal(left), new Decimal(right));
    };
  }

  if (c.kind === "cross") {
    const above = c.direction === "above";
    return (i) => {
      if (i === 0) return null;
      const pl = l[i - 1];
      const pr = r[i - 1];
      const cl = l[i];
      const cr = r[i];
      if (pl === null || pr === null || cl === null || cr === null) return null;
      const prevLeft = new Decimal(pl);
      const prevRight = new Decimal(pr);
      const curLeft = new Decimal(cl);
      const curRight = new Decimal(cr);
      return above
        ? prevLeft.lte(prevRight) && curLeft.gt(curRight)
        : prevLeft.gte(prevRight) && curLeft.lt(curRight);
    };
  }

  throw new Error(`oracleFor: unsupported condition kind ${c.kind}`);
}

// ---------------------------------------------------------------------------
// Walking the series
// ---------------------------------------------------------------------------

function ruleWith(conditions: Condition): RuleDocument {
  return { ...template, name: "recorded history", conditions };
}

/** The context the live loop would hold at candle `index`. */
function contextAt(rule: RuleDocument, index: number): EvaluationContext {
  const candles = RECORDED_CANDLES.slice(0, index + 1);
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
    ? { candles: { [TF]: candles }, indicators }
    : { candles: { [TF]: candles } };
}

/** Indices where a boolean series changes value, ignoring leading `null`s. */
function flipsOf(at: (i: number) => boolean | null, from: number): number[] {
  const flips: number[] = [];
  let previous: boolean | null = null;
  for (let i = from; i < RECORDED_CANDLES.length; i++) {
    const value = at(i);
    if (value === null) continue;
    if (previous !== null && value !== previous) flips.push(i);
    previous = value;
  }
  return flips;
}

interface Walk {
  oracleFlips: number[];
  evaluatorFlips: number[];
  disagreements: string[];
  trueCandles: number;
  falseCandles: number;
}

function walk(condition: Condition, from: number): Walk {
  const rule = ruleWith(condition);
  const oracle = oracleFor(condition);

  const evaluated: (boolean | null)[] = [];
  const disagreements: string[] = [];
  let trueCandles = 0;
  let falseCandles = 0;

  for (let i = 0; i < RECORDED_CANDLES.length; i++) {
    if (i < from) {
      evaluated.push(null);
      continue;
    }
    const verdict = ruleSchema.evaluate(rule, contextAt(rule, i)) as Verdict | undefined;
    const value =
      verdict === undefined || verdict.verdict === "indeterminate"
        ? null
        : verdict.verdict === "fires";
    evaluated.push(value);

    const expected = oracle(i);
    if (value !== null && expected !== null) {
      if (value) trueCandles++;
      else falseCandles++;
      if (value !== expected) {
        disagreements.push(
          `candle ${i} (close ${RECORDED_CANDLES[i].close}): evaluator ${value}, oracle ${expected}`,
        );
      }
    }
  }

  return {
    oracleFlips: flipsOf(oracle, from),
    evaluatorFlips: flipsOf((i) => evaluated[i], from),
    disagreements,
    trueCandles,
    falseCandles,
  };
}

// ---------------------------------------------------------------------------
// The conditions, and where each one flips in this fixture
// ---------------------------------------------------------------------------

const RSI14 = indicator("rsi", { period: 14 });
const MACD_PARAMS = { fast_period: 12, slow_period: 26, signal_period: 9 };
const MACD_LINE = indicator("macd", MACD_PARAMS, "macd");
const MACD_SIGNAL = indicator("macd", MACD_PARAMS, "signal");
const MACD_HIST = indicator("macd", MACD_PARAMS, "histogram");
const BB_PARAMS = { period: 20, std_dev: 2 };
const BB_UPPER = indicator("bollinger", BB_PARAMS, "upper");
const BB_LOWER = indicator("bollinger", BB_PARAMS, "lower");
const BB_BANDWIDTH = indicator("bollinger", BB_PARAMS, "bandwidth");
const VOLUME_MA20 = indicator("volume_ma", { period: 20 });
const SMA50 = indicator("sma", { period: 50 });
const SMA200 = indicator("sma", { period: 200 });

interface Expectation {
  name: string;
  condition: Condition;
  /** Candle indices where the condition changes value. Pinned by the oracle. */
  flips: number[];
}

const EXPECTATIONS: Expectation[] = [
  {
    name: "RSI(14) above the overbought threshold",
    condition: compare(RSI14, "gt", constant("70")),
    flips: [
      127, 128, 176, 178, 359, 362, 370, 377, 378, 379, 417, 462, 472, 474, 549, 550, 552, 553,
      680, 681, 683, 684, 776, 785, 786, 787, 968, 969
    ],
  },
  {
    name: "RSI(14) below the oversold threshold",
    condition: compare(RSI14, "lt", constant("30")),
    flips: [
      203, 206, 229, 230, 292, 293, 296, 298, 635, 641, 943, 944, 954, 955
    ],
  },
  {
    name: "RSI(14) crossing back above oversold",
    condition: cross(RSI14, "above", constant("30")),
    flips: [
      206, 207, 230, 231, 293, 294, 298, 299, 641, 642, 944, 945, 955, 956
    ],
  },
  {
    name: "MACD line crossing above its signal (golden cross)",
    condition: cross(MACD_LINE, "above", MACD_SIGNAL),
    flips: [
      123, 124, 156, 157, 174, 175, 193, 194, 214, 215, 235, 236, 261, 262, 282, 283, 299, 300,
      346, 347, 357, 358, 394, 395, 415, 416, 435, 436, 452, 453, 510, 511, 533, 534, 547, 548,
      577, 578, 590, 591, 648, 649, 699, 700, 705, 706, 720, 721, 742, 743, 753, 754, 818, 819,
      845, 846, 855, 856, 883, 884, 898, 899, 936, 937, 958, 959, 987, 988
    ],
  },
  {
    name: "MACD line crossing below its signal (death cross)",
    condition: cross(MACD_LINE, "below", MACD_SIGNAL),
    flips: [
      138, 139, 157, 158, 186, 187, 196, 197, 226, 227, 250, 251, 274, 275, 287, 288, 336, 337,
      352, 353, 381, 382, 400, 401, 433, 434, 445, 446, 465, 466, 526, 527, 546, 547, 555, 556,
      579, 580, 621, 622, 689, 690, 704, 705, 716, 717, 722, 723, 748, 749, 789, 790, 842, 843,
      848, 849, 862, 863, 886, 887, 922, 923, 939, 940, 974, 975, 997, 998
    ],
  },
  {
    name: "MACD histogram turning positive (sign change)",
    condition: compare(MACD_HIST, "gt", constant("0")),
    flips: [
      123, 138, 156, 157, 174, 186, 193, 196, 214, 226, 235, 250, 261, 274, 282, 287, 299, 336,
      346, 352, 357, 381, 394, 400, 415, 433, 435, 445, 452, 465, 510, 526, 533, 546, 547, 555,
      577, 579, 590, 621, 648, 689, 699, 704, 705, 716, 720, 722, 742, 748, 753, 789, 818, 842,
      845, 848, 855, 862, 883, 886, 898, 922, 936, 939, 958, 974, 987, 997
    ],
  },
  {
    name: "MACD signal crossing zero (DEA zero crossing)",
    condition: cross(MACD_SIGNAL, "above", constant("0")),
    flips: [
      127, 128, 178, 179, 329, 330, 348, 349, 358, 359, 517, 518, 603, 604, 675, 676, 708, 709,
      770, 771, 835, 836, 857, 858, 916, 917, 972, 973
    ],
  },
  {
    name: "price touching the upper Bollinger band",
    condition: compare(closePrice, "gte", BB_UPPER),
    flips: [
      61, 62, 83, 87, 124, 128, 153, 154, 176, 178, 222, 223, 244, 247, 347, 348, 357, 360, 361,
      362, 370, 371, 372, 374, 393, 396, 415, 421, 436, 438, 452, 453, 455, 457, 458, 460, 534,
      536, 537, 538, 549, 550, 603, 605, 609, 611, 657, 658, 659, 663, 679, 684, 765, 766, 775,
      780, 826, 829, 858, 859, 911, 912, 915, 916, 967, 970, 993, 994
    ],
  },
  {
    name: "price touching the lower Bollinger band",
    condition: compare(closePrice, "lte", BB_LOWER),
    flips: [
      103, 104, 164, 168, 200, 206, 225, 228, 229, 230, 249, 250, 275, 277, 289, 291, 292, 293,
      340, 341, 352, 353, 503, 507, 585, 586, 628, 629, 634, 638, 723, 725, 732, 734, 749, 750,
      799, 802, 849, 850, 866, 867, 874, 875, 887, 890, 896, 897, 926, 927, 943, 945, 997, 999
    ],
  },
  {
    name: "Bollinger squeeze — bandwidth at its 60-candle minimum",
    condition: compare(BB_BANDWIDTH, "lte", windowOf("min", 60, BB_BANDWIDTH)),
    flips: [
      79, 81, 143, 145, 146, 149, 151, 154, 160, 162, 308, 309, 316, 320, 321, 322, 323, 326,
      335, 340, 477, 480, 482, 483, 493, 496, 497, 502, 653, 657, 676, 679, 764, 765, 771, 774,
      797, 799, 818, 819, 820, 825, 989, 994, 996, 997
    ],
  },
  {
    name: "volume anomaly — volume above its 20-candle average",
    condition: compare(volumeOperand, "gt", VOLUME_MA20),
    flips: [
      61, 62, 63, 64, 66, 67, 69, 70, 79, 84, 87, 88, 100, 101, 103, 107, 123, 125, 126, 130,
      132, 133, 134, 135, 153, 156, 161, 162, 164, 167, 169, 170, 171, 172, 173, 174, 176, 180,
      183, 190, 196, 197, 199, 206, 220, 221, 223, 228, 229, 230, 231, 232, 244, 251, 264, 265,
      269, 277, 289, 293, 295, 300, 315, 317, 319, 320, 321, 322, 337, 338, 340, 341, 345, 346,
      347, 360, 361, 374, 384, 388, 390, 391, 392, 395, 411, 413, 415, 421, 423, 425, 435, 436,
      439, 444, 451, 454, 458, 463, 464, 465, 480, 481, 484, 486, 502, 508, 509, 511, 512, 514,
      520, 521, 523, 526, 527, 529, 531, 532, 533, 541, 549, 551, 559, 562, 568, 569, 580, 581,
      583, 589, 594, 595, 603, 607, 608, 614, 620, 622, 629, 630, 632, 636, 657, 660, 661, 663,
      671, 673, 679, 686, 687, 692, 699, 701, 703, 709, 723, 724, 725, 726, 728, 735, 736, 737,
      747, 750, 752, 757, 768, 769, 773, 774, 775, 780, 782, 783, 784, 786, 799, 803, 825, 826,
      827, 829, 830, 831, 833, 834, 842, 843, 849, 852, 853, 854, 855, 856, 857, 863, 866, 867,
      872, 875, 883, 884, 885, 900, 911, 913, 915, 924, 929, 930, 942, 948, 954, 955, 966, 972,
      973, 974, 993, 995, 996
    ],
  },
  {
    name: "moving-average golden cross — SMA(50) above SMA(200)",
    condition: cross(SMA50, "above", SMA200),
    flips: [
      791, 792
    ],
  },
];

/** Every indicator id the expectations read, derived from the conditions. */
function coveredIndicators(): Set<string> {
  return new Set(
    EXPECTATIONS.flatMap((e) =>
      collectIndicators(ruleWith(e.condition)).map((r) => r.indicator.id),
    ),
  );
}

// ---------------------------------------------------------------------------

describe("indicator conditions against recorded market history", () => {
  it("carries the provenance the fixture is only usable with", () => {
    expect(RECORDED_SERIES_META.symbol).toBe("BTCUSDT");
    expect(RECORDED_SERIES_META.timeframe).toBe("1h");
    expect(RECORDED_SERIES_META.captured_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(RECORDED_CANDLES).toHaveLength(1000);
  });

  it("is contiguous on the hour, so an asserted index means one hour of market", () => {
    const gaps: string[] = [];
    for (let i = 1; i < RECORDED_CANDLES.length; i++) {
      const step = RECORDED_CANDLES[i].open_time_ms - RECORDED_CANDLES[i - 1].open_time_ms;
      if (step !== RECORDED_STEP_MS) gaps.push(`index ${i}: ${step}ms`);
    }
    expect(gaps).toEqual([]);
  });

  for (const expectation of EXPECTATIONS) {
    describe(expectation.name, () => {
      // Derived from the condition itself rather than hand-listed beside it: a
      // condition whose operand changes cannot silently keep a stale warmup.
      const reads = collectIndicators(ruleWith(expectation.condition)).map((r) => r.indicator);
      const from = assertableFrom(reads);

      // Memoised, not recomputed per test. Walking 1000 candles means slicing
      // the series and re-evaluating at each one; doing that three times over
      // for three assertions about the same walk triples a suite that is
      // already the slowest in the file.
      let walked: Walk | undefined;
      const result = () => (walked ??= walk(expectation.condition, from));

      it("flips at exactly the expected candles, by oracle and by evaluator", () => {
        const { oracleFlips, evaluatorFlips } = result();

        if (process.env.PRINT_FLIPS) {
          console.log(`FLIPS ${expectation.name} :: ${JSON.stringify(oracleFlips)}`);
        }

        // The oracle first: this is what pins the literals to an independent
        // computation rather than to the evaluator's own output.
        expect(oracleFlips).toEqual(expectation.flips);
        expect(evaluatorFlips).toEqual(expectation.flips);
      });

      it("agrees with the oracle at every candle, not only at the flips", () => {
        expect(result().disagreements).toEqual([]);
      });

      it("is both true and false somewhere in the fixture", () => {
        const { trueCandles, falseCandles } = result();
        expect(trueCandles).toBeGreaterThan(0);
        expect(falseCandles).toBeGreaterThan(0);
      });
    });
  }

  /**
   * Indicators the core accepts and the panel offers, which FEAT-0028 shipped
   * no condition for — so this suite has nothing to prove about them.
   *
   * They are listed rather than filtered out, because the difference between
   * "not covered yet" and "nobody noticed" is whether it is written down. Each
   * one is reachable from the Indicators tab today: a trader can arm an ADX
   * alert, and no test says it fires on the right candle. FEAT-0446 owns
   * closing this list.
   */
  const SCOPED_OUT: Record<string, string> = {
    ema: "FEAT-0028 shipped MA crosses on SMA; EMA is the same shape, untested here",
    wma: "no condition shipped",
    vwma: "no condition shipped",
    hma: "no condition shipped",
    stochastic: "no condition shipped",
    stoch_rsi: "no condition shipped",
    williams_r: "no condition shipped",
    cci: "no condition shipped",
    adx: "no condition shipped",
    ao: "no condition shipped",
    momentum: "no condition shipped",
    atr: "no condition shipped",
    choppiness: "no condition shipped",
    super_trend: "no condition shipped",
    mfi: "no condition shipped",
    obv: "no condition shipped",
    parabolic_sar: "flips side rather than crossing; needs its own condition shape",
    ichimoku: "five lines and a forward displacement; needs its own expectations",
  };

  it("accounts for every indicator the core accepts", () => {
    const registry = JSON.parse(core.rule_indicator_registry()) as
      | Array<{ id: string }>
      | { indicators: Array<{ id: string }> };
    const ids = (Array.isArray(registry) ? registry : registry.indicators).map((e) => e.id);

    const covered = coveredIndicators();
    const unaccounted = ids.filter((id) => !covered.has(id) && !(id in SCOPED_OUT));

    // The teeth of acceptance criterion 5. An indicator added to the core lands
    // in neither set and fails here, so the choice to ship it without a
    // recorded-history expectation has to be made deliberately — by writing one
    // or by naming it above — rather than by nobody looking.
    //
    // This is indicator coverage, not condition coverage: the core exposes no
    // condition registry, so a new *condition* on an already-covered indicator
    // (say a second RSI threshold) is invisible here. That stays a FEAT-0028
    // review responsibility, and is noted rather than pretended away.
    expect(unaccounted).toEqual([]);
  });

  it("does not carry a scoped-out entry for an indicator that is covered", () => {
    const covered = coveredIndicators();
    const stale = Object.keys(SCOPED_OUT).filter((id) => covered.has(id));

    // The other direction: a list of known gaps that outlives the gap is worse
    // than no list, because it reads as coverage that is missing when it is not.
    expect(stale).toEqual([]);
  });
});
