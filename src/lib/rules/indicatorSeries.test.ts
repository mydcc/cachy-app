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

import { describe, expect, it } from "vitest";

import { collectIndicators, indicatorKey } from "./indicatorRequests";
import { computeIndicatorSeries } from "./indicatorSeries";
import { TechnicalsPresenter } from "../../utils/technicalsPresenter";
import type {
  Condition,
  EvaluationCandle,
  IndicatorRef,
  RuleDocument,
} from "./types";

function candles(closes: number[], volumes?: number[]): EvaluationCandle[] {
  return closes.map((close, i) => ({
    open_time_ms: i * 60_000,
    open: String(close),
    high: String(close),
    low: String(close),
    close: String(close),
    volume: volumes ? String(volumes[i]) : undefined,
  }));
}

function rule(conditions: Condition, veto?: Condition): RuleDocument {
  return {
    schema_version: 1,
    id: "r1",
    name: "test",
    symbol: "BTCUSDT",
    trigger_timeframe: "1h",
    conditions,
    veto,
    action: { consequence_level: "notify" },
    provenance: { source: "human", created_at_ms: 0 },
  };
}

const rsi14: IndicatorRef = { id: "rsi", params: { period: 14 } };

describe("collectIndicators", () => {
  it("finds the indicator on either side of a comparison", () => {
    const found = collectIndicators(
      rule({
        kind: "compare",
        left: { kind: "indicator", indicator: rsi14 },
        op: "gt",
        right: { kind: "constant", value: "70" },
        timeframe: "1h",
      }),
    );

    expect(found).toEqual([{ indicator: rsi14, timeframe: "1h" }]);
  });

  it("collapses the same indicator read by two conditions into one request", () => {
    const read: Condition = {
      kind: "compare",
      left: {
        kind: "indicator",
        indicator: { id: "rsi", params: { period: 14 } },
      },
      op: "gt",
      right: { kind: "constant", value: "70" },
      timeframe: "1h",
    };

    expect(
      collectIndicators(rule({ kind: "group", op: "all", of: [read, read] })),
    ).toHaveLength(1);
  });

  it("keeps the same indicator apart when two conditions read different timeframes", () => {
    const found = collectIndicators(
      rule({
        kind: "group",
        op: "all",
        of: [
          {
            kind: "compare",
            left: { kind: "indicator", indicator: rsi14 },
            op: "gt",
            right: { kind: "constant", value: "70" },
            timeframe: "1h",
          },
          {
            kind: "compare",
            left: { kind: "indicator", indicator: rsi14 },
            op: "gt",
            right: { kind: "constant", value: "70" },
            timeframe: "4h",
          },
        ],
      }),
    );

    expect(found.map((r) => r.timeframe).sort()).toEqual(["1h", "4h"]);
  });

  it("collects from the veto too, because a veto reads indicators as well", () => {
    const found = collectIndicators(
      rule(
        { kind: "position", side: "either", open: true },
        {
          kind: "compare",
          left: { kind: "indicator", indicator: rsi14 },
          op: "lt",
          right: { kind: "constant", value: "30" },
          timeframe: "1h",
        },
      ),
    );

    expect(found).toEqual([{ indicator: rsi14, timeframe: "1h" }]);
  });

  it("keys two spellings of the same parameters identically", () => {
    const a: IndicatorRef = {
      id: "macd",
      params: { fast_period: 12, slow_period: 26, signal_period: 9 },
    };
    const b: IndicatorRef = {
      id: "macd",
      params: { signal_period: 9, slow_period: 26, fast_period: 12 },
    };

    expect(indicatorKey(a, "1h")).toBe(indicatorKey(b, "1h"));
  });
});

describe("computeIndicatorSeries", () => {
  const ramp = candles(Array.from({ length: 60 }, (_, i) => 100 + i));

  it("produces a value per candle, null while the indicator is still warming up", () => {
    const result = computeIndicatorSeries(
      { indicator: rsi14, timeframe: "1h" },
      ramp,
    );

    expect(result.supported).toBe(true);
    if (!result.supported) return;
    expect(result.values).toHaveLength(ramp.length);
    expect(result.values[0]).toBeNull();
    expect(result.values.at(-1)).not.toBeNull();
  });

  it("never emits exponent notation, which the core would refuse", () => {
    const tiny = candles(
      Array.from({ length: 40 }, (_, i) => 0.00000001 * (i + 1)),
    );
    const result = computeIndicatorSeries(
      { indicator: { id: "sma", params: { period: 5 } }, timeframe: "1h" },
      tiny,
    );

    expect(result.supported).toBe(true);
    if (!result.supported) return;
    for (const value of result.values) {
      if (value !== null) expect(value).not.toMatch(/e/i);
    }
  });

  it("derives the MACD histogram the registry promises but the JS path does not return", () => {
    const macd = {
      id: "macd",
      params: { fast_period: 12, slow_period: 26, signal_period: 9 },
    };
    const line = computeIndicatorSeries(
      { indicator: { ...macd, output: "macd" }, timeframe: "1h" },
      ramp,
    );
    const signal = computeIndicatorSeries(
      { indicator: { ...macd, output: "signal" }, timeframe: "1h" },
      ramp,
    );
    const hist = computeIndicatorSeries(
      { indicator: { ...macd, output: "histogram" }, timeframe: "1h" },
      ramp,
    );

    expect(line.supported && signal.supported && hist.supported).toBe(true);
    if (!line.supported || !signal.supported || !hist.supported) return;

    const last = ramp.length - 1;
    expect(Number(hist.values[last])).toBeCloseTo(
      Number(line.values[last]) - Number(signal.values[last]),
      10,
    );
  });

  it("reads volume rather than price for volume_ma", () => {
    const withVolume = candles(
      Array.from({ length: 20 }, () => 100),
      Array.from({ length: 20 }, () => 7),
    );
    const result = computeIndicatorSeries(
      {
        indicator: { id: "volume_ma", params: { period: 5 } },
        timeframe: "1h",
      },
      withVolume,
    );

    expect(result.supported).toBe(true);
    if (!result.supported) return;
    expect(Number(result.values.at(-1))).toBeCloseTo(7, 10);
  });

  it("refuses an indicator it cannot compute instead of returning nulls", () => {
    const result = computeIndicatorSeries(
      {
        indicator: { id: "ichimoku", params: { conversion_period: 9 } },
        timeframe: "1h",
      },
      ramp,
    );

    expect(result.supported).toBe(false);
    if (result.supported) return;
    expect(result.reason).toContain("ichimoku");
  });

  const BB = { id: "bollinger", params: { period: 20, std_dev: 2 } };

  /** Every bollinger line over the same candles, as numbers. */
  function bands(candlesIn: EvaluationCandle[]) {
    const line = (output: string) => {
      const r = computeIndicatorSeries(
        { indicator: { ...BB, output }, timeframe: "1h" },
        candlesIn,
      );
      if (!r.supported) throw new Error(r.reason);
      return r.values.map((v) => (v === null ? null : Number(v)));
    };
    return {
      upper: line("upper"),
      middle: line("middle"),
      lower: line("lower"),
      bandwidth: line("bandwidth"),
    };
  }

  /**
   * FEAT-0028's squeeze gap. Checked against the three band lines the same
   * function returns rather than against a reimplementation of the Bollinger
   * maths, so this pins the *relationship* — which is the part a squeeze
   * condition depends on.
   */
  it("reports bandwidth as a percentage of the middle band", () => {
    const wobble = candles(
      Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 3) * 8),
    );
    const b = bands(wobble);

    expect(b.bandwidth).toHaveLength(wobble.length);
    let checked = 0;
    for (let i = 0; i < wobble.length; i++) {
      if (b.bandwidth[i] === null) {
        expect(b.middle[i]).toBeNull();
        continue;
      }
      const expected =
        (((b.upper[i] as number) - (b.lower[i] as number)) /
          (b.middle[i] as number)) *
        100;
      expect(b.bandwidth[i] as number).toBeCloseTo(expected, 8);
      checked++;
    }
    expect(checked).toBeGreaterThan(30);
  });

  /**
   * The scale is a cross-surface contract, not an internal detail. The panel
   * prints `calculateBollingerBandWidth` with a `%` beside it; a trader reads
   * that number and writes it into a rule. If the two ever disagree, a squeeze
   * threshold copied off the screen silently means something else — so the
   * claim is asserted against the panel's own function.
   */
  it("agrees with the bandwidth the technicals panel displays", () => {
    const wobble = candles(
      Array.from({ length: 60 }, (_, i) => 100 + Math.cos(i / 4) * 5),
    );
    const b = bands(wobble);
    const last = b.bandwidth.length - 1;

    expect(b.bandwidth[last]).not.toBeNull();
    expect(b.bandwidth[last] as number).toBeCloseTo(
      TechnicalsPresenter.calculateBollingerBandWidth(
        b.upper[last] as number,
        b.lower[last] as number,
        b.middle[last] as number,
      ),
      8,
    );
  });

  /**
   * A zero middle band has no bandwidth, and must not report zero. Zero is the
   * tightest squeeze expressible, so `bandwidth < threshold` would fire on
   * every candle of a series that carries no usable band at all.
   */
  it("has no bandwidth where the middle band is zero", () => {
    const flatZero = candles(Array.from({ length: 40 }, () => 0));
    const b = bands(flatZero);

    expect(b.middle.at(-1)).toBe(0);
    expect(b.bandwidth.at(-1)).toBeNull();
    expect(b.bandwidth.every((v) => v === null)).toBe(true);
  });

  it("refuses an output line the indicator does not produce", () => {
    const result = computeIndicatorSeries(
      {
        indicator: { id: "rsi", params: { period: 14 }, output: "signal" },
        timeframe: "1h",
      },
      ramp,
    );

    expect(result.supported).toBe(false);
  });
});
