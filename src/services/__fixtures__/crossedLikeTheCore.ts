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
 * BUG-0464 — what "crossed" means, for the test oracles that re-derive the
 * evaluator's verdicts.
 *
 * The core decides a cross strictly on the previous candle and inclusively on
 * this one (`technicals-wasm/src/rule/evaluate.rs`, `Condition::Cross`): a value
 * that reaches the level from below has crossed above it, and one that then
 * sits on the level does not cross again. The oracles had the other convention
 * — inclusive before, strict now, TradingView's `ta.crossover` — and the two
 * only part where a value lands exactly on the level, which no condition over
 * the fixtures did until Ichimoku's window midpoints.
 *
 * Kept as the core's on purpose, decided for FEAT-0446: price alerts migrated
 * from FEAT-0027 fire on reaching a level, and changing it would change when
 * they fire. One definition here, read by every oracle, and
 * `crossSemantics.integration.test.ts` checks it against the real evaluator on
 * exact ties.
 *
 * Takes the sign of `left - right` on each candle, so a caller comparing
 * `Decimal`s and one comparing numbers share it.
 */
export function crossedLikeTheCore(
  previousSign: number,
  currentSign: number,
  direction: "above" | "below",
): boolean {
  return direction === "above"
    ? previousSign < 0 && currentSign >= 0
    : previousSign > 0 && currentSign <= 0;
}

/** The sign of `a - b` for two numbers, without the subtraction's rounding. */
export function signOf(a: number, b: number): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
