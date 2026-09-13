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
 * FEAT-0028 — computing the indicator series an alert reads.
 *
 * ## One normative path
 *
 * The JS implementations in `utils/indicators.ts` are the *only* path that
 * decides whether an alert fires. Not the WASM path, not the WebGPU path —
 * even when a chart on screen has already computed the same numbers there.
 *
 * The reason is that a trader's alert must not depend on whether a GPU context
 * happened to be available. `BUG-0005` is the standing proof that the paths do
 * diverge in this codebase, and a divergence that changes a verdict on a
 * money-moving surface is not a rendering artefact. Cross-path comparison is a
 * measurement (FEAT-0028 slice C), taken in tests and behind a developer
 * switch — never the thing that answers "did this fire".
 *
 * ## Precision
 *
 * Indicators are computed in `f64`, because every implementation of them is,
 * and are handed to the evaluator as decimal strings, because the evaluator
 * compares in `Decimal` and the wire format forbids `number`. That conversion
 * is a real seam and it lives here, once, rather than at each condition.
 *
 * `NaN` becomes `null`, which the core reads as "no value" and turns into an
 * indeterminate verdict. That is exactly right for a warmup gap: an alert that
 * cannot be evaluated must withhold, not answer `false`.
 */

import { Decimal } from "decimal.js";

import { calculateADXSeries, JSIndicators } from "../../utils/indicators";
import { ALERT_PATH_INDICATORS } from "./alertPathIndicators";
import type { IndicatorRequest } from "./indicatorRequests";
import { DEFAULT_OUTPUT } from "./indicatorRequests";
import type { DecimalString, EvaluationCandle } from "./types";

/**
 * The outcome of computing one series.
 *
 * `unsupported` is a first-class result rather than an exception or an array of
 * nulls, because those two are indistinguishable from a warmup gap at the call
 * site — and "this alert can never fire" must not look like "this alert has not
 * warmed up yet". That distinction is the whole point of this type.
 */
export type SeriesResult =
  | { supported: true; values: (DecimalString | null)[] }
  | { supported: false; reason: string };

function column(
  candles: readonly EvaluationCandle[],
  field: "high" | "low" | "close" | "volume",
): Float64Array {
  const out = new Float64Array(candles.length);
  for (let i = 0; i < candles.length; i++) {
    const raw = candles[i][field];
    out[i] = raw === undefined ? Number.NaN : Number(raw); // audit: safe — intermediate f64 for indicator math
  }
  return out;
}

/**
 * The typical price, `(high + low + close) / 3`.
 *
 * What CCI is defined over, what the WASM core computes it over, and what the
 * CCI settings card defaults to (`hlc3`) — see `alertPathSourceOf`.
 */
function typicalPrice(candles: readonly EvaluationCandle[]): Float64Array {
  const high = column(candles, "high");
  const low = column(candles, "low");
  const close = column(candles, "close");
  const out = new Float64Array(candles.length);
  for (let i = 0; i < candles.length; i++) out[i] = (high[i] + low[i] + close[i]) / 3;
  return out;
}

/**
 * Where the `period` candles ending at each index have no range: the highest
 * of `upper` equals the lowest of `lower`. `false` before a full window.
 */
function rangelessWindows(upper: Float64Array, lower: Float64Array, period: number): boolean[] {
  const out: boolean[] = new Array(upper.length).fill(false);
  for (let i = period - 1; i < upper.length; i++) {
    let highest = upper[i];
    let lowest = lower[i];
    for (let k = i - period + 1; k < i; k++) {
      if (upper[k] > highest) highest = upper[k];
      if (lower[k] < lowest) lowest = lower[k];
    }
    out[i] = highest === lowest;
  }
  return out;
}

/**
 * Where no money flowed either way over the `period` typical-price changes
 * ending at each index — MFI's `0 / 0`. Decided from the inputs rather than
 * from the running sums `JSIndicators.mfi` slides, which need not return to
 * exactly zero.
 */
function moneylessWindows(typical: Float64Array, volume: Float64Array, period: number): boolean[] {
  const out: boolean[] = new Array(typical.length).fill(false);
  for (let i = period; i < typical.length; i++) {
    let flowed = false;
    for (let k = i - period + 1; k <= i && !flowed; k++) {
      flowed = typical[k] !== typical[k - 1] && typical[k] * volume[k] !== 0;
    }
    out[i] = !flowed;
  }
  return out;
}

/**
 * `NaN` wherever `undefinedAt` holds. An indicator divided by a zero range has
 * no value there, and the chart's stand-in (0 for %R, choppiness and CCI, 50 for
 * MFI) is not a reading of the market: "%R above -20" would fire on a halted
 * one. `NaN` becomes `null` becomes indeterminate — the same decision as the
 * Bollinger bandwidth over a zero middle band.
 */
function withoutUndefined(values: Float64Array, undefinedAt: boolean[]): Float64Array {
  for (let i = 0; i < values.length; i++) if (undefinedAt[i]) values[i] = Number.NaN;
  return values;
}

/**
 * Undefined wherever any of the `span` positions ending there is: an average
 * over `span` values that include an undefined one is undefined too.
 */
function throughAverage(undefinedAt: boolean[], span: number): boolean[] {
  const out: boolean[] = new Array(undefinedAt.length).fill(false);
  let lastUndefined = -Infinity;
  for (let i = 0; i < undefinedAt.length; i++) {
    if (undefinedAt[i]) lastUndefined = i;
    out[i] = i - lastUndefined < span;
  }
  return out;
}

/**
 * One line picked by name out of several an indicator computes together, or a
 * refusal naming the line that does not exist.
 */
function lineNamed(
  id: string,
  output: string,
  lines: Readonly<Record<string, () => Float64Array>>,
): SeriesResult {
  const line = Object.hasOwn(lines, output) ? lines[output] : undefined;
  return line
    ? { supported: true, values: wire(line()) }
    : { supported: false, reason: `${id} has no output '${output}'` };
}

/** A single-line indicator refuses any output but its one line. */
function singleLine(id: string, output: string): SeriesResult | undefined {
  return output === DEFAULT_OUTPUT
    ? undefined
    : { supported: false, reason: `${id} has no output '${output}'` };
}

function whole(value: unknown): number | undefined {
  const n = Number(value); // audit: safe — helper validation, not a financial value
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

function factor(value: unknown): number | undefined {
  const n = Number(value); // audit: safe — helper validation, not a financial value
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * `f64` to the wire.
 *
 * `toFixed()` with no argument rather than `String(v)`: `String(1e-7)` is
 * `"1e-7"`, and the core parses decimals without accepting exponent notation,
 * so a small value would arrive as a refusal instead of a number.
 */
function wire(values: Float64Array): (DecimalString | null)[] {
  const out: (DecimalString | null)[] = new Array(values.length);
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    out[i] = Number.isFinite(v) ? new Decimal(v).toFixed() : null;
  }
  return out;
}

function derive(
  left: Float64Array,
  right: Float64Array,
  op: (a: number, b: number) => number,
): Float64Array {
  const out = new Float64Array(left.length);
  for (let i = 0; i < left.length; i++) out[i] = op(left[i], right[i]);
  return out;
}

/**
 * Compute one requested series over `candles`, index-aligned to them.
 *
 * Returns `unsupported` rather than silently producing nulls when the identity,
 * an output line, or a parameter is something this path cannot honour — see
 * `SeriesResult`.
 */
export function computeIndicatorSeries(
  request: IndicatorRequest,
  candles: readonly EvaluationCandle[],
): SeriesResult {
  const { indicator } = request;
  const output = indicator.output ?? DEFAULT_OUTPUT;
  const params = indicator.params ?? {};

  if (!ALERT_PATH_INDICATORS.has(indicator.id)) {
    return {
      supported: false,
      reason: `indicator '${indicator.id}' has no JavaScript implementation on the alert path`,
    };
  }
  if (candles.length === 0) return { supported: true, values: [] };

  const close = column(candles, "close");

  switch (indicator.id) {
    case "rsi": {
      const period = whole(params.period);
      if (period === undefined)
        return { supported: false, reason: "rsi needs a whole period" };
      if (output !== DEFAULT_OUTPUT) {
        return { supported: false, reason: `rsi has no output '${output}'` };
      }
      return { supported: true, values: wire(JSIndicators.rsi(close, period)) };
    }

    case "ema":
    case "sma":
    case "wma":
    case "hma": {
      const period = whole(params.period);
      if (period === undefined) {
        return {
          supported: false,
          reason: `${indicator.id} needs a whole period`,
        };
      }
      if (output !== DEFAULT_OUTPUT) {
        return {
          supported: false,
          reason: `${indicator.id} has no output '${output}'`,
        };
      }
      // Called through the object, never detached: `hma` builds on `this.wma`,
      // and a detached call threw on every close (BUG-0449).
      const id = indicator.id as "ema" | "sma" | "wma" | "hma";
      return { supported: true, values: wire(JSIndicators[id](close, period)) };
    }

    case "momentum": {
      const period = whole(params.period);
      if (period === undefined) {
        return { supported: false, reason: "momentum needs a whole period" };
      }
      if (output !== DEFAULT_OUTPUT) {
        return {
          supported: false,
          reason: `momentum has no output '${output}'`,
        };
      }
      // The close against the close a full period back: nothing accumulates, so
      // the value at a candle does not depend on where the rolling buffer starts.
      return { supported: true, values: wire(JSIndicators.mom(close, period)) };
    }

    case "williams_r":
    case "cci":
    case "atr":
    case "choppiness":
    case "mfi": {
      const period = whole(params.period);
      if (period === undefined) {
        return { supported: false, reason: `${indicator.id} needs a whole period` };
      }
      const refused = singleLine(indicator.id, output);
      if (refused) return refused;
      const high = column(candles, "high");
      const low = column(candles, "low");
      const typical = typicalPrice(candles);
      const lines: Record<string, () => Float64Array> = {
        williams_r: () =>
          withoutUndefined(
            JSIndicators.williamsR(high, low, close, period),
            rangelessWindows(high, low, period),
          ),
        // Over the typical price, the price `alertPathSourceOf("cci")` names.
        cci: () =>
          withoutUndefined(
            JSIndicators.cci(typical, period),
            rangelessWindows(typical, typical, period),
          ),
        // A zero ATR is a reading — no movement at all — so it is kept.
        atr: () => JSIndicators.atr(high, low, close, period),
        choppiness: () =>
          withoutUndefined(
            JSIndicators.choppiness(high, low, close, period),
            rangelessWindows(high, low, period),
          ),
        mfi: () => {
          const volume = column(candles, "volume");
          return withoutUndefined(
            JSIndicators.mfi(high, low, close, volume, period, typical),
            moneylessWindows(typical, volume, period),
          );
        },
      };
      return { supported: true, values: wire(lines[indicator.id]()) };
    }

    case "ao": {
      const fast = whole(params.fast_period);
      const slow = whole(params.slow_period);
      if (fast === undefined || slow === undefined) {
        return { supported: false, reason: "ao needs whole fast and slow periods" };
      }
      const refused = singleLine("ao", output);
      if (refused) return refused;
      const high = column(candles, "high");
      const low = column(candles, "low");
      const values = JSIndicators.ao(high, low, fast, slow);
      // `calculateAwesomeOscillator` writes 0 rather than NaN before its slower
      // average has a full window. On the chart that is a flat line; here it
      // would be a real value, so "AO above 0" would answer false and "AO
      // crosses above 0" could fire at the end of warmup. No value is null.
      const warm = Math.max(fast, slow) - 1;
      for (let i = 0; i < Math.min(warm, values.length); i++) values[i] = Number.NaN;
      return { supported: true, values: wire(values) };
    }

    case "stochastic": {
      const kPeriod = whole(params.k_period);
      const kSmoothing = whole(params.k_smoothing);
      const dPeriod = whole(params.d_period);
      if (kPeriod === undefined || kSmoothing === undefined || dPeriod === undefined) {
        return {
          supported: false,
          reason: "stochastic needs whole k_period, k_smoothing and d_period",
        };
      }
      const high = column(candles, "high");
      const low = column(candles, "low");
      // Computed with the chart's 50 over a window with no range, then nulled
      // there: a NaN inside would stay in both averages' running sums for good.
      const k = JSIndicators.sma(JSIndicators.stoch(high, low, close, kPeriod), kSmoothing);
      const kUndefined = throughAverage(rangelessWindows(high, low, kPeriod), kSmoothing);
      return lineNamed("stochastic", output, {
        k: () => withoutUndefined(Float64Array.from(k), kUndefined),
        d: () => withoutUndefined(JSIndicators.sma(k, dPeriod), throughAverage(kUndefined, dPeriod)),
      });
    }

    case "stoch_rsi": {
      const rsiPeriod = whole(params.rsi_period);
      const stochPeriod = whole(params.stoch_period);
      const kPeriod = whole(params.k_period);
      const dPeriod = whole(params.d_period);
      if (
        rsiPeriod === undefined ||
        stochPeriod === undefined ||
        kPeriod === undefined ||
        dPeriod === undefined
      ) {
        return {
          supported: false,
          reason: "stoch_rsi needs whole rsi_period, stoch_period, k_period and d_period",
        };
      }
      // The stochastic of the RSI over `stoch_period`, %K smoothed by `k_period`
      // — the chart's function, argument for argument (BUG-0460).
      const lines = JSIndicators.stochRsi(close, rsiPeriod, stochPeriod, dPeriod, kPeriod);
      const rsi = JSIndicators.rsi(close, rsiPeriod);
      // An RSI that did not move over the window has no stochastic, as a price
      // range of zero has none for %R.
      const kUndefined = throughAverage(rangelessWindows(rsi, rsi, stochPeriod), kPeriod);
      return lineNamed("stoch_rsi", output, {
        k: () => withoutUndefined(lines.k, kUndefined),
        d: () => withoutUndefined(lines.d, throughAverage(kUndefined, dPeriod)),
      });
    }

    case "adx": {
      const period = whole(params.period);
      if (period === undefined) {
        return { supported: false, reason: "adx needs a whole period" };
      }
      // One period for the directional smoothing and the ADX's own, as the core
      // declares it. A card whose two lengths differ refuses to arm
      // (`cardAlertAvailability`, "length-mismatch").
      const lines = calculateADXSeries(
        column(candles, "high"),
        column(candles, "low"),
        close,
        period,
        period,
      );
      return lineNamed("adx", output, {
        adx: () => lines.adx,
        plus_di: () => lines.pdi,
        minus_di: () => lines.mdi,
      });
    }

    case "super_trend": {
      const period = whole(params.period);
      const multiplier = factor(params.factor);
      if (period === undefined || multiplier === undefined) {
        return {
          supported: false,
          reason: "super_trend needs a whole period and a positive factor",
        };
      }
      // `value` is the band the trend stands on: the lower band in an uptrend,
      // the upper one in a downtrend. A close crossing it is the flip.
      const lines = JSIndicators.superTrend(
        column(candles, "high"),
        column(candles, "low"),
        close,
        period,
        multiplier,
      );
      return lineNamed("super_trend", output, {
        value: () => lines.value,
        upper: () => lines.upper,
        lower: () => lines.lower,
      });
    }

    case "volume_ma": {
      const period = whole(params.period);
      if (period === undefined) {
        return { supported: false, reason: "volume_ma needs a whole period" };
      }
      if (output !== DEFAULT_OUTPUT) {
        return {
          supported: false,
          reason: `volume_ma has no output '${output}'`,
        };
      }
      return {
        supported: true,
        values: wire(JSIndicators.sma(column(candles, "volume"), period)),
      };
    }

    case "vwma": {
      const period = whole(params.period);
      if (period === undefined)
        return { supported: false, reason: "vwma needs a whole period" };
      if (output !== DEFAULT_OUTPUT) {
        return { supported: false, reason: `vwma has no output '${output}'` };
      }
      const volume = column(candles, "volume");
      return {
        supported: true,
        values: wire(JSIndicators.vwma(close, volume, period)),
      };
    }

    case "macd": {
      const fast = whole(params.fast_period);
      const slow = whole(params.slow_period);
      const signal = whole(params.signal_period);
      if (fast === undefined || slow === undefined || signal === undefined) {
        return {
          supported: false,
          reason: "macd needs whole fast, slow and signal periods",
        };
      }
      const lines = JSIndicators.macd(close, fast, slow, signal);
      if (output === "macd")
        return { supported: true, values: wire(lines.macd) };
      if (output === "signal")
        return { supported: true, values: wire(lines.signal) };
      if (output === "histogram") {
        // The core's registry declares a histogram; `JSIndicators.macd` returns
        // only the two lines it is the difference of.
        return {
          supported: true,
          values: wire(derive(lines.macd, lines.signal, (a, b) => a - b)),
        };
      }
      return { supported: false, reason: `macd has no output '${output}'` };
    }

    case "bollinger": {
      const period = whole(params.period);
      const stdDev = factor(params.std_dev);
      if (period === undefined || stdDev === undefined) {
        return {
          supported: false,
          reason: "bollinger needs a whole period and a positive std_dev",
        };
      }
      const bands = JSIndicators.bb(close, period, stdDev);
      if (output === "upper")
        return { supported: true, values: wire(bands.upper) };
      if (output === "middle")
        return { supported: true, values: wire(bands.middle) };
      if (output === "lower")
        return { supported: true, values: wire(bands.lower) };
      if (output === "percent_b") {
        // Derived, like the histogram above. A zero-width band is undefined
        // rather than infinite: `NaN` becomes `null` becomes indeterminate.
        const percentB = new Float64Array(close.length);
        for (let i = 0; i < close.length; i++) {
          const width = bands.upper[i] - bands.lower[i];
          percentB[i] =
            width === 0 ? Number.NaN : (close[i] - bands.lower[i]) / width;
        }
        return { supported: true, values: wire(percentB) };
      }
      if (output === "bandwidth") {
        // The squeeze measure, as a percentage of the middle band.
        //
        // Times 100, matching `TechnicalsPresenter.calculateBollingerBandWidth`
        // and the `%` the panel prints beside it. The bare ratio is the more
        // common convention elsewhere and is deliberately not used: a trader who
        // reads `2.41%` on the panel and writes `bandwidth < 2.41` would get a
        // condition true on every candle. See the registry entry in
        // `technicals-wasm/src/rule/indicator.rs`.
        //
        // A middle band of zero is undefined, not zero. `0` would read as the
        // tightest band possible and fire every squeeze alert on data that
        // simply is not there — `NaN` becomes `null` becomes indeterminate.
        const bandwidth = new Float64Array(close.length);
        for (let i = 0; i < close.length; i++) {
          const middle = bands.middle[i];
          bandwidth[i] =
            middle === 0
              ? Number.NaN
              : ((bands.upper[i] - bands.lower[i]) / middle) * 100;
        }
        return { supported: true, values: wire(bandwidth) };
      }
      return {
        supported: false,
        reason: `bollinger has no output '${output}'`,
      };
    }
  }

  return {
    supported: false,
    reason: `indicator '${indicator.id}' fell through`,
  };
}
