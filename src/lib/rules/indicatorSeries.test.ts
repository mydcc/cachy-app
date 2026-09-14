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
import { alertPathSourceOf, defaultFieldOf } from "./alertPathIndicators";
import { computeIndicatorSeries } from "./indicatorSeries";
import { Decimal } from "decimal.js";

import { INDICATOR_CATALOGUE, defaultRef } from "../alerts/indicatorCatalogue";
import { calculateADXSeries, JSIndicators } from "../../utils/indicators";
import { TechnicalsPresenter } from "../../utils/technicalsPresenter";
import { RECORDED_CANDLES } from "../../services/__fixtures__/recordedSeries";
import { getSourceData, type ChartRow } from "../chart/seriesMap";
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

  /**
   * BUG-0449. HMA shipped on this path with no test at all, and threw on every
   * call. So this walks the catalogue the panel offers rather than a hand list:
   * any indicator the path says it supports has to produce numbers, and a new
   * one cannot join the supported set without being exercised here.
   */
  it("computes every catalogue line it claims to support, without throwing", () => {
    const long = candles(
      Array.from({ length: 300 }, (_, i) => 100 + 10 * Math.sin(i / 7) + i / 10),
      Array.from({ length: 300 }, (_, i) => 1_000 + (i % 13) * 50),
    );
    const claimed: string[] = [];

    for (const entry of INDICATOR_CATALOGUE) {
      for (const line of entry.outputs) {
        const ref = { ...defaultRef(entry), output: line.name };
        const result = computeIndicatorSeries({ indicator: ref, timeframe: "1h" }, long);
        if (!result.supported) continue;

        const label = `${entry.id}.${line.name}`;
        claimed.push(label);
        expect(result.values, label).toHaveLength(long.length);
        expect(result.values.some((v) => v !== null), label).toBe(true);
      }
    }

    // Guards the loop above against passing by skipping everything.
    expect(claimed).toContain("hma.value");
  });

  it("computes HMA as the same function the chart calls", () => {
    const series = Array.from({ length: 60 }, (_, i) => 100 + (i % 9) * 3);
    const result = computeIndicatorSeries(
      { indicator: { id: "hma", params: { period: 16 } }, timeframe: "1h" },
      candles(series),
    );

    expect(result.supported).toBe(true);
    if (!result.supported) return;
    const expected = JSIndicators.hma(Float64Array.from(series), 16);
    expect(result.values).toEqual(
      Array.from(expected, (v) => (Number.isFinite(v) ? new Decimal(v).toFixed() : null)),
    );
  });

  it("computes momentum as the same function the chart calls", () => {
    const series = Array.from({ length: 40 }, (_, i) => 100 + (i % 7) * 2.5);
    const result = computeIndicatorSeries(
      { indicator: { id: "momentum", params: { period: 10 } }, timeframe: "1h" },
      candles(series),
    );

    expect(result.supported).toBe(true);
    if (!result.supported) return;
    const expected = JSIndicators.mom(Float64Array.from(series), 10);
    expect(result.values).toEqual(
      Array.from(expected, (v) => (Number.isFinite(v) ? new Decimal(v).toFixed() : null)),
    );
    // The change over the period: nothing before a full period back exists.
    expect(result.values.slice(0, 10)).toEqual(Array(10).fill(null));
    expect(result.values[10]).toBe(new Decimal(series[10]).minus(series[0]).toFixed());
  });

  /**
   * The live loop reads a rolling buffer: the oldest candle is dropped as a new
   * one closes, and scrolling the chart back loads more. A value that depended
   * on where that buffer starts would let an alert fire or stay quiet on how far
   * the trader scrolled. OBV has exactly that property — it accumulates from
   * the first candle it is given — which is why it is not wired in with
   * momentum (FEAT-0446, "Found: OBV depends on the loaded window").
   */
  it("gives momentum the same value at a candle however much history precedes it", () => {
    const series = Array.from({ length: 80 }, (_, i) => 100 + ((i * 13) % 17) - (i % 5));
    const full = computeIndicatorSeries(
      { indicator: { id: "momentum", params: { period: 10 } }, timeframe: "1h" },
      candles(series),
    );
    const trimmed = computeIndicatorSeries(
      { indicator: { id: "momentum", params: { period: 10 } }, timeframe: "1h" },
      candles(series).slice(25),
    );

    expect(full.supported && trimmed.supported).toBe(true);
    if (!full.supported || !trimmed.supported) return;
    // From the first candle the trimmed buffer has a full period for, onwards.
    expect(trimmed.values.slice(10)).toEqual(full.values.slice(25 + 10));
  });

  /**
   * FEAT-0446 group 4. WASM has no OBV (`NOT_IN_WASM`), so it is checked here
   * against its definition: from zero, add the candle's volume on a higher
   * close, subtract it on a lower one.
   */
  it("computes OBV as a running total of signed volume, to within 1e-6 on recorded history", () => {
    const shown = computeIndicatorSeries(
      { indicator: { id: "obv", params: {} }, timeframe: "1h" },
      RECORDED_CANDLES,
    );
    expect(shown.supported).toBe(true);
    if (!shown.supported) return;

    let total = new Decimal(0);
    const wrong: string[] = [];
    for (let i = 0; i < RECORDED_CANDLES.length; i++) {
      if (i > 0) {
        const change = new Decimal(RECORDED_CANDLES[i].close).comparedTo(RECORDED_CANDLES[i - 1].close);
        total = total.plus(new Decimal(RECORDED_CANDLES[i].volume ?? "0").times(change));
      }
      const value = shown.values[i];
      if ((value === null || new Decimal(value).minus(total).abs().gt("1e-6")) && wrong.length < 3) {
        wrong.push(`candle ${i}: ${value} vs ${total.toFixed(6)}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  /**
   * Why the core accepts OBV only against its own window: a later buffer start
   * moves the whole line by a constant, and the constant cancels between OBV
   * and an extreme of its own recent values.
   */
  it("shifts OBV with a later start, but not its place in its own window", () => {
    const TRIM = 100;
    const WINDOW = 20;
    const read = (from: number) => {
      const result = computeIndicatorSeries(
        { indicator: { id: "obv", params: {} }, timeframe: "1h" },
        RECORDED_CANDLES.slice(from, 600),
      );
      if (!result.supported) throw new Error(result.reason);
      return result.values.map((v) => new Decimal(v!));
    };
    const full = read(0);
    const trimmed = read(TRIM);

    const shift = full[TRIM].minus(trimmed[0]);
    expect(shift.isZero()).toBe(false);
    const atHigh = (line: Decimal[], i: number) => line[i].gte(Decimal.max(...line.slice(i - WINDOW + 1, i + 1)));
    let changed = 0;
    for (let i = 0; i < trimmed.length; i++) {
      // Constant up to the f64 rounding of two running sums.
      expect(full[TRIM + i].minus(trimmed[i]).minus(shift).abs().lte("1e-6"), `candle ${i}`).toBe(true);
      if (i >= WINDOW - 1 && atHigh(full, TRIM + i) !== atHigh(trimmed, i)) changed++;
    }
    expect(changed).toBe(0);
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

/**
 * FEAT-0446 group 2 — the indicators that read high, low and close.
 */
describe("computeIndicatorSeries — high, low and close", () => {
  /** Candles from `[high, low, close, volume]` rows. */
  function bars(rows: ReadonlyArray<readonly [number, number, number, number]>): EvaluationCandle[] {
    return rows.map(([high, low, close, volume], i) => ({
      open_time_ms: i * 3_600_000,
      open: String(close),
      high: String(high),
      low: String(low),
      close: String(close),
      volume: String(volume),
    }));
  }

  /** A moving market: every window has range, and closes sit off the typical price. */
  const moving = bars(
    Array.from({ length: 80 }, (_, i) => {
      const mid = 100 + ((i * 7) % 13) - (i % 4);
      return [mid + 3 + (i % 3), mid - 2 - (i % 2), mid + ((i % 5) - 2), 10 + (i % 6)] as const;
    }),
  );

  const series = (indicator: IndicatorRef, candlesIn: EvaluationCandle[]) => {
    const result = computeIndicatorSeries({ indicator, timeframe: "1h" }, candlesIn);
    if (!result.supported) throw new Error(result.reason);
    return result.values;
  };

  const asWire = (values: Float64Array) =>
    Array.from(values, (v) => (Number.isFinite(v) ? new Decimal(v).toFixed() : null));

  const column = (field: "high" | "low" | "close" | "volume") =>
    Float64Array.from(moving, (c) => Number(c[field]));

  const STOCHASTIC = { k_period: 14, k_smoothing: 3, d_period: 3 };
  const ICHIMOKU = { conversion_period: 9, base_period: 26, span_b_period: 52 };
  const SAR = { start: "0.02", increment: "0.02", max: "0.2" };

  it("computes CCI over the typical price, the price alertPathSourceOf names", () => {
    const high = column("high");
    const low = column("low");
    const close = column("close");
    const typical = high.map((h, i) => (h + low[i] + close[i]) / 3);

    const cci = series({ id: "cci", params: { period: 20 } }, moving);

    expect(alertPathSourceOf("cci")).toBe("hlc3");
    expect(cci).toEqual(asWire(JSIndicators.cci(typical, 20)));
    // And not the close, which would be a different line.
    expect(cci).not.toEqual(asWire(JSIndicators.cci(close, 20)));
  });

  it("computes Williams %R, ATR, choppiness and MFI as the functions the chart calls", () => {
    const high = column("high");
    const low = column("low");
    const close = column("close");
    const volume = column("volume");

    expect(series({ id: "williams_r", params: { period: 14 } }, moving)).toEqual(
      asWire(JSIndicators.williamsR(high, low, close, 14)),
    );
    expect(series({ id: "atr", params: { period: 14 } }, moving)).toEqual(
      asWire(JSIndicators.atr(high, low, close, 14)),
    );
    expect(series({ id: "choppiness", params: { period: 14 } }, moving)).toEqual(
      asWire(JSIndicators.choppiness(high, low, close, 14)),
    );
    expect(series({ id: "mfi", params: { period: 14 } }, moving)).toEqual(
      asWire(JSIndicators.mfi(high, low, close, volume, 14)),
    );
  });

  /**
   * A window with no range has no %R, no choppiness and no CCI: each divides
   * by it. The chart draws 0 there, and WASM -50 for %R, and neither is a
   * reading of the market. On the alert path a made-up 0 would fire "%R above
   * -20" on a halted market, so it is null, which the core reads as
   * indeterminate — the same decision as the Bollinger bandwidth over a zero
   * middle band.
   */
  describe("a window with no range", () => {
    // Twenty identical candles, then the moving market.
    const flatThenMoving = [
      ...bars(Array.from({ length: 20 }, () => [100, 100, 100, 5] as const)),
      ...moving.slice(0, 40).map((c, i) => ({ ...c, open_time_ms: (20 + i) * 3_600_000 })),
    ];

    it.each([
      ["williams_r", { period: 14 }],
      ["choppiness", { period: 14 }],
      ["cci", { period: 14 }],
    ] as const)("has no %s over it, and a value as soon as the window moves", (id, params) => {
      const values = series({ id, params }, flatThenMoving);
      // Candles 13–19 have a full window, all of it flat.
      expect(values.slice(13, 20)).toEqual(Array(7).fill(null));
      expect(values.slice(34).every((v) => v !== null)).toBe(true);
    });

    it("has no MFI where no money flowed either way, rather than the chart's 50", () => {
      const values = series({ id: "mfi", params: { period: 14 } }, flatThenMoving);
      expect(values.slice(14, 20)).toEqual(Array(6).fill(null));
      expect(values.slice(35).every((v) => v !== null)).toBe(true);
    });

    it("keeps MFI at 100 when money only flowed in", () => {
      const rising = bars(
        Array.from({ length: 30 }, (_, i) => [101 + i, 99 + i, 100 + i, 10] as const),
      );
      const values = series({ id: "mfi", params: { period: 14 } }, rising);
      expect(values[20]).toBe("100");
    });
  });

  describe("the awesome oscillator", () => {
    it("has no value before its slower average has a full window, rather than the chart's 0", () => {
      const values = series({ id: "ao", params: { fast_period: 5, slow_period: 34 } }, moving);
      expect(values.slice(0, 33)).toEqual(Array(33).fill(null));
      expect(values[33]).not.toBeNull();
    });

    /**
     * WASM has no awesome oscillator, so this is its cross-path check
     * (`crossPathParity.test.ts`, `NOT_IN_WASM`): the two simple averages of the
     * median price, recomputed in `Decimal` over the recorded fixture.
     */
    it("is the fast minus the slow average of the median price, to within 1e-9 on recorded history", () => {
      const values = series({ id: "ao", params: { fast_period: 5, slow_period: 34 } }, RECORDED_CANDLES);
      const median = RECORDED_CANDLES.map((c) => new Decimal(c.high).plus(c.low).div(2));
      const average = (end: number, n: number) =>
        median.slice(end - n + 1, end + 1).reduce((a, b) => a.plus(b), new Decimal(0)).div(n);

      const wrong: string[] = [];
      for (let i = 33; i < RECORDED_CANDLES.length; i++) {
        const expected = average(i, 5).minus(average(i, 34));
        const shown = values[i];
        if (shown === null || new Decimal(shown).minus(expected).abs().gt("1e-9")) {
          if (wrong.length < 3) wrong.push(`candle ${i}: ${shown} vs ${expected.toFixed(12)}`);
        }
      }
      expect(wrong).toEqual([]);
    });
  });

  /**
   * FEAT-0446 group 3 — the indicators an alert reads one of several lines of.
   */
  describe("several output lines", () => {
    const STOCH_RSI = { rsi_period: 14, stoch_period: 14, k_period: 3, d_period: 3 };

    it("computes Stochastic, Stoch RSI, ADX and SuperTrend as the functions the chart and panel call", () => {
      const high = column("high");
      const low = column("low");
      const close = column("close");

      const k = JSIndicators.sma(JSIndicators.stoch(high, low, close, 14), 3);
      expect(series({ id: "stochastic", params: STOCHASTIC, output: "k" }, moving)).toEqual(asWire(k));
      expect(series({ id: "stochastic", params: STOCHASTIC, output: "d" }, moving)).toEqual(
        asWire(JSIndicators.sma(k, 3)),
      );

      // stochRsi(data, rsiPeriod, stochLookback, dPeriod, kSmoothing) — BUG-0460.
      const stochRsi = JSIndicators.stochRsi(close, 14, 14, 3, 3);
      expect(series({ id: "stoch_rsi", params: STOCH_RSI, output: "k" }, moving)).toEqual(asWire(stochRsi.k));
      expect(series({ id: "stoch_rsi", params: STOCH_RSI, output: "d" }, moving)).toEqual(asWire(stochRsi.d));

      const adx = calculateADXSeries(high, low, close, 14, 14);
      expect(series({ id: "adx", params: { period: 14 }, output: "adx" }, moving)).toEqual(asWire(adx.adx));
      expect(series({ id: "adx", params: { period: 14 }, output: "plus_di" }, moving)).toEqual(asWire(adx.pdi));
      expect(series({ id: "adx", params: { period: 14 }, output: "minus_di" }, moving)).toEqual(asWire(adx.mdi));

      const superTrend = JSIndicators.superTrend(high, low, close, 10, 3);
      const ST = { period: 10, factor: "3" };
      expect(series({ id: "super_trend", params: ST, output: "value" }, moving)).toEqual(asWire(superTrend.value));
      expect(series({ id: "super_trend", params: ST, output: "upper" }, moving)).toEqual(asWire(superTrend.upper));
      expect(series({ id: "super_trend", params: ST, output: "lower" }, moving)).toEqual(asWire(superTrend.lower));
    });

    it.each([
      ["stochastic", STOCHASTIC, "value"],
      ["stoch_rsi", STOCH_RSI, "value"],
      ["adx", { period: 14 }, "value"],
      ["super_trend", { period: 10, factor: 3 }, "trend"],
      // The chart draws a lagging span too; it is the close of a later candle,
      // not a core output, and no alert reads it.
      ["ichimoku", ICHIMOKU, "lagging"],
      ["parabolic_sar", SAR, "trend"],
    ] as const)("refuses a %s line it does not produce", (id, params, output) => {
      const result = computeIndicatorSeries({ indicator: { id, params, output }, timeframe: "1h" }, moving);
      expect(result.supported).toBe(false);
      if (result.supported) return;
      expect(result.reason).toContain(`no output '${output}'`);
    });

    /**
     * A stochastic divides by its window's range. The chart draws 50 where there
     * is none, and 50 is not a reading: "%K crossing above 50" would fire on a
     * halted market. So it is null there, like %R, and so is every average that
     * reaches over such a window.
     */
    describe("a window with no range", () => {
      // Thirty identical candles, then the moving market.
      const flatThenMoving = [
        ...bars(Array.from({ length: 30 }, () => [100, 100, 100, 5] as const)),
        ...moving.slice(0, 50).map((c, i) => ({ ...c, open_time_ms: (30 + i) * 3_600_000 })),
      ];

      it("has no Stochastic over it, and none while %K or %D still averages over it", () => {
        const k = series({ id: "stochastic", params: STOCHASTIC, output: "k" }, flatThenMoving);
        const d = series({ id: "stochastic", params: STOCHASTIC, output: "d" }, flatThenMoving);
        // Raw %K windows 13–29 are flat; %K averages three of them, %D three %K.
        expect(k.slice(0, 32)).toEqual(Array(32).fill(null));
        expect(k.slice(32).every((v) => v !== null)).toBe(true);
        expect(d.slice(0, 34)).toEqual(Array(34).fill(null));
        expect(d.slice(34).every((v) => v !== null)).toBe(true);
        expect(k).not.toContain("50");
      });

      it("has no Stoch RSI while the RSI does not move over its window", () => {
        // A flat market's RSI sits at 100 from candle 14 until the first move at 30.
        const k = series({ id: "stoch_rsi", params: STOCH_RSI, output: "k" }, flatThenMoving);
        const d = series({ id: "stoch_rsi", params: STOCH_RSI, output: "d" }, flatThenMoving);
        expect(k.slice(0, 32)).toEqual(Array(32).fill(null));
        expect(k.slice(32).every((v) => v !== null)).toBe(true);
        expect(d.slice(0, 34)).toEqual(Array(34).fill(null));
        expect(d.slice(34).every((v) => v !== null)).toBe(true);
      });

      it("reads no movement as no trend and no direction, rather than no value", () => {
        // Unlike a range, a zero ADX is a reading: nothing is trending, which
        // is true of a halted market. WASM reports the same zeros.
        const flat = bars(Array.from({ length: 60 }, () => [100, 100, 100, 5] as const));
        for (const output of ["adx", "plus_di", "minus_di"]) {
          expect(series({ id: "adx", params: { period: 14 }, output }, flat).at(-1), output).toBe("0");
        }
      });
    });

    /**
     * WASM has no Stoch RSI, so this is its cross-path check
     * (`crossPathParity.test.ts`, `NOT_IN_WASM`): Wilder's RSI, its 14-candle
     * stochastic and both 3-averages, recomputed in `Decimal` over the recorded
     * fixture.
     */
    it("is the smoothed stochastic of Wilder's RSI, to within 1e-9 on recorded history", () => {
      const closes = RECORDED_CANDLES.map((c) => new Decimal(c.close));
      const rsi: (Decimal | null)[] = closes.map(() => null);
      let gain = new Decimal(0);
      let loss = new Decimal(0);
      for (let i = 1; i < closes.length; i++) {
        const change = closes[i].minus(closes[i - 1]);
        const up = change.gt(0) ? change : new Decimal(0);
        const down = change.lt(0) ? change.neg() : new Decimal(0);
        if (i <= 14) {
          gain = gain.plus(up);
          loss = loss.plus(down);
          if (i < 14) continue;
          gain = gain.div(14);
          loss = loss.div(14);
        } else {
          gain = gain.times(13).plus(up).div(14);
          loss = loss.times(13).plus(down).div(14);
        }
        rsi[i] = loss.isZero() ? new Decimal(100) : new Decimal(100).minus(new Decimal(100).div(gain.div(loss).plus(1)));
      }
      const mean = (values: (Decimal | null)[], end: number, n: number): Decimal | null => {
        const span = values.slice(end - n + 1, end + 1);
        if (end - n + 1 < 0 || span.some((v) => v === null)) return null;
        return (span as Decimal[]).reduce((a, b) => a.plus(b), new Decimal(0)).div(n);
      };
      const raw = rsi.map((_, i) => {
        const span = rsi.slice(i - 13, i + 1);
        if (i < 13 || span.some((v) => v === null)) return null;
        const highest = Decimal.max(...(span as Decimal[]));
        const lowest = Decimal.min(...(span as Decimal[]));
        return (rsi[i] as Decimal).minus(lowest).div(highest.minus(lowest)).times(100);
      });
      const k = raw.map((_, i) => mean(raw, i, 3));
      const d = k.map((_, i) => mean(k, i, 3));

      const shownK = series({ id: "stoch_rsi", params: STOCH_RSI, output: "k" }, RECORDED_CANDLES);
      const shownD = series({ id: "stoch_rsi", params: STOCH_RSI, output: "d" }, RECORDED_CANDLES);
      const wrong: string[] = [];
      for (let i = 0; i < RECORDED_CANDLES.length; i++) {
        for (const [label, expected, shown] of [["%K", k[i], shownK[i]], ["%D", d[i], shownD[i]]] as const) {
          const off =
            expected === null
              ? shown !== null
              : shown === null || new Decimal(shown).minus(expected).abs().gt("1e-9");
          if (off && wrong.length < 3) wrong.push(`candle ${i}: ${label} ${shown} vs ${expected?.toFixed(12)}`);
        }
      }
      expect(shownD.findIndex((v) => v !== null)).toBe(31);
      expect(wrong).toEqual([]);
    });

    /**
     * WASM has no Ichimoku, so this is its cross-path check (`NOT_IN_WASM`),
     * beside the chart comparison in `indicatorLayer.test.ts`. Each line is the
     * midpoint of its window's highest high and lowest low, recomputed in
     * `Decimal`; both spans are read 26 candles after the candle whose windows
     * they come from.
     */
    it("is the displaced midpoint of each window, to within 1e-9 on recorded history", () => {
      const high = RECORDED_CANDLES.map((c) => new Decimal(c.high));
      const low = RECORDED_CANDLES.map((c) => new Decimal(c.low));
      const midpoint = (end: number, n: number): Decimal | null => {
        if (end - n + 1 < 0) return null;
        const highest = Decimal.max(...high.slice(end - n + 1, end + 1));
        const lowest = Decimal.min(...low.slice(end - n + 1, end + 1));
        return highest.plus(lowest).div(2);
      };
      const DISPLACEMENT = 26;
      const reference: Record<string, (i: number) => Decimal | null> = {
        conversion: (i) => midpoint(i, 9),
        base: (i) => midpoint(i, 26),
        span_a: (i) => {
          const conversion = midpoint(i - DISPLACEMENT, 9);
          const base = midpoint(i - DISPLACEMENT, 26);
          return conversion && base ? conversion.plus(base).div(2) : null;
        },
        span_b: (i) => midpoint(i - DISPLACEMENT, 52),
      };

      const wrong: string[] = [];
      for (const [output, expectedAt] of Object.entries(reference)) {
        const shown = series({ id: "ichimoku", params: ICHIMOKU, output }, RECORDED_CANDLES);
        for (let i = 0; i < RECORDED_CANDLES.length; i++) {
          const expected = expectedAt(i);
          const value = shown[i];
          const off =
            expected === null
              ? value !== null
              : value === null || new Decimal(value).minus(expected).abs().gt("1e-9");
          if (off && wrong.length < 4) wrong.push(`candle ${i}: ${output} ${value} vs ${expected?.toFixed(6) ?? "no value"}`);
        }
      }
      expect(wrong).toEqual([]);
    });

    describe("the Parabolic SAR", () => {
      it("draws the chart's SAR, and the side it stands on, from the second candle", () => {
        const high = column("high");
        const low = column("low");
        const chart = JSIndicators.psar(high, low, 0.02, 0.02, 0.2);
        const value = series({ id: "parabolic_sar", params: SAR, output: "value" }, moving);
        const direction = series({ id: "parabolic_sar", params: SAR, output: "direction" }, moving);

        // The first candle's SAR is its own low, a seed that only exists once a
        // second candle does; no alert reads it.
        expect(value[0]).toBeNull();
        expect(direction[0]).toBeNull();
        expect(value.slice(1)).toEqual(asWire(chart).slice(1));
        expect(new Set(direction.slice(1))).toEqual(new Set(["1", "-1"]));
      });

      /**
       * WASM reports the SAR but not its side (`NOT_IN_WASM`), so both lines are
       * checked here against Wilder's rules replayed in `Decimal`: the SAR steps
       * towards the extreme point by the factor, never enters the previous two
       * candles' range, and reverses to the extreme point when the price
       * penetrates it.
       */
      it("follows Wilder's rules, to within 1e-9 on recorded history", () => {
        const high = RECORDED_CANDLES.map((c) => new Decimal(c.high));
        const low = RECORDED_CANDLES.map((c) => new Decimal(c.low));
        const [start, step, cap] = [new Decimal("0.02"), new Decimal("0.02"), new Decimal("0.2")];
        const sars: Decimal[] = [low[0]];
        const sides: number[] = [1];
        let long = true;
        let factor = start;
        let extreme = high[0];
        for (let i = 1; i < RECORDED_CANDLES.length; i++) {
          let sar = sars[i - 1].plus(factor.times(extreme.minus(sars[i - 1])));
          const back = i > 1 ? [i - 1, i - 2] : [i - 1];
          sar = long
            ? Decimal.min(sar, ...back.map((k) => low[k]))
            : Decimal.max(sar, ...back.map((k) => high[k]));
          if (long && low[i].lt(sar)) {
            [long, sar, extreme, factor] = [false, extreme, low[i], start];
          } else if (!long && high[i].gt(sar)) {
            [long, sar, extreme, factor] = [true, extreme, high[i], start];
          } else if (long && high[i].gt(extreme)) {
            [extreme, factor] = [high[i], Decimal.min(factor.plus(step), cap)];
          } else if (!long && low[i].lt(extreme)) {
            [extreme, factor] = [low[i], Decimal.min(factor.plus(step), cap)];
          }
          sars.push(sar);
          sides.push(long ? 1 : -1);
        }

        const value = series({ id: "parabolic_sar", params: SAR, output: "value" }, RECORDED_CANDLES);
        const direction = series({ id: "parabolic_sar", params: SAR, output: "direction" }, RECORDED_CANDLES);
        const wrong: string[] = [];
        for (let i = 1; i < RECORDED_CANDLES.length; i++) {
          if (value[i] === null || new Decimal(value[i]!).minus(sars[i]).abs().gt("1e-9")) {
            if (wrong.length < 4) wrong.push(`candle ${i}: SAR ${value[i]} vs ${sars[i].toFixed(6)}`);
          }
          if (direction[i] !== String(sides[i]) && wrong.length < 4) {
            wrong.push(`candle ${i}: direction ${direction[i]} vs ${sides[i]}`);
          }
        }
        expect(wrong).toEqual([]);
        // Exercised: the fixture turns the SAR both ways many times.
        expect(sides.filter((s, i) => i > 0 && s !== sides[i - 1]).length).toBeGreaterThan(70);
      });
    });
  });

  /**
   * The alert path reads a rolling buffer (FEAT-0446, "Found: OBV depends on the
   * loaded window"). A windowed indicator must not care where it starts. %R and
   * CCI recompute each window, so they agree exactly; choppiness, MFI, AO and
   * the Stochastic slide running sums, so they agree to rounding. ATR, ADX,
   * Stoch RSI and SuperTrend are recursive and are left out on purpose: like RSI
   * and EMA they forget their start geometrically rather than not at all.
   */
  it("gives the windowed indicators the same value at a candle however much history precedes it", () => {
    const TRIM = 100;
    const lines: Array<[IndicatorRef, number, boolean]> = [
      [{ id: "williams_r", params: { period: 14 } }, 14, true],
      [{ id: "cci", params: { period: 20 } }, 20, true],
      [{ id: "choppiness", params: { period: 14 } }, 15, false],
      [{ id: "mfi", params: { period: 14 } }, 15, false],
      [{ id: "ao", params: { fast_period: 5, slow_period: 34 } }, 34, false],
      // Group 3: windows and two sliding averages over them, so to rounding.
      [{ id: "stochastic", params: STOCHASTIC, output: "k" }, 16, false],
      [{ id: "stochastic", params: STOCHASTIC, output: "d" }, 18, false],
      // Group 4: Ichimoku's lines are window midpoints, displaced or not, so exactly.
      [{ id: "ichimoku", params: ICHIMOKU, output: "conversion" }, 9, true],
      [{ id: "ichimoku", params: ICHIMOKU, output: "base" }, 26, true],
      [{ id: "ichimoku", params: ICHIMOKU, output: "span_a" }, 52, true],
      [{ id: "ichimoku", params: ICHIMOKU, output: "span_b" }, 78, true],
    ];
    const history = RECORDED_CANDLES.slice(0, 400);

    for (const [ref, needs, exact] of lines) {
      const full = series(ref, history);
      const trimmed = series(ref, history.slice(TRIM));
      for (let i = needs - 1; i < trimmed.length; i++) {
        const a = trimmed[i];
        const b = full[TRIM + i];
        expect(a === null, `${ref.id} at ${i}`).toBe(b === null);
        if (a === null || b === null) continue;
        if (exact) expect(a, `${ref.id} at ${i}`).toBe(b);
        else expect(new Decimal(a).minus(b).abs().lte("1e-9"), `${ref.id} at ${i}: ${a} vs ${b}`).toBe(true);
      }
    }
  });
});

/**
 * FEAT-0454 — an indicator computed over the price its settings card is set to.
 *
 * The chart draws these lines as `JSIndicators.<fn>(getSourceData(rows, src))`
 * (`indicatorLayer.ts`). Rather than restating each function here, the parity
 * below computes the alert series over the real candles with `field` set, and
 * over the close of candles flattened to the chart's own source column: the two
 * agree exactly when the alert path reads the column the chart feeds its line,
 * output by output, for every price the settings selector offers.
 */
describe("computeIndicatorSeries — the price an indicator is computed over", () => {
  const FIELDS = ["close", "open", "high", "low", "hl2", "hlc3"] as const;
  const history = RECORDED_CANDLES.slice(0, 300);
  const rows: ChartRow[] = history.map((c) => ({
    time: c.open_time_ms as ChartRow["time"],
    open: Number(c.open),
    high: Number(c.high),
    low: Number(c.low),
    close: Number(c.close),
    volume: Number(c.volume ?? 0),
  }));

  /** The candles with every price set to the chart's `source` column. */
  function flattenedTo(field: (typeof FIELDS)[number]): EvaluationCandle[] {
    const column = getSourceData(rows, field);
    return history.map((c, i) => {
      const price = String(column[i]);
      return { ...c, open: price, high: price, low: price, close: price };
    });
  }

  const LINES: IndicatorRef[] = [
    { id: "rsi", params: { period: 14 } },
    { id: "ema", params: { period: 20 } },
    { id: "momentum", params: { period: 10 } },
    { id: "cci", params: { period: 20 } },
    ...["macd", "signal", "histogram"].map((output) => ({
      id: "macd",
      params: { fast_period: 12, slow_period: 26, signal_period: 9 },
      output,
    })),
    ...["upper", "middle", "lower", "percent_b", "bandwidth"].map((output) => ({
      id: "bollinger",
      params: { period: 20, std_dev: "2" },
      output,
    })),
    ...["k", "d"].map((output) => ({
      id: "stoch_rsi",
      params: { rsi_period: 14, stoch_period: 14, k_period: 3, d_period: 3 },
      output,
    })),
  ];

  function values(ref: IndicatorRef, over: EvaluationCandle[]): (string | null)[] {
    const result = computeIndicatorSeries({ indicator: ref, timeframe: "1h" }, over);
    if (!result.supported) throw new Error(`${ref.id}: ${result.reason}`);
    return result.values;
  }

  it("covers every indicator a reference may name a price on", () => {
    const covered = [...new Set(LINES.map((ref) => ref.id))].sort();
    const priced = INDICATOR_CATALOGUE.map((entry) => entry.id).filter((id) => defaultFieldOf(id) !== null);
    expect(covered).toEqual(priced.sort());
  });

  for (const field of FIELDS) {
    it(`computes every line over the ${field} column the chart feeds it`, () => {
      const flattened = flattenedTo(field);
      for (const ref of LINES) {
        // Over the flattened close, not the reference's default: CCI defaults to
        // hlc3, and `(v + v + v) / 3` is not `v` in f64.
        expect(values({ ...ref, field }, history), `${ref.id}.${ref.output ?? "value"} over ${field}`).toEqual(
          values({ ...ref, field: "close" }, flattened),
        );
      }
    });
  }

  it("reads RSI over hl2 as the chart draws it, and not as it draws the close", () => {
    const hl2 = values({ ...rsi14, field: "hl2" }, history);
    const chart = Array.from(JSIndicators.rsi(getSourceData(rows, "hl2"), 14), (v) =>
      Number.isFinite(v) ? new Decimal(v).toFixed() : null,
    );
    expect(hl2).toEqual(chart);
    expect(hl2).not.toEqual(values(rsi14, history));
  });

  it("computes a reference naming the default price as the one naming none", () => {
    expect(values({ ...rsi14, field: "close" }, history)).toEqual(values(rsi14, history));
    const cci: IndicatorRef = { id: "cci", params: { period: 20 } };
    expect(values({ ...cci, field: "hlc3" }, history)).toEqual(values(cci, history));
    expect(values({ ...cci, field: "close" }, history)).not.toEqual(values(cci, history));
  });

  it("refuses a price on an indicator that is not computed over one", () => {
    const result = computeIndicatorSeries(
      { indicator: { id: "atr", params: { period: 14 }, field: "close" }, timeframe: "1h" },
      history,
    );
    expect(result).toEqual({
      supported: false,
      reason: "atr is not computed over a single price, so it takes no field",
    });
  });

  it("refuses a price it does not know rather than falling back to the close", () => {
    const result = computeIndicatorSeries(
      { indicator: { ...rsi14, field: "ohlc4" as never }, timeframe: "1h" },
      history,
    );
    expect(result).toEqual({ supported: false, reason: "rsi has no price 'ohlc4'" });
  });
});

describe("indicatorKey — the price an indicator is computed over (FEAT-0454)", () => {
  it("keeps one indicator over two prices apart", () => {
    expect(indicatorKey({ ...rsi14, field: "hl2" }, "1h")).not.toBe(indicatorKey(rsi14, "1h"));
  });

  it("files a reference naming the default price with the one naming none", () => {
    expect(indicatorKey({ ...rsi14, field: "close" }, "1h")).toBe(indicatorKey(rsi14, "1h"));
    const cci: IndicatorRef = { id: "cci", params: { period: 20 } };
    expect(indicatorKey({ ...cci, field: "hlc3" }, "1h")).toBe(indicatorKey(cci, "1h"));
  });
});
