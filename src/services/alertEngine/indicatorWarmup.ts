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
 * How much history each indicator parameterisation needs before it has a value.
 *
 * This table used to live inside `crossPathParity.test.ts`. FEAT-0438 needs the
 * same numbers to decide when a condition may be asserted against recorded
 * history, and two tables that must agree and are maintained separately do not
 * stay agreeing — so there is one, here, and both tests import it.
 *
 * `needs` is not decoration. `TechnicalsCalculator.initialize` decides once,
 * from the history it is handed, whether an indicator is initialised at all —
 * an EMA(50) seeded with 40 candles stays silent rather than starting late. A
 * sweep from 40 candles therefore legitimately cannot compare it, and a test
 * that asserts it anyway is asserting absence and calling it agreement.
 */

import type { IndicatorRef, ParamValue } from "../../lib/rules/types";

export interface IndicatorWarmup {
  /** Human-readable, and the join key `crossPathParity.test.ts` uses. */
  label: string;
  /** Candles of history before this parameterisation yields its first value. */
  needs: number;
  ref: IndicatorRef;
}

export const INDICATOR_WARMUP: IndicatorWarmup[] = [
  { label: "SMA(20)", needs: 20, ref: { id: "sma", params: { period: 20 } } },
  { label: "SMA(50)", needs: 50, ref: { id: "sma", params: { period: 50 } } },
  { label: "SMA(200)", needs: 200, ref: { id: "sma", params: { period: 200 } } },
  { label: "EMA(20)", needs: 20, ref: { id: "ema", params: { period: 20 } } },
  { label: "EMA(50)", needs: 50, ref: { id: "ema", params: { period: 50 } } },
  { label: "WMA(20)", needs: 20, ref: { id: "wma", params: { period: 20 } } },
  { label: "VWMA(20)", needs: 20, ref: { id: "vwma", params: { period: 20 } } },
  // WMA(√20) over WMA(20)-derived values: 20 + floor(√20) − 1.
  { label: "HMA(20)", needs: 23, ref: { id: "hma", params: { period: 20 } } },
  { label: "VolumeMA(20)", needs: 20, ref: { id: "volume_ma", params: { period: 20 } } },
  { label: "RSI(14)", needs: 15, ref: { id: "rsi", params: { period: 14 } } },
  // The change against the close a full period back, so one candle more than the period.
  { label: "Momentum(10)", needs: 11, ref: { id: "momentum", params: { period: 10 } } },
  { label: "Williams %R(14)", needs: 14, ref: { id: "williams_r", params: { period: 14 } } },
  { label: "CCI(20)", needs: 20, ref: { id: "cci", params: { period: 20 } } },
  // The first candle has no true range (BUG-0456), so a full period of them needs one more.
  { label: "ATR(14)", needs: 15, ref: { id: "atr", params: { period: 14 } } },
  { label: "Choppiness(14)", needs: 15, ref: { id: "choppiness", params: { period: 14 } } },
  // Money flow is a change between typical prices, so the first candle carries none.
  { label: "MFI(14)", needs: 15, ref: { id: "mfi", params: { period: 14 } } },
  { label: "AO(5,34)", needs: 34, ref: { id: "ao", params: { fast_period: 5, slow_period: 34 } } },
  { label: "MACD line", needs: 34, ref: { id: "macd", params: { fast_period: 12, slow_period: 26, signal_period: 9 }, output: "macd" } },
  { label: "MACD signal", needs: 34, ref: { id: "macd", params: { fast_period: 12, slow_period: 26, signal_period: 9 }, output: "signal" } },
  { label: "MACD histogram", needs: 34, ref: { id: "macd", params: { fast_period: 12, slow_period: 26, signal_period: 9 }, output: "histogram" } },
  { label: "Bollinger upper", needs: 20, ref: { id: "bollinger", params: { period: 20, std_dev: 2 }, output: "upper" } },
  { label: "Bollinger lower", needs: 20, ref: { id: "bollinger", params: { period: 20, std_dev: 2 }, output: "lower" } },
  { label: "Bollinger basis", needs: 20, ref: { id: "bollinger", params: { period: 20, std_dev: 2 }, output: "middle" } },
];

/**
 * The warmup for one indicator reference, or `undefined` when the table does
 * not carry that parameterisation.
 *
 * Matched on id and parameters only. `output` picks a line out of an indicator
 * that is already computed — MACD's signal is not available earlier or later
 * than its histogram — so an entry differing only in `output` shares a warmup
 * and the first match is the right one.
 */
export function warmupFor(ref: IndicatorRef): number | undefined {
  const entry = INDICATOR_WARMUP.find(
    (w) =>
      w.ref.id === ref.id &&
      JSON.stringify(sortedParams(w.ref.params)) === JSON.stringify(sortedParams(ref.params)),
  );
  return entry?.needs;
}

function sortedParams(params: Record<string, ParamValue> | undefined): Array<[string, ParamValue]> {
  return Object.entries(params ?? {}).sort(([a], [b]) => a.localeCompare(b));
}

/**
 * The candle from which a condition reading these indicators may be asserted.
 *
 * `needs × 3` is the convention the cross-path work uses and the one FEAT-0438
 * is sized against: short series make seeding drift indistinguishable from a
 * genuine cross, which is exactly the failure BUG-0430 describes. An unknown
 * reference contributes nothing rather than silently contributing zero — the
 * caller is expected to reject it.
 */
export const WARMUP_SAFETY_FACTOR = 3;

export function assertableFrom(refs: IndicatorRef[]): number {
  let deepest = 0;
  for (const ref of refs) {
    const needs = warmupFor(ref);
    if (needs === undefined) throw new Error(`no warmup entry for ${ref.id} ${JSON.stringify(ref.params)}`);
    if (needs > deepest) deepest = needs;
  }
  return deepest * WARMUP_SAFETY_FACTOR;
}
