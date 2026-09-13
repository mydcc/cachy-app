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

import { collectIndicators, type IndicatorRequest } from "../../lib/rules/indicatorRequests";
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
import { crossedLikeTheCore } from "../__fixtures__/crossedLikeTheCore";
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
      // The core's convention, not TradingView's: see `crossedLikeTheCore`.
      return crossedLikeTheCore(
        new Decimal(pl).comparedTo(pr),
        new Decimal(cl).comparedTo(cr),
        above ? "above" : "below",
      );
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

const fullSeriesCache = new Map<string, (DecimalString | null)[]>();

/** One requested series over the whole fixture, computed once. */
function fullSeries(request: IndicatorRequest): (DecimalString | null)[] {
  const key = JSON.stringify(request);
  const hit = fullSeriesCache.get(key);
  if (hit) return hit;
  const series = computeIndicatorSeries(request, RECORDED_CANDLES);
  if (!series.supported) throw new Error(series.reason);
  fullSeriesCache.set(key, series.values);
  return series.values;
}

/**
 * The context the live loop would hold at candle `index`.
 *
 * The indicator values are a slice of the series computed once over the whole
 * fixture, not a fresh computation over the first `index + 1` candles. The two
 * are the same thing exactly when `computeIndicatorSeries` is causal — a value
 * at `i` depends on nothing after `i` — and "computes every indicator it reads
 * causally" below asserts that rather than assuming it. Recomputing per candle
 * made the suite quadratic: sixteen conditions ran past the per-test timeout
 * under CI parallelism (FEAT-0446, "Decided: runtime").
 *
 * And only the last `CONTEXT_TAIL` candles of it. Every candle up to `index`
 * crossed into the core as JSON on every evaluation, which was quadratic too:
 * with 30 conditions the suite took 169 s on its own and timed out under
 * parallel load. The core reads a condition relative to the last close, so the
 * tail carries everything a verdict can depend on — which "reaches the same
 * verdict from the last candles as from the whole history" below asserts.
 */
function contextAt(rule: RuleDocument, index: number, tail = CONTEXT_TAIL): EvaluationContext {
  const start = Math.max(0, index + 1 - tail);
  const candles = RECORDED_CANDLES.slice(start, index + 1);
  const indicators: EvaluationIndicatorSeries[] = collectIndicators(rule).map((request) => ({
    indicator: request.indicator,
    timeframe: request.timeframe,
    values: fullSeries(request).slice(start, index + 1),
  }));
  return indicators.length > 0
    ? { candles: { [TF]: candles }, indicators }
    : { candles: { [TF]: candles } };
}

/**
 * How many closed candles the walk hands the core. Twice the longest lookback
 * an expectation reads (the squeeze's 60-candle window), plus room for the
 * previous close a cross compares against.
 */
const CONTEXT_TAIL = 128;

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
const SMA20 = indicator("sma", { period: 20 });
const SMA50 = indicator("sma", { period: 50 });
const SMA200 = indicator("sma", { period: 200 });
const EMA20 = indicator("ema", { period: 20 });
const WMA20 = indicator("wma", { period: 20 });
const VWMA20 = indicator("vwma", { period: 20 });
const HMA20 = indicator("hma", { period: 20 });
const MOMENTUM10 = indicator("momentum", { period: 10 });
const WILLIAMS_R14 = indicator("williams_r", { period: 14 });
const CCI20 = indicator("cci", { period: 20 });
const ATR14 = indicator("atr", { period: 14 });
const CHOP14 = indicator("choppiness", { period: 14 });
const MFI14 = indicator("mfi", { period: 14 });
const AO = indicator("ao", { fast_period: 5, slow_period: 34 });
const STOCH_PARAMS = { k_period: 14, k_smoothing: 3, d_period: 3 };
const STOCH_K = indicator("stochastic", STOCH_PARAMS, "k");
const STOCH_D = indicator("stochastic", STOCH_PARAMS, "d");
const STOCH_RSI_K = indicator("stoch_rsi", { rsi_period: 14, stoch_period: 14, k_period: 3, d_period: 3 }, "k");
const ADX14 = indicator("adx", { period: 14 }, "adx");
const PLUS_DI14 = indicator("adx", { period: 14 }, "plus_di");
const MINUS_DI14 = indicator("adx", { period: 14 }, "minus_di");
const SUPER_TREND = indicator("super_trend", { period: 10, factor: 3 }, "value");
const ICHIMOKU_PARAMS = { conversion_period: 9, base_period: 26, span_b_period: 52 };
const ICHIMOKU_CONVERSION = indicator("ichimoku", ICHIMOKU_PARAMS, "conversion");
const ICHIMOKU_BASE = indicator("ichimoku", ICHIMOKU_PARAMS, "base");
const ICHIMOKU_SPAN_B = indicator("ichimoku", ICHIMOKU_PARAMS, "span_b");

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
  // FEAT-0446 — the moving averages the alert path already computes and the
  // panel already offers, which FEAT-0028 shipped no condition for.
  {
    name: "price crossing above EMA(20)",
    condition: cross(closePrice, "above", EMA20),
    flips: [
      79, 80, 95, 96, 105, 106, 123, 124, 173, 174, 188, 189, 192, 193, 198, 199, 220, 221,
      238, 239, 240, 241, 242, 243, 244, 245, 262, 263, 271, 272, 281, 282, 283, 284, 299, 300,
      306, 307, 317, 318, 319, 320, 322, 323, 344, 345, 356, 357, 411, 412, 481, 482, 491, 492,
      499, 500, 510, 511, 525, 526, 529, 530, 532, 533, 562, 563, 573, 574, 576, 577, 592, 593,
      625, 626, 657, 658, 659, 660, 677, 678, 698, 699, 705, 706, 718, 719, 744, 745, 754, 755,
      756, 757, 762, 763, 764, 765, 823, 824, 825, 826, 832, 833, 844, 845, 853, 854, 883, 884,
      898, 899, 907, 908, 911, 912, 936, 937, 960, 961, 963, 964, 967, 968, 987, 988, 990, 991,
      992, 993
    ],
  },
  {
    name: "price crossing below WMA(20)",
    condition: cross(closePrice, "below", WMA20),
    flips: [
      67, 68, 74, 75, 92, 93, 100, 101, 106, 107, 108, 109, 133, 134, 160, 161, 185, 186,
      189, 190, 196, 197, 199, 200, 225, 226, 241, 242, 248, 249, 269, 270, 274, 275, 282, 283,
      285, 286, 301, 302, 303, 304, 305, 306, 315, 316, 318, 319, 321, 322, 325, 326, 330, 331,
      335, 336, 351, 352, 381, 382, 386, 387, 388, 389, 391, 392, 403, 404, 470, 471, 480, 481,
      496, 497, 501, 502, 524, 525, 526, 527, 530, 531, 554, 555, 556, 557, 575, 576, 579, 580,
      621, 622, 653, 654, 674, 675, 687, 688, 703, 704, 713, 714, 716, 717, 722, 723, 747, 748,
      753, 754, 761, 762, 763, 764, 790, 791, 793, 794, 799, 800, 822, 823, 824, 825, 830, 831,
      839, 840, 841, 842, 848, 849, 860, 861, 879, 880, 885, 886, 900, 901, 906, 907, 917, 918,
      921, 922, 938, 939, 964, 965, 972, 973, 996, 997
    ],
  },
  {
    name: "volume-weighted average above the plain one — VWMA(20) over SMA(20)",
    condition: compare(VWMA20, "gt", SMA20),
    flips: [
      71, 77, 95, 102, 104, 113, 147, 153, 173, 176, 188, 215, 222, 223, 225, 242, 243, 246,
      250, 251, 267, 270, 275, 342, 353, 357, 379, 391, 392, 393, 402, 405, 414, 415, 432, 437,
      479, 486, 499, 524, 569, 580, 581, 604, 633, 644, 656, 658, 674, 679, 699, 710, 713, 745,
      748, 775, 794, 796, 799, 822, 823, 824, 847, 858, 874, 875, 878, 916, 926, 927, 942, 963,
      964, 967, 991
    ],
  },
  {
    name: "price crossing below HMA(20)",
    condition: cross(closePrice, "below", HMA20),
    flips: [
      70, 71, 73, 74, 88, 89, 100, 101, 109, 110, 118, 119, 129, 130, 146, 147, 157, 158,
      180, 181, 190, 191, 196, 197, 217, 218, 224, 225, 241, 242, 243, 244, 248, 249, 267, 268,
      274, 275, 286, 287, 295, 296, 305, 306, 312, 313, 321, 322, 325, 326, 330, 331, 335, 336,
      350, 351, 363, 364, 366, 367, 376, 377, 386, 387, 388, 389, 392, 393, 398, 399, 425, 426,
      440, 441, 444, 445, 462, 463, 475, 476, 480, 481, 496, 497, 501, 502, 516, 517, 521, 522,
      523, 524, 531, 532, 539, 540, 554, 555, 567, 568, 570, 571, 578, 579, 597, 598, 606, 607,
      613, 614, 621, 622, 634, 635, 649, 650, 655, 656, 663, 664, 674, 675, 685, 686, 703, 704,
      713, 714, 722, 723, 731, 732, 736, 737, 740, 741, 747, 748, 760, 761, 770, 771, 772, 773,
      783, 784, 799, 800, 815, 816, 821, 822, 824, 825, 830, 831, 839, 840, 841, 842, 848, 849,
      860, 861, 873, 874, 881, 882, 885, 886, 896, 897, 901, 902, 906, 907, 910, 911, 916, 917,
      920, 921, 938, 939, 953, 954, 964, 965, 970, 971, 991, 992, 994, 995
    ],
  },
  // FEAT-0446 group 1 — wired into the alert path in the same change.
  {
    name: "momentum turning positive — Momentum(10) crossing above zero",
    condition: cross(MOMENTUM10, "above", constant("0")),
    flips: [
      44, 45, 47, 48, 50, 51, 52, 53, 57, 58, 68, 69, 72, 73, 76, 77, 80, 81,
      96, 97, 102, 103, 105, 106, 123, 124, 141, 142, 153, 154, 174, 175, 193, 194, 213, 214,
      218, 219, 236, 237, 242, 243, 259, 260, 284, 285, 299, 300, 302, 303, 317, 318, 320, 321,
      322, 323, 325, 326, 333, 334, 345, 346, 357, 358, 390, 391, 414, 415, 472, 473, 492, 493,
      499, 500, 510, 511, 525, 526, 529, 530, 534, 535, 546, 547, 576, 577, 581, 582, 590, 591,
      592, 593, 615, 616, 647, 648, 656, 657, 673, 674, 678, 679, 699, 700, 720, 721, 742, 743,
      757, 758, 795, 796, 797, 798, 809, 810, 814, 815, 818, 819, 821, 822, 840, 841, 843, 844,
      847, 848, 853, 854, 856, 857, 878, 879, 883, 884, 898, 899, 904, 905, 910, 911, 936, 937,
      939, 940, 960, 961, 974, 975, 983, 984, 986, 987
    ],
  },
  // FEAT-0446 group 2 — the high/low/close indicators, wired in the same change.
  {
    name: "Williams %R(14) overbought — above -20",
    condition: compare(WILLIAMS_R14, "gt", constant("-20")),
    flips: [
      44, 46, 57, 59, 61, 64, 65, 66, 69, 70, 81, 82, 83, 88, 96, 97, 99, 100,
      123, 128, 144, 146, 175, 180, 220, 223, 240, 241, 242, 247, 263, 264, 265, 266, 309, 310,
      311, 312, 326, 330, 346, 347, 357, 363, 365, 367, 368, 374, 375, 377, 378, 379, 394, 395,
      415, 418, 424, 430, 431, 432, 433, 440, 441, 449, 450, 453, 455, 460, 474, 475, 477, 480,
      510, 513, 515, 516, 520, 521, 534, 536, 537, 538, 547, 550, 552, 553, 594, 595, 596, 597,
      600, 601, 602, 604, 609, 610, 611, 613, 619, 620, 657, 658, 659, 663, 665, 668, 673, 674,
      679, 684, 701, 702, 705, 710, 712, 713, 720, 721, 745, 746, 762, 763, 765, 770, 774, 785,
      825, 827, 828, 829, 853, 854, 855, 859, 907, 910, 911, 912, 913, 916, 919, 920, 963, 964,
      967, 969, 990, 991, 992, 994
    ],
  },
  {
    name: "CCI(20) crossing above +100",
    condition: cross(CCI20, "above", constant("100")),
    flips: [
      61, 62, 69, 70, 79, 80, 81, 82, 96, 97, 98, 99, 124, 125, 153, 154, 176, 177,
      221, 222, 244, 245, 266, 267, 273, 274, 309, 310, 328, 329, 346, 347, 357, 358, 366, 367,
      369, 370, 378, 379, 393, 394, 415, 416, 435, 436, 442, 443, 451, 452, 473, 474, 478, 479,
      512, 513, 520, 521, 533, 534, 548, 549, 602, 603, 609, 610, 620, 621, 657, 658, 679, 680,
      707, 708, 720, 721, 765, 766, 769, 770, 774, 775, 826, 827, 836, 837, 838, 839, 858, 859,
      908, 909, 911, 912, 919, 920, 967, 968, 993, 994
    ],
  },
  {
    name: "volatility expansion — ATR(14) at its 50-candle high",
    condition: compare(ATR14, "gte", windowOf("max", 50, ATR14)),
    flips: [
      190, 191, 199, 204, 274, 276, 363, 364, 365, 367, 368, 371, 372, 374, 393, 394, 417, 421,
      423, 426, 435, 436, 437, 438, 440, 441, 442, 444, 452, 454, 458, 461, 462, 463, 464, 465,
      537, 540, 634, 636, 696, 697, 703, 707, 777, 780, 785, 786, 800, 803, 893, 894, 896, 899,
      901, 902, 918, 919, 920, 924, 968, 971
    ],
  },
  {
    name: "trending market — Choppiness(14) below 38.2",
    condition: compare(CHOP14, "lt", constant("38.2")),
    flips: [
      166, 171, 176, 184, 185, 186, 203, 209, 210, 213, 229, 230, 347, 355, 375, 378, 416, 431,
      435, 445, 452, 457, 458, 465, 604, 605, 628, 634, 635, 637, 646, 648, 683, 684, 733, 735,
      777, 791, 810, 813, 874, 875, 968, 972, 982, 984
    ],
  },
  {
    name: "MFI(14) overbought — above 80",
    condition: compare(MFI14, "gt", constant("80")),
    flips: [
      127, 128, 243, 247, 377, 380, 381, 382, 417, 430, 459, 460, 600, 601, 604, 605, 777, 779,
      782, 783, 784, 785, 827, 830, 968, 970
    ],
  },
  // FEAT-0446 group 3 — the indicators with several output lines, wired in the same change.
  {
    name: "Stochastic %K crossing above %D",
    condition: cross(STOCH_K, "above", STOCH_D),
    flips: [
      62, 63, 69, 70, 79, 80, 96, 97, 105, 106, 116, 117, 121, 122, 134, 135, 141, 142,
      151, 152, 167, 168, 189, 190, 193, 194, 206, 207, 212, 213, 230, 231, 235, 236, 244, 245,
      252, 253, 255, 256, 259, 260, 272, 273, 277, 278, 288, 289, 293, 294, 298, 299, 304, 305,
      318, 319, 322, 323, 334, 335, 339, 340, 343, 344, 354, 355, 366, 367, 369, 370, 378, 379,
      390, 391, 402, 403, 410, 411, 423, 424, 428, 429, 433, 434, 442, 443, 448, 449, 452, 453,
      456, 457, 472, 473, 477, 478, 487, 488, 492, 493, 499, 500, 506, 507, 517, 518, 519, 520,
      529, 530, 544, 545, 547, 548, 553, 554, 561, 562, 569, 570, 578, 579, 588, 589, 598, 599,
      600, 601, 602, 603, 609, 610, 617, 618, 626, 627, 629, 630, 633, 634, 635, 636, 641, 642,
      648, 649, 657, 658, 666, 667, 673, 674, 678, 679, 696, 697, 706, 707, 719, 720, 726, 727,
      734, 735, 742, 743, 751, 752, 764, 765, 774, 775, 782, 783, 796, 797, 803, 804, 813, 814,
      819, 820, 823, 824, 834, 835, 844, 845, 851, 852, 867, 868, 871, 872, 876, 877, 883, 884,
      890, 891, 897, 898, 904, 905, 913, 914, 915, 916, 919, 920, 924, 925, 930, 931, 944, 945,
      956, 957, 967, 968, 979, 980, 984, 985
    ],
  },
  {
    name: "Stoch RSI %K oversold — below 20",
    condition: compare(STOCH_RSI_K, "lt", constant("20")),
    flips: [
      102, 106, 110, 122, 139, 140, 160, 171, 187, 188, 201, 208, 227, 231, 250, 256, 276, 278,
      290, 298, 337, 343, 353, 356, 381, 393, 404, 411, 431, 435, 447, 451, 455, 456, 462, 473,
      481, 493, 503, 508, 526, 527, 528, 529, 556, 563, 566, 569, 584, 588, 623, 631, 632, 642,
      676, 678, 689, 697, 723, 736, 749, 752, 789, 797, 800, 804, 843, 844, 849, 851, 864, 872,
      873, 876, 889, 892, 922, 932, 942, 945, 974, 984, 997
    ],
  },
  {
    name: "strong trend — ADX(14) above 25",
    condition: compare(ADX14, "gt", constant("25")),
    flips: [
      86, 93, 97, 103, 181, 224, 226, 239, 295, 306, 362, 364, 365, 413, 415, 491, 549, 559,
      583, 594, 612, 613, 617, 627, 637, 663, 685, 700, 736, 760, 779, 813, 883, 884, 886, 912,
      915, 916, 928, 976
    ],
  },
  {
    name: "+DI(14) crossing above -DI(14)",
    condition: cross(PLUS_DI14, "above", MINUS_DI14),
    flips: [
      105, 106, 116, 117, 121, 122, 173, 174, 222, 223, 244, 245, 259, 260, 272, 273, 310, 311,
      328, 329, 346, 347, 356, 357, 410, 411, 491, 492, 510, 511, 530, 531, 533, 534, 594, 595,
      602, 603, 630, 631, 661, 662, 678, 679, 699, 700, 705, 706, 715, 716, 718, 719, 765, 766,
      774, 775, 827, 828, 832, 833, 858, 859, 861, 862, 864, 865, 911, 912, 967, 968, 975, 976,
      979, 980, 985, 986, 993, 994
    ],
  },
  {
    name: "SuperTrend turning down — price crossing below SuperTrend(10, 3)",
    condition: cross(closePrice, "below", SUPER_TREND),
    flips: [
      166, 167, 186, 187, 249, 250, 352, 353, 504, 505, 567, 568, 628, 629, 690, 691, 731, 732,
      799, 800, 866, 867, 926, 927
    ],
  },
  {
    name: "Ichimoku TK cross — conversion line crossing above the base line",
    // The two lines are midpoints of windows that often share their extremes,
    // so they tie on 44 candles: this is the condition that pins the core's
    // convention on a tie against recorded history (BUG-0464). Candle 228 is a
    // touch from below that falls back.
    condition: cross(ICHIMOKU_CONVERSION, "above", ICHIMOKU_BASE),
    flips: [
      113, 114, 126, 127, 176, 177, 196, 197, 228, 229, 245, 246, 274, 275, 286, 287, 313, 314,
      325, 326, 347, 348, 357, 358, 415, 416, 486, 487, 512, 513, 582, 583, 595, 596, 660, 661,
      705, 706, 759, 760, 825, 826, 858, 859, 906, 907, 967, 968, 998, 999
    ],
  },
  {
    // Reads span B where the chart draws it: 26 candles after its window.
    name: "price falling through the cloud's span B — close crossing below span B",
    condition: cross(closePrice, "below", ICHIMOKU_SPAN_B),
    flips: [
      580, 581, 582, 583, 595, 596, 634, 635, 684, 685, 702, 703, 723, 724, 772, 773, 848, 849,
      916, 917, 920, 921, 970, 971
    ],
  },
  {
    name: "awesome oscillator crossing above zero",
    condition: cross(AO, "above", constant("0")),
    flips: [
      106, 107, 125, 126, 177, 178, 246, 247, 266, 267, 313, 314, 318, 319, 347, 348, 358, 359,
      415, 416, 513, 514, 595, 596, 662, 663, 701, 702, 708, 709, 761, 762, 765, 766, 828, 829,
      856, 857, 911, 912, 969, 970, 983, 984
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

  it("computes every indicator it reads causally, so a slice of the full series is the series at that candle", () => {
    const requests = new Map<string, IndicatorRequest>();
    for (const e of EXPECTATIONS) {
      for (const r of collectIndicators(ruleWith(e.condition))) requests.set(JSON.stringify(r), r);
    }

    // Every 41st candle and the last one: prime-spaced so no sample lines up
    // with a period (a WMA resync, a Bollinger window) and hides behind it.
    const samples = RECORDED_CANDLES.map((_, i) => i).filter(
      (i) => i % 41 === 0 || i === RECORDED_CANDLES.length - 1,
    );
    const leaks: string[] = [];
    for (const request of requests.values()) {
      const full = fullSeries(request);
      for (const i of samples) {
        const prefix = computeIndicatorSeries(request, RECORDED_CANDLES.slice(0, i + 1));
        if (!prefix.supported) throw new Error(prefix.reason);
        const at = prefix.values.findIndex((v, k) => v !== full[k]);
        if (at !== -1) leaks.push(`${JSON.stringify(request.indicator)} differs at ${at} when cut at ${i}`);
      }
    }

    // Exact string equality, not a tolerance: the evaluator compares these
    // decimals, so "close" would be a different verdict at a boundary.
    expect(requests.size).toBeGreaterThan(0);
    expect(leaks).toEqual([]);
  });

  it("reaches the same verdict from the last candles as from the whole history", () => {
    // What makes `CONTEXT_TAIL` safe, asserted rather than assumed: at every
    // 41st candle and the last one, every expectation's verdict from the tail
    // equals its verdict from every candle before it.
    const samples = RECORDED_CANDLES.map((_, i) => i).filter(
      (i) => i % 41 === 0 || i === RECORDED_CANDLES.length - 1,
    );
    const differing: string[] = [];
    let compared = 0;
    for (const e of EXPECTATIONS) {
      const rule = ruleWith(e.condition);
      for (const i of samples) {
        const fromTail = ruleSchema.evaluate(rule, contextAt(rule, i));
        const fromAll = ruleSchema.evaluate(rule, contextAt(rule, i, Infinity));
        if (JSON.stringify(fromTail) !== JSON.stringify(fromAll)) {
          differing.push(`${e.name} at ${i}: ${JSON.stringify(fromTail)} vs ${JSON.stringify(fromAll)}`);
        }
        if (i >= CONTEXT_TAIL) compared++;
      }
    }
    expect(differing).toEqual([]);
    expect(compared).toBeGreaterThan(EXPECTATIONS.length * 10);
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
   * Indicators the core accepts and the panel offers, which have no JavaScript
   * implementation on the alert path — so there is nothing to prove about when
   * they fire, because they cannot fire.
   *
   * Since BUG-0451 the panel no longer offers them — the catalogue reads the
   * same `ALERT_PATH_INDICATORS` list the series computation does — and an alert
   * saved on one before that is reported by `RuleEvaluationLoop` as unevaluable.
   * Wiring one in is a behaviour change on a money path — an alert that was
   * inert starts firing — and its expectation belongs in the same change. The
   * test below enforces that ordering rather than trusting it.
   *
   * Parabolic SAR, Ichimoku and OBV carry an extra note: each needs a
   * condition-shape decision before its expectation can be written (FEAT-0446).
   */
  const NOT_ON_ALERT_PATH = "no JavaScript implementation on the alert path; an alert on it cannot fire";
  const SCOPED_OUT: Record<string, string> = {
    obv: `${NOT_ON_ALERT_PATH}; accumulates from the first candle it is given, so its level depends on how much history the rolling buffer holds`,
    parabolic_sar: `${NOT_ON_ALERT_PATH}; flips side rather than crossing a level, so the condition shape needs deciding first`,
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

  it("scopes out only indicators the alert path genuinely cannot compute", () => {
    const computable = Object.keys(SCOPED_OUT).filter((id) => {
      const result = computeIndicatorSeries(
        { indicator: { id, params: {} }, timeframe: TF },
        RECORDED_CANDLES,
      );
      // A parameter refusal still means the path knows the indicator, and would
      // compute it once configured — exactly the case this test exists to catch.
      return result.supported || !result.reason.includes("no JavaScript implementation");
    });

    // The moment one of these is wired into `computeIndicatorSeries`, alerts on
    // it start firing in production. This fails in that same change, so the
    // recorded-history expectation cannot be left for later.
    expect(computable).toEqual([]);
  });

  it("does not carry a scoped-out entry for an indicator that is covered", () => {
    const covered = coveredIndicators();
    const stale = Object.keys(SCOPED_OUT).filter((id) => covered.has(id));

    // The other direction: a list of known gaps that outlives the gap is worse
    // than no list, because it reads as coverage that is missing when it is not.
    expect(stale).toEqual([]);
  });
});
