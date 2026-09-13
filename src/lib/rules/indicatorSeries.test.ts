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
import { alertPathSourceOf } from "./alertPathIndicators";
import { computeIndicatorSeries } from "./indicatorSeries";
import { Decimal } from "decimal.js";

import { INDICATOR_CATALOGUE, defaultRef } from "../alerts/indicatorCatalogue";
import { JSIndicators } from "../../utils/indicators";
import { TechnicalsPresenter } from "../../utils/technicalsPresenter";
import { RECORDED_CANDLES } from "../../services/__fixtures__/recordedSeries";
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
   * The alert path reads a rolling buffer (FEAT-0446, "Found: OBV depends on the
   * loaded window"). A windowed indicator must not care where it starts. %R and
   * CCI recompute each window, so they agree exactly; choppiness, MFI and AO
   * slide running sums, so they agree to rounding. ATR is recursive and is left
   * out on purpose: like RSI and EMA it forgets its start geometrically rather
   * than not at all.
   */
  it("gives the windowed indicators the same value at a candle however much history precedes it", () => {
    const TRIM = 100;
    const lines: Array<[IndicatorRef, number, boolean]> = [
      [{ id: "williams_r", params: { period: 14 } }, 14, true],
      [{ id: "cci", params: { period: 20 } }, 20, true],
      [{ id: "choppiness", params: { period: 14 } }, 15, false],
      [{ id: "mfi", params: { period: 14 } }, 15, false],
      [{ id: "ao", params: { fast_period: 5, slow_period: 34 } }, 34, false],
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
