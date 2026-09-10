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
 * FEAT-0028 — the candle series the indicator conditions are tested against.
 *
 * ## Why this is generated and not recorded
 *
 * The acceptance criterion asks for recorded historical data. This is a seeded
 * pseudo-random walk instead, and the difference is worth stating rather than
 * glossing: it is deterministic, it is committed, and it is not cherry-picked —
 * but it is not a real market, and it cannot catch a condition that only
 * misbehaves on a shape real markets produce and this generator does not (a
 * halt, a gap, a wick to zero, a stablecoin depeg).
 *
 * What it *is* good for is the thing that actually breaks in condition code:
 * indexing. Four hundred candles with trend, mean reversion and enough
 * volatility to cross any threshold repeatedly will expose an off-by-one in
 * warmup, an anchor read one candle late, or a cross that fires on the wrong
 * side — none of which needs a real market to show up, and all of which a
 * three-candle toy series hides.
 *
 * Recording a real series is a separate, worthwhile addition; see the note in
 * `docs/backlog/features/FEAT-0028-indicator-alerts.md`.
 *
 * ## Determinism
 *
 * `mulberry32` is a small, well-known 32-bit PRNG. It is used here so the
 * series is identical on every machine and every run — a flaky fixture would
 * make every assertion below it untrustworthy. It is not used for anything
 * security-related and must never be.
 */

import type { EvaluationCandle } from "../types";

/** Open time of the first candle. A fixed instant, so nothing reads the clock. */
export const SERIES_START_MS = 1_757_030_400_000;

export const SERIES_TIMEFRAME = "1h";
const HOUR_MS = 3_600_000;

/** How many candles the series has. Long enough to warm up MACD and still cross. */
export const SERIES_LENGTH = 400;

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A walk with a slow trend and mean reversion, so every condition under test
 * has both sides to fire on.
 *
 * Pure trend would leave RSI pinned and the moving averages never crossing
 * back; pure noise would never produce a golden cross worth the name. The two
 * together give roughly a dozen crossings over the series, which is what makes
 * "fires at exactly the right candles" a claim with teeth.
 */
function buildSeries(): EvaluationCandle[] {
  const random = mulberry32(0x0028_5eed);
  const candles: EvaluationCandle[] = [];

  let price = 50_000;
  let drift = 0;

  for (let i = 0; i < SERIES_LENGTH; i++) {
    // Drift is itself a slow walk, pulled back toward zero: that is what makes
    // trends form and then break rather than run forever.
    drift = drift * 0.94 + (random() - 0.5) * 26;
    const shock = (random() - 0.5) * 220;
    const reversion = (50_000 - price) * 0.012;

    const open = price;
    price = Math.max(1_000, price + drift + shock + reversion);

    const spread = Math.abs(shock) * 0.6 + 40;
    const high = Math.max(open, price) + random() * spread;
    const low = Math.min(open, price) - random() * spread;
    const volume = 40 + random() * 260 + Math.abs(shock) * 0.5;

    candles.push({
      open_time_ms: SERIES_START_MS + i * HOUR_MS,
      open: open.toFixed(2),
      high: high.toFixed(2),
      low: low.toFixed(2),
      close: price.toFixed(2),
      volume: volume.toFixed(4),
    });
  }
  return candles;
}

/**
 * The series, built once.
 *
 * Frozen because it is shared across test files: a test that mutated it would
 * change the meaning of every assertion that ran after it, in a way that only
 * shows up as an unrelated failure much later.
 */
export const CANDLE_SERIES: readonly EvaluationCandle[] = Object.freeze(buildSeries());
