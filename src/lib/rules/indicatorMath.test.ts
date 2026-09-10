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
 * FEAT-0028 acceptance criterion 1 — the indicator maths, against an
 * independent implementation.
 *
 * `indicatorConditions.integration.test.ts` pins the condition semantics, but
 * takes the indicator values from the production path on both sides. This file
 * closes that: every reference below is written from the textbook definition,
 * naively, sharing no code with `utils/indicators.ts`. Where the two disagree,
 * one of them is wrong, and the disagreement names the index.
 *
 * ## The conventions being asserted
 *
 * These are choices, not laws, and the references encode the ones the
 * production path already makes:
 *
 * - **EMA** is seeded with the SMA of the first `period` values and emits its
 *   first value at index `period - 1`. The alternative — seeding with the first
 *   value — produces a visibly different curve for a hundred candles.
 * - **RSI** uses Wilder's smoothing and emits its first value at index
 *   `period`, which needs `period` price *changes* and therefore `period + 1`
 *   prices.
 * - **Bollinger** uses the population standard deviation (divide by `period`),
 *   not the sample one (`period - 1`).
 *
 * If a future change means to alter one of these, this file is where it says
 * so out loud.
 */

import { describe, expect, it } from "vitest";

import { CANDLE_SERIES } from "./__fixtures__/candleSeries";
import { computeIndicatorSeries } from "./indicatorSeries";

const CLOSES = CANDLE_SERIES.map((c) => Number(c.close));
const VOLUMES = CANDLE_SERIES.map((c) => Number(c.volume));

/**
 * Relative rather than absolute: these are prices near 50,000, where six
 * decimal places of absolute tolerance is stricter than `f64` can honour once
 * two implementations sum a window in a different order.
 */
const TOLERANCE = 1e-9;

function expectSeriesMatch(
  actual: (string | null)[],
  reference: (number | null)[],
  label: string,
): void {
  expect(actual).toHaveLength(reference.length);

  const problems: string[] = [];
  let checked = 0;

  for (let i = 0; i < reference.length; i++) {
    const ref = reference[i];
    const got = actual[i];

    if (ref === null) {
      if (got !== null) problems.push(`${label}[${i}]: expected no value, got ${got}`);
      continue;
    }
    if (got === null) {
      problems.push(`${label}[${i}]: expected ${ref}, got no value`);
      continue;
    }
    checked++;
    const delta = Math.abs(Number(got) - ref);
    if (delta > Math.max(Math.abs(ref), 1) * TOLERANCE) {
      problems.push(`${label}[${i}]: expected ${ref}, got ${got} (delta ${delta})`);
    }
  }

  expect(problems.slice(0, 5)).toEqual([]);
  // A reference that produced nothing but nulls would agree with anything.
  expect(checked).toBeGreaterThan(100);
}

function values(id: string, params: Record<string, number>, output?: string) {
  const result = computeIndicatorSeries(
    { indicator: { id, params, ...(output ? { output } : {}) }, timeframe: "1h" },
    CANDLE_SERIES,
  );
  if (!result.supported) throw new Error(result.reason);
  return result.values;
}

// ---------------------------------------------------------------------------
// Reference implementations. Naive on purpose: correct by inspection beats
// fast, because being obviously right is the entire job of an oracle.
// ---------------------------------------------------------------------------

function refSma(data: number[], period: number): (number | null)[] {
  return data.map((_, i) => {
    if (i < period - 1) return null;
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += data[j];
    return sum / period;
  });
}

function refEma(data: number[], period: number): (number | null)[] {
  const out: (number | null)[] = data.map(() => null);
  if (data.length < period) return out;

  let sum = 0;
  for (let i = 0; i < period; i++) sum += data[i];
  let ema = sum / period;
  out[period - 1] = ema;

  const k = 2 / (period + 1);
  for (let i = period; i < data.length; i++) {
    ema = (data[i] - ema) * k + ema;
    out[i] = ema;
  }
  return out;
}

/** EMA over a series that starts with nulls, as the MACD signal line does. */
function refEmaSkippingNulls(data: (number | null)[], period: number): (number | null)[] {
  const start = data.findIndex((v) => v !== null);
  if (start < 0) return data.map(() => null);

  const tail = data.slice(start) as number[];
  const emaTail = refEma(tail, period);
  return [...data.slice(0, start).map(() => null), ...emaTail];
}

function refRsi(data: number[], period: number): (number | null)[] {
  const out: (number | null)[] = data.map(() => null);
  if (data.length <= period) return out;

  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = data[i] - data[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < data.length; i++) {
    const diff = data[i] - data[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

function refBollinger(data: number[], period: number, stdDev: number) {
  const middle = refSma(data, period);
  const upper: (number | null)[] = [];
  const lower: (number | null)[] = [];

  for (let i = 0; i < data.length; i++) {
    const mean = middle[i];
    if (mean === null) {
      upper.push(null);
      lower.push(null);
      continue;
    }
    let sumSq = 0;
    for (let j = i - period + 1; j <= i; j++) sumSq += (data[j] - mean) ** 2;
    const sigma = Math.sqrt(sumSq / period);
    upper.push(mean + sigma * stdDev);
    lower.push(mean - sigma * stdDev);
  }
  return { middle, upper, lower };
}

function refMacd(data: number[], fast: number, slow: number, signal: number) {
  const emaFast = refEma(data, fast);
  const emaSlow = refEma(data, slow);
  const line = data.map((_, i) =>
    emaFast[i] === null || emaSlow[i] === null
      ? null
      : (emaFast[i] as number) - (emaSlow[i] as number),
  );
  return { line, signal: refEmaSkippingNulls(line, signal) };
}

// ---------------------------------------------------------------------------

describe("indicator maths against an independent implementation", () => {
  it("SMA matches a naive window mean", () => {
    expectSeriesMatch(values("sma", { period: 20 }), refSma(CLOSES, 20), "sma20");
  });

  it("EMA matches a textbook SMA-seeded exponential average", () => {
    expectSeriesMatch(values("ema", { period: 50 }), refEma(CLOSES, 50), "ema50");
  });

  it("EMA emits nothing before it has a full seeding window", () => {
    const short = values("ema", { period: 200 });
    expect(short.slice(0, 199).every((v) => v === null)).toBe(true);
    expect(short[199]).not.toBeNull();
  });

  it("RSI matches Wilder's smoothing", () => {
    expectSeriesMatch(values("rsi", { period: 14 }), refRsi(CLOSES, 14), "rsi14");
  });

  it("RSI stays inside its bounds over the whole series", () => {
    for (const v of values("rsi", { period: 14 })) {
      if (v === null) continue;
      expect(Number(v)).toBeGreaterThanOrEqual(0);
      expect(Number(v)).toBeLessThanOrEqual(100);
    }
  });

  describe("Bollinger Bands", () => {
    const reference = refBollinger(CLOSES, 20, 2);

    it("middle band matches the SMA", () => {
      expectSeriesMatch(values("bollinger", { period: 20, std_dev: 2 }, "middle"), reference.middle, "bbMiddle");
    });

    it("upper band matches mean plus two population standard deviations", () => {
      expectSeriesMatch(values("bollinger", { period: 20, std_dev: 2 }, "upper"), reference.upper, "bbUpper");
    });

    it("lower band matches mean minus two population standard deviations", () => {
      expectSeriesMatch(values("bollinger", { period: 20, std_dev: 2 }, "lower"), reference.lower, "bbLower");
    });

    it("percent_b places the close on the band the reference computed", () => {
      const percentB = values("bollinger", { period: 20, std_dev: 2 }, "percent_b");
      const expected = CLOSES.map((close, i) => {
        const u = reference.upper[i];
        const l = reference.lower[i];
        if (u === null || l === null || u === l) return null;
        return (close - l) / (u - l);
      });
      expectSeriesMatch(percentB, expected, "percentB");
    });
  });

  describe("MACD", () => {
    const params = { fast_period: 12, slow_period: 26, signal_period: 9 };
    const reference = refMacd(CLOSES, 12, 26, 9);

    it("line matches the difference of two textbook EMAs", () => {
      expectSeriesMatch(values("macd", params, "macd"), reference.line, "macdLine");
    });

    it("signal matches an EMA of the line", () => {
      expectSeriesMatch(values("macd", params, "signal"), reference.signal, "macdSignal");
    });

    it("histogram is exactly line minus signal", () => {
      const expected = reference.line.map((v, i) =>
        v === null || reference.signal[i] === null ? null : v - (reference.signal[i] as number),
      );
      expectSeriesMatch(values("macd", params, "histogram"), expected, "macdHistogram");
    });
  });

  it("volume_ma averages volume, not price", () => {
    expectSeriesMatch(values("volume_ma", { period: 20 }), refSma(VOLUMES, 20), "volumeMa20");
  });
});
