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
 * FEAT-0439 — the browser half of the WebGPU parity suite.
 *
 * Bundled by `webGpuParity.spec.ts` and run inside Chromium, because the GPU
 * leg needs a live `navigator.gpu`. Every case runs the production
 * `WebGpuCalculator` method that `calculate()` calls and the `JSIndicators`
 * function the alert path's `computeIndicatorSeries` calls, over the same
 * recorded series, and returns both with the derived bound. The assertions
 * live in the spec, in Node, where a failure can name the candle.
 */

import { WebGpuCalculator, utcSessionStarts } from "../../src/services/webGpuCalculator";
import { JSIndicators } from "../../src/utils/indicators";
import { derivedBound, perturbations, type InputSeries } from "./f32Bound";

interface GpuSeries {
  high: Float32Array;
  low: Float32Array;
  close: Float32Array;
  volume: Float32Array;
  sessionStart: Uint32Array;
}

interface Context {
  time: Float64Array;
  /** Candles since the current UTC session began, counting this one. */
  sessionAge: Uint32Array;
}

export interface ParityCase {
  label: string;
  /** The WGSL files (basename, no extension) this case executes. */
  shaders: readonly string[];
  /**
   * `m[i]` in `f32Bound.ts`: the rounding operations output `i` accumulates
   * inside the shader and its composition. The arithmetic behind each number is
   * spelled out next to it.
   */
  accumulates: (i: number, ctx: Context) => number;
  gpu: (calc: WebGpuCalculator, s: GpuSeries) => Promise<Float32Array>;
  js: (s: InputSeries, ctx: Context) => ArrayLike<number>;
}

const typical = (s: InputSeries): Float64Array =>
  Float64Array.from(s.close, (c, i) => (s.high[i] + s.low[i] + c) / 3);

const stochasticK = (s: InputSeries): Float64Array =>
  JSIndicators.sma(JSIndicators.stoch(s.high, s.low, s.close, 14), 3);

export const PARITY_CASES: readonly ParityCase[] = [
  // A window of 20 additions; the division rounds once more but is cancelled by
  // the same factor that scales the sum.
  { label: "SMA(20)", shaders: ["sma"], accumulates: () => 20, gpu: (g, s) => g.calculateSma(s.close, 20), js: (s) => JSIndicators.sma(s.close, 20) },
  // SMA seed (20) plus a memory contracting by (1-α) per candle: at most one more period.
  { label: "EMA(20)", shaders: ["ema"], accumulates: () => 40, gpu: (g, s) => g.calculateEma(s.close, 20), js: (s) => JSIndicators.ema(s.close, 20) },
  { label: "WMA(20)", shaders: ["wma"], accumulates: () => 20, gpu: (g, s) => g.calculateWma(s.close, 20), js: (s) => JSIndicators.wma(s.close, 20) },
  // Two windowed sums — price×volume and volume — then their ratio.
  {
    label: "VWMA(20)",
    shaders: ["vwma"],
    accumulates: () => 40,
    gpu: (g, s) => g.calculateVwma(s.close, s.volume, 20),
    js: (s) => JSIndicators.vwma(s.close, s.volume, 20),
  },
  // WMA(10) enters doubled, WMA(20) once, then WMA(√20 = 4) over the result: 2·10 + 20 + 4.
  { label: "HMA(20)", shaders: ["wma"], accumulates: () => 44, gpu: (g, s) => g.calculateHma(s.close, 20), js: (s) => JSIndicators.hma(s.close, 20) },
  // Wilder: an SMA seed of gains and losses (14) and a contracting memory (14).
  { label: "RSI(14)", shaders: ["rsi"], accumulates: () => 28, gpu: (g, s) => g.calculateRsi(s.close, 14), js: (s) => JSIndicators.rsi(s.close, 14) },
  // One subtraction.
  { label: "Momentum(10)", shaders: ["momentum"], accumulates: () => 1, gpu: (g, s) => g.calculateMomentum(s.close, 10), js: (s) => JSIndicators.mom(s.close, 10) },
  // Extremes are exact; (close − low), (high − low), the ratio, ×100.
  {
    label: "Williams %R(14)",
    shaders: ["williams_r"],
    accumulates: () => 4,
    gpu: (g, s) => g.calculateWilliamsR(s.high, s.low, s.close, 14),
    js: (s) => JSIndicators.williamsR(s.high, s.low, s.close, 14),
  },
  // Typical price (3), its window mean (20), the mean deviation (20), the ratio (2).
  {
    label: "CCI(20)",
    shaders: ["cci"],
    accumulates: () => 45,
    gpu: (g, s) => g.calculateCci(s.high, s.low, s.close, 20),
    js: (s) => JSIndicators.cci(typical(s), 20),
  },
  // Wilder, as RSI: seed (14) and memory (14).
  { label: "ATR(14)", shaders: ["atr"], accumulates: () => 28, gpu: (g, s) => g.calculateAtr(s.high, s.low, s.close, 14), js: (s) => JSIndicators.atr(s.high, s.low, s.close, 14) },
  // A window of 14 true ranges, the range, their ratio and a logarithm.
  {
    label: "Choppiness(14)",
    shaders: ["choppiness"],
    accumulates: () => 18,
    gpu: (g, s) => g.calculateChoppiness(s.high, s.low, s.close, 14),
    js: (s) => JSIndicators.choppiness(s.high, s.low, s.close, 14),
  },
  // Typical price (3), positive and negative flow sums (2·14), the ratio (2).
  {
    label: "MFI(14)",
    shaders: ["mfi"],
    accumulates: () => 33,
    gpu: (g, s) => g.calculateMfi(s.high, s.low, s.close, s.volume, 14),
    js: (s) => JSIndicators.mfi(s.high, s.low, s.close, s.volume, 14),
  },
  // Two Wilder stages, the directional indices and then the ADX over them: 2 · (14 + 14).
  { label: "ADX(14)", shaders: ["adx"], accumulates: () => 56, gpu: (g, s) => g.calculateAdx(s.high, s.low, s.close, 14), js: (s) => JSIndicators.adx(s.high, s.low, s.close, 14) },
  // Raw %K (4, as Williams %R), then two 3-candle averages.
  {
    label: "Stochastic %K",
    shaders: ["stoch_raw", "sma"],
    accumulates: () => 7,
    gpu: async (g, s) => (await g.calculateStochastic(s.high, s.low, s.close, 14, 3, 3)).k,
    js: stochasticK,
  },
  {
    label: "Stochastic %D",
    shaders: ["stoch_raw", "sma"],
    accumulates: () => 10,
    gpu: async (g, s) => (await g.calculateStochastic(s.high, s.low, s.close, 14, 3, 3)).d,
    js: (s) => JSIndicators.sma(stochasticK(s), 3),
  },
  // An ATR(10) (2·10) and the band arithmetic around hl2 (3). The band recursion
  // selects between values and rounds nothing. Composed as `calculate()` composes it.
  {
    label: "SuperTrend(10,3)",
    shaders: ["atr", "supertrend"],
    accumulates: () => 23,
    gpu: async (g, s) => {
      const atr = await g.calculateAtr(s.high, s.low, s.close, 10);
      return (await g.calculateSuperTrend(s.high, s.low, s.close, atr, 3, 10)).supertrend;
    },
    js: (s) => JSIndicators.superTrend(s.high, s.low, s.close, 10, 3).value,
  },
  // Two cumulative sums since the session began, and the typical price (3).
  {
    label: "VWAP (UTC session)",
    shaders: ["vwap"],
    accumulates: (i, ctx) => 2 * ctx.sessionAge[i] + 3,
    gpu: (g, s) => g.calculateVwap(s.high, s.low, s.close, s.volume, s.sessionStart),
    js: (s, ctx) => JSIndicators.vwap(s.high, s.low, s.close, s.volume, ctx.time, { mode: "session" }),
  },
  // Fast EMA (2·12) and slow EMA (2·26).
  {
    label: "MACD line",
    shaders: ["ema"],
    accumulates: () => 76,
    gpu: async (g, s) => (await g.calculateMacd(s.close, 12, 26, 9)).macdLine,
    js: (s) => JSIndicators.macd(s.close, 12, 26, 9).macd,
  },
  // The line (76) and an EMA(9) over it (2·9).
  {
    label: "MACD signal",
    shaders: ["ema"],
    accumulates: () => 94,
    gpu: async (g, s) => (await g.calculateMacd(s.close, 12, 26, 9)).signalLine,
    js: (s) => JSIndicators.macd(s.close, 12, 26, 9).signal,
  },
  // Line minus signal: both error budgets.
  {
    label: "MACD histogram",
    shaders: ["ema"],
    accumulates: () => 170,
    gpu: async (g, s) => (await g.calculateMacd(s.close, 12, 26, 9)).histogram,
    js: (s) => {
      const { macd, signal } = JSIndicators.macd(s.close, 12, 26, 9);
      return Float64Array.from(macd, (m, i) => m - signal[i]);
    },
  },
  // The basis (20) plus twice a standard deviation: its mean (20), its squared
  // deviations (20) and the root (1), doubled by the multiplier.
  {
    label: "Bollinger upper",
    shaders: ["sma", "stddev"],
    accumulates: () => 102,
    gpu: async (g, s) => (await g.calculateBollinger(s.close, 20, 2)).upper,
    js: (s) => JSIndicators.bb(s.close, 20, 2).upper,
  },
  {
    label: "Bollinger lower",
    shaders: ["sma", "stddev"],
    accumulates: () => 102,
    gpu: async (g, s) => (await g.calculateBollinger(s.close, 20, 2)).lower,
    js: (s) => JSIndicators.bb(s.close, 20, 2).lower,
  },
];

export interface RecordedCandle {
  open_time_ms: number;
  high: string;
  low: string;
  close: string;
  volume: string;
}

export interface CaseResult {
  label: string;
  shaders: readonly string[];
  /** `null` where a value is not finite; the wire carries no `NaN`. */
  gpu: (number | null)[];
  js: (number | null)[];
  bound: (number | null)[];
}

export interface ParityRun {
  adapter: string | null;
  results: CaseResult[];
}

const wire = (values: ArrayLike<number>): (number | null)[] =>
  Array.from(values, (v) => (Number.isFinite(v) ? v : null));

export async function runParity(candles: readonly RecordedCandle[]): Promise<ParityRun> {
  const adapter = navigator.gpu ? await navigator.gpu.requestAdapter() : null;
  if (!adapter) return { adapter: null, results: [] };
  const info = adapter.info;
  const adapterName = [info?.vendor, info?.architecture, info?.description].filter(Boolean).join(" ") || "unnamed adapter";

  const column = (key: keyof Omit<RecordedCandle, "open_time_ms">) => Float64Array.from(candles, (c) => Number(c[key]));
  const exact: InputSeries = { high: column("high"), low: column("low"), close: column("close"), volume: column("volume") };
  const time = Float64Array.from(candles, (c) => c.open_time_ms);
  const sessionStart = utcSessionStarts(time);
  const sessionAge = new Uint32Array(candles.length);
  for (let i = 0; i < candles.length; i++) sessionAge[i] = sessionStart[i] === 1 || i === 0 ? 1 : sessionAge[i - 1] + 1;
  const ctx: Context = { time, sessionAge };

  const gpuSeries: GpuSeries = {
    high: Float32Array.from(exact.high),
    low: Float32Array.from(exact.low),
    close: Float32Array.from(exact.close),
    volume: Float32Array.from(exact.volume),
    sessionStart,
  };
  const shifted = perturbations(exact);

  const calculator = new WebGpuCalculator();
  await calculator.init();

  const results: CaseResult[] = [];
  for (const c of PARITY_CASES) {
    const reference = c.js(exact, ctx);
    const bound = derivedBound(
      reference,
      shifted.map((s) => c.js(s, ctx)),
      (i) => c.accumulates(i, ctx),
    );
    results.push({
      label: c.label,
      shaders: c.shaders,
      gpu: wire(await c.gpu(calculator, gpuSeries)),
      js: wire(reference),
      bound: wire(bound),
    });
  }
  return { adapter: adapterName, results };
}
