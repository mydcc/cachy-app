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
 * FEAT-0439 — how far a WebGPU value may sit from the JS value before it is a
 * disagreement rather than single precision.
 *
 * ## Why no single constant
 *
 * `crossPathParity.test.ts` holds WASM and JS to `1e-9`, which is `f64` noise.
 * The shaders run in `f32`: 24 significand bits, so at BTC's 81,000 one
 * representable step is 0.0078. A bound in absolute price units would be too
 * loose for an RSI on a 0-100 scale, and a relative one tightens to nothing
 * where a MACD histogram crosses zero. The size of an honest bound depends on
 * the indicator's arithmetic and on the data, so it is derived per candle.
 *
 * ## The derivation
 *
 * First-order floating-point error analysis: every rounding introduces an
 * error of at most half a step, `ε·|x|/2` with `ε = 2⁻²³` (FLT_EPSILON), and to
 * first order those errors add rather than multiply.
 *
 * 1. **The inputs.** Every price the shader reads was rounded once, on upload
 *    (`Float32Array.from`). How far that moves output `i` is measured on the
 *    normative JS path itself: the series is recomputed with every input moved
 *    by one half-step, and the largest resulting shift is `q[i]`. No formula per
 *    indicator is written down, so none can be wrong per indicator.
 *
 *    One direction is not enough. Momentum is a difference of two closes, RSI
 *    and the stochastic are ratios of differences, a MACD line is a difference
 *    of two averages: a uniform shift cancels out of all of them and would
 *    report no sensitivity at all. What a difference needs is its two candles
 *    moved in *opposite* directions, whatever their distance. So the signs are
 *    taken from the bits of the candle index: pattern `k` moves candle `i` up
 *    when bit `k` of `i` is clear and down when it is set. Two different
 *    candles differ in at least one bit, so for every pair — neighbours, ten
 *    apart, a slow EMA's whole window — some pattern pulls them apart. The
 *    patterns tried, keeping the worst shift:
 *      - uniform, which is what moves an average,
 *      - each bit pattern on every series,
 *      - each bit pattern and its complement on close and volume, with highs
 *        up and lows down, which is what moves a range.
 *
 *    This is a family of sign choices, not a search over all of them, so `q`
 *    can fall short of the true worst case for an output that mixes many
 *    candles with mixed signs. The margin `(1 + m)` below is what covers that;
 *    a case that still breaks it is examined before any number is changed.
 *
 * 2. **The shader's own arithmetic.** Each rounding inside the shader costs at
 *    most one more step of the same size in output units — a sum of `n` prices
 *    is `n` times larger, but so is the divisor that turns it into an average.
 *    `m[i]` counts the rounding operations output `i` accumulates: the window
 *    for a windowed average, twice the period for a recursive one (an SMA seed
 *    plus a memory that contracts by `(1-α)` per candle and so sums to at most
 *    one more period), and the sum of the parts for a composite. The count is
 *    per case in `parityCases.ts`, next to the arithmetic it counts.
 *
 * So `bound[i] = (1 + m[i]) · max(q[i], ε·R)`, where `R` is the largest
 * magnitude the JS series reaches. The floor is the last stage's own rounding,
 * which happens at the output's scale: a Williams %R of exactly zero is still
 * computed on a 0-100 scale, and is not more precise for landing on zero.
 *
 * ## What the bound assumes
 *
 * A comparison flips when two inputs are closer than one `f32` step — an RSI
 * counting a change as a gain rather than a loss, a stochastic choosing another
 * candle's low. That is a discontinuity no first-order bound covers. It cannot
 * happen on the committed fixture: BTCUSDT ticks at 0.1, which below 131,072
 * is at least twelve `f32` steps, so two prices either coincide exactly or
 * differ by more than the rounding. Volume enters no comparison in any shader,
 * only sums and products, so its finer tick does not matter. A fixture with a
 * finer price tick at this magnitude needs the assumption re-checked, not the
 * bound loosened.
 */

/** FLT_EPSILON: the relative size of one `f32` step. */
export const F32_EPSILON = 2 ** -23;

/** The error one rounding can introduce, relative to the value rounded. */
export const HALF_STEP = F32_EPSILON / 2;

export interface InputSeries {
  high: Float64Array;
  low: Float64Array;
  close: Float64Array;
  volume: Float64Array;
}

type Scale = (i: number) => number;

function scaled(series: Float64Array, factor: Scale): Float64Array {
  return Float64Array.from(series, (x, i) => x * factor(i));
}

const up: Scale = () => 1 + HALF_STEP;
const down: Scale = () => 1 - HALF_STEP;
const byBit =
  (bit: number, flipped: boolean): Scale =>
  (i) =>
    ((i >> bit) & 1) === 1 !== flipped ? 1 - HALF_STEP : 1 + HALF_STEP;

/** Every way of moving the inputs by one half-step that the derivation above names. */
export function perturbations(input: InputSeries): InputSeries[] {
  const move = (high: Scale, low: Scale, close: Scale, volume: Scale): InputSeries => ({
    high: scaled(input.high, high),
    low: scaled(input.low, low),
    close: scaled(input.close, close),
    volume: scaled(input.volume, volume),
  });
  const patterns = [move(up, up, up, up)];
  const bits = Math.max(1, Math.ceil(Math.log2(input.close.length)));
  for (let bit = 0; bit < bits; bit++) {
    const s = byBit(bit, false);
    const complement = byBit(bit, true);
    patterns.push(move(s, s, s, s));
    patterns.push(move(up, down, s, s));
    patterns.push(move(up, down, complement, complement));
  }
  return patterns;
}

/**
 * `bound[i]`, or `NaN` where the JS path has no value (warmup) — those candles
 * are not compared, and a `NaN` bound makes any accidental comparison fail.
 */
export function derivedBound(
  reference: ArrayLike<number>,
  perturbed: ArrayLike<number>[],
  accumulates: (i: number) => number,
): Float64Array {
  let outputScale = 0;
  for (let i = 0; i < reference.length; i++) {
    if (Number.isFinite(reference[i])) outputScale = Math.max(outputScale, Math.abs(reference[i]));
  }
  const bound = new Float64Array(reference.length);
  for (let i = 0; i < reference.length; i++) {
    const exact = reference[i];
    if (!Number.isFinite(exact)) {
      bound[i] = Number.NaN;
      continue;
    }
    let sensitivity = F32_EPSILON * outputScale;
    for (const series of perturbed) {
      const shifted = series[i];
      // A perturbation that pushes a value out of existence (a range that
      // collapses) says nothing about its size; the other patterns still count.
      if (Number.isFinite(shifted)) sensitivity = Math.max(sensitivity, Math.abs(shifted - exact));
    }
    bound[i] = (1 + accumulates(i)) * sensitivity;
  }
  return bound;
}
