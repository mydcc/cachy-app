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
 * FEAT-0028 acceptance criterion 3 — a corrected candle must not fire twice.
 *
 * Exchanges revise candles after the fact: a late trade lands and the close or
 * the volume of a candle that already closed changes. Everything downstream is
 * then recomputed. The trader has already been told what that candle meant, and
 * telling them again is worse than silence — two identical alerts are
 * indistinguishable from one real signal repeated, and a trader may act twice.
 *
 * Nothing is mocked below the loop: real `RuleEvaluationLoop`, real
 * `ruleEvaluationGate`, real `ruleSchema`, real wasm. The defence is layered and
 * this file checks both layers, because either alone would be a single point of
 * failure for a duplicate order.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { CANDLE_SERIES } from "../../lib/rules/__fixtures__/candleSeries";
import { collectIndicators } from "../../lib/rules/indicatorRequests";
import { computeIndicatorSeries } from "../../lib/rules/indicatorSeries";
import { ruleEvaluationGate } from "../../lib/rules/ruleEvaluationGate";
import { ruleSchema } from "../../lib/rules/ruleSchema";
import { RuleEvaluationLoop } from "./ruleEvaluationLoop";
import type { EvaluationCandle, RuleDocument } from "../../lib/rules/types";

vi.mock("../logger", () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../../services/logger", () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const WASM_JS = pathToFileURL(resolve(process.cwd(), "static/wasm/technicals_wasm.js")).href;
const WASM_BINARY = resolve(process.cwd(), "static/wasm/technicals_wasm_bg.wasm");

const RULE_ID = "corrected-candle-rule";
const TIMEFRAME = "1h";
/** Enough history that RSI is warm and the loop will evaluate. */
const HISTORY = 60;

let template: RuleDocument;

beforeAll(async () => {
  const mod = (await import(/* @vite-ignore */ WASM_JS)) as {
    default: (binary: BufferSource) => Promise<unknown>;
    rule_from_alert_json(alertJson: string, timeframe: string, createdAtMs: number): string;
  };
  await mod.default(readFileSync(WASM_BINARY));
  ruleSchema.setLoader(async () => mod as never);
  await ruleSchema.load();

  const alert = { id: RULE_ID, symbol: "BTCUSDT", condition: { price_reached: "1" }, active: true };
  template = JSON.parse(
    mod.rule_from_alert_json(JSON.stringify(alert), TIMEFRAME, CANDLE_SERIES[0].open_time_ms),
  );
});

/**
 * A rule that fires on every closed candle once warm.
 *
 * `RSI > 0` is true wherever RSI exists, which makes "how many times did this
 * fire" an unambiguous count rather than a question about the price series.
 * This test is about firing *once per candle*, not about which candles qualify.
 */
function alwaysFiringRule(): RuleDocument {
  return {
    ...template,
    id: RULE_ID,
    name: "fires on every close",
    conditions: {
      kind: "compare",
      left: { kind: "indicator", indicator: { id: "rsi", params: { period: 14 } } },
      op: "gt",
      right: { kind: "constant", value: "0" },
      timeframe: TIMEFRAME,
    },
  };
}

describe("a corrected candle", () => {
  let candles: EvaluationCandle[];
  let firings: number;
  let loop: RuleEvaluationLoop;

  /** Push the series up to `index` and tell the loop the newest open time. */
  function observeThrough(index: number) {
    candles = CANDLE_SERIES.slice(0, index + 1);
    return loop.observeCandles("BTCUSDT", TIMEFRAME, [{ time: CANDLE_SERIES[index].open_time_ms }]);
  }

  beforeEach(() => {
    ruleEvaluationGate.forget(RULE_ID);
    candles = [];
    firings = 0;
    loop = new RuleEvaluationLoop({
      readCandles: () => candles,
      readRules: () => [alwaysFiringRule()],
      onFiring: () => {
        firings++;
      },
    });

    for (let i = 0; i <= HISTORY; i++) observeThrough(i);
    expect(firings).toBeGreaterThan(0);
  });

  it("does not fire again when the last closed candle is revised in place", () => {
    const before = firings;
    const revised = CANDLE_SERIES[HISTORY - 1];

    // A late trade moves the close and the volume of a candle that has already
    // closed. Same open time, so this is a correction and not a new candle.
    candles = [
      ...CANDLE_SERIES.slice(0, HISTORY - 1),
      { ...revised, close: String(Number(revised.close) * 1.03), volume: "999" },
      CANDLE_SERIES[HISTORY],
    ];
    loop.observeCandles("BTCUSDT", TIMEFRAME, [{ time: CANDLE_SERIES[HISTORY].open_time_ms }]);

    expect(firings).toBe(before);
  });

  it("does not fire again when the whole series is replayed after a reconnect", () => {
    const before = firings;

    // What a reconnect does: the loop forgets where it was, the store refills,
    // and every candle arrives again.
    loop.forgetSeries("BTCUSDT", TIMEFRAME);
    for (let i = 0; i <= HISTORY; i++) observeThrough(i);

    expect(firings).toBe(before);
  });

  it("still fires for a genuinely new candle after a correction", () => {
    const before = firings;
    const revised = CANDLE_SERIES[HISTORY - 1];
    candles = [
      ...CANDLE_SERIES.slice(0, HISTORY - 1),
      { ...revised, close: String(Number(revised.close) * 1.03), volume: "999" },
      CANDLE_SERIES[HISTORY],
    ];
    loop.observeCandles("BTCUSDT", TIMEFRAME, [{ time: CANDLE_SERIES[HISTORY].open_time_ms }]);

    // Suppressing a duplicate must not suppress the next real event: that would
    // trade a double-fire for a silent alert, which is the worse of the two.
    observeThrough(HISTORY + 1);

    expect(firings).toBe(before + 1);
  });

  it("lets the correction change the verdict of the candles that follow it", () => {
    // A correction is not only a duplicate risk — it is new information for
    // every indicator whose window contains it. Suppressing the duplicate must
    // not also suppress the *effect*: the candles that follow have to be
    // decided on the corrected series.
    const original = CANDLE_SERIES.slice(0, HISTORY + 1);
    const corrected = original.map((c, i) =>
      i === HISTORY - 5 ? { ...c, close: String(Number(c.close) * 1.5) } : c,
    );

    const sma = (series: EvaluationCandle[]) => {
      const result = computeIndicatorSeries(
        { indicator: { id: "sma", params: { period: 20 } }, timeframe: TIMEFRAME },
        series,
      );
      if (!result.supported) throw new Error(result.reason);
      return Number(result.values[series.length - 1]);
    };

    const before = sma(original);
    const after = sma(corrected);
    expect(after).toBeGreaterThan(before);

    // One rule, one anchor, two versions of the same candle history: the
    // threshold sits between them, so the verdict is decided by whether the
    // correction reached the evaluator.
    const threshold = ((before + after) / 2).toFixed(8);
    const rule: RuleDocument = {
      ...alwaysFiringRule(),
      conditions: {
        kind: "compare",
        left: { kind: "indicator", indicator: { id: "sma", params: { period: 20 } } },
        op: "gt",
        right: { kind: "constant", value: threshold },
        timeframe: TIMEFRAME,
      },
    };

    const contextFor = (series: EvaluationCandle[]) => ({
      candles: { [TIMEFRAME]: series },
      indicators: collectIndicators(rule).map((request) => {
        const result = computeIndicatorSeries(request, series);
        if (!result.supported) throw new Error(result.reason);
        return { indicator: request.indicator, timeframe: request.timeframe, values: result.values };
      }),
    });

    expect(ruleSchema.evaluate(rule, contextFor(original))).toEqual({ verdict: "does_not_fire" });
    expect(ruleSchema.evaluate(rule, contextFor(corrected))).toEqual({ verdict: "fires" });
  });
});
