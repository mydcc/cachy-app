/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/*
 * FEAT-0797 — matching the displayed pivot levels back to the candle they came
 * from.
 *
 * The calculator builds the levels from the second-newest bar
 * (`src/utils/technicalsCalculator.ts`, `closesNum.length - 2`) and hands the
 * H/L/C it used back as `pivotBasis`. The timestamp is not part of that
 * payload, so the panel looks the candle up in the series it already holds.
 *
 * This is display-only float math (ADR-0021): the values are indicator inputs,
 * never money, and nothing here feeds a calculation. The comparison is a
 * near-equality rather than `===` on purpose — `pivotBasis` and the series can
 * arrive from different paths (the WASM indicator route recomputes from its
 * own buffer), and one differing last bit would drop the timestamp. A missing
 * timestamp reads exactly like "the candle is gone", so the failure would stay
 * invisible.
 *
 * Kept free of imports: `src/utils` sits below `services` and `stores` in the
 * layering, and a type import from there would be an uphill edge in the
 * import-graph ratchet (BUG-0799). The structural types below are all this
 * module needs.
 */

/** The values the calculator consumed; only H/L/C identify the candle. */
export interface PivotBasisLike {
  high: number;
  low: number;
  close: number;
}

/**
 * The subset of a kline this lookup reads. The fields are `unknown` because the
 * series carries `Decimal` values while a test or a replay may carry plain
 * numbers — `Number()` is the single coercion both understand.
 */
export interface PivotCandleLike {
  time: unknown;
  high: unknown;
  low: unknown;
  close: unknown;
}

/**
 * Relative tolerance for "the same price" — 1e-9 of the value's magnitude.
 * f64 differences between two computation paths land around 1e-16 relative, so
 * this is four orders of magnitude of headroom while still being far below one
 * tick on any instrument (a $100,000 price gets 1e-4 absolute).
 */
const BASIS_TOLERANCE = 1e-9;

/**
 * How far back from the tail the basis candle may sit. The calculator uses the
 * second-newest bar, so one is enough in practice; a few more keep the row
 * working across a late append (a new candle landed before the recalculation).
 */
const BASIS_LOOKBACK = 5;

function samePrice(a: number, b: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) <= BASIS_TOLERANCE * Math.max(1, Math.abs(a), Math.abs(b));
}

/**
 * The timestamp of the bar whose H/L/C produced `basis`, or `null` when the
 * series no longer holds that bar. `null` is deliberate: a guessed timestamp
 * would label the levels with the wrong candle, which is worse than none.
 */
export function findBasisCandleTime(
  klines: readonly PivotCandleLike[],
  basis: PivotBasisLike,
  lookback: number = BASIS_LOOKBACK,
): number | null {
  const oldest = Math.max(0, klines.length - Math.max(1, lookback));

  for (let index = klines.length - 1; index >= oldest; index--) {
    const kline = klines[index];
    if (
      samePrice(Number(kline.high), basis.high) &&
      samePrice(Number(kline.low), basis.low) &&
      samePrice(Number(kline.close), basis.close)
    ) {
      const time = Number(kline.time);
      return Number.isFinite(time) ? time : null;
    }
  }

  return null;
}
