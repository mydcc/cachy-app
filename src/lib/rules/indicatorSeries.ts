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

import { JSIndicators } from "../../utils/indicators";
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

/** Registry identities this path can compute today. */
const SUPPORTED = new Set([
  "rsi",
  "macd",
  "bollinger",
  "ema",
  "sma",
  "wma",
  "vwma",
  "hma",
  "volume_ma",
]);

function column(
  candles: readonly EvaluationCandle[],
  field: "close" | "volume",
): Float64Array {
  const out = new Float64Array(candles.length);
  for (let i = 0; i < candles.length; i++) {
    const raw = field === "volume" ? candles[i].volume : candles[i].close;
    out[i] = raw === undefined ? Number.NaN : Number(raw);
  }
  return out;
}

function whole(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

function factor(value: unknown): number | undefined {
  const n = Number(value);
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

  if (!SUPPORTED.has(indicator.id)) {
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
      const fn = JSIndicators[indicator.id] as (
        d: Float64Array,
        p: number,
      ) => Float64Array;
      return { supported: true, values: wire(fn(close, period)) };
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
